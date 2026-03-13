// P1: Calendar tools — create event, query events, freebusy
import { larkClient } from "../client.js";
import { toUnixSeconds, unknownToolError } from "../utils.js";
import type { ToolResult } from "@minister/shared";
import type { LarkRequestOptions } from "../user-token.js";

// Cache the Promise itself so concurrent callers share a single in-flight request
let primaryCalendarIdPromise: Promise<string> | undefined;

function getPrimaryCalendarId(): Promise<string> {
  if (!primaryCalendarIdPromise) {
    primaryCalendarIdPromise = (async () => {
      const calList = await larkClient.calendar.v4.calendar.list({});
      const cals = calList.data?.calendar_list;
      if (cals?.length) {
        const owned = cals.find((c) => c.role === "owner");
        const writable = cals.find((c) => c.role === "writer");
        return (owned || writable || cals[0]).calendar_id!;
      }
      return "primary";
    })();
  }
  return primaryCalendarIdPromise;
}

export const calendarToolDefs = [
  {
    name: "cal_create_event",
    description:
      "Create a calendar event in the primary calendar. Can invite attendees.",
    inputSchema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event description" },
        start_time: {
          type: "string",
          description: "Start time (Unix timestamp in seconds or ISO string)",
        },
        end_time: {
          type: "string",
          description: "End time (Unix timestamp in seconds or ISO string)",
        },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used to find their primary calendar",
        },
        attendees: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["user", "chat", "resource"],
                description: "Attendee type",
              },
              user_id: { type: "string", description: "User open_id" },
              chat_id: {
                type: "string",
                description: "Chat ID (for group events)",
              },
            },
          },
          description: "Event attendees",
        },
      },
      required: ["summary", "start_time", "end_time", "user_open_id"],
    },
  },
  {
    name: "cal_query_events",
    description: "Query calendar events within a time range.",
    inputSchema: {
      type: "object" as const,
      properties: {
        calendar_id: {
          type: "string",
          description: "Calendar ID (default: primary)",
        },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        start_time: {
          type: "string",
          description: "Range start (Unix timestamp in seconds)",
        },
        end_time: {
          type: "string",
          description: "Range end (Unix timestamp in seconds)",
        },
      },
      required: ["start_time", "end_time", "user_open_id"],
    },
  },
  {
    name: "cal_freebusy",
    description:
      "Query free/busy status for one or more users within a time range.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        user_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of user open_ids to query",
        },
        start_time: {
          type: "string",
          description: "Range start (Unix timestamp in seconds)",
        },
        end_time: {
          type: "string",
          description: "Range end (Unix timestamp in seconds)",
        },
      },
      required: ["user_ids", "start_time", "end_time", "user_open_id"],
    },
  },
];

export async function handleCalendarTool(
  name: string,
  args: Record<string, unknown>,
  larkOptions?: LarkRequestOptions,
): Promise<ToolResult> {
  switch (name) {
    case "cal_create_event": {
      const userOpenId = args.user_open_id as string | undefined;
      const extraAttendees = args.attendees as
        | Array<{ type?: string; user_id?: string; chat_id?: string }>
        | undefined;

      const startTs = toUnixSeconds(args.start_time as string);
      const endTs = toUnixSeconds(args.end_time as string);

      const calendarId = larkOptions
        ? "primary"
        : await getPrimaryCalendarId();

      const res = await larkClient.calendar.v4.calendarEvent.create({
        path: { calendar_id: calendarId },
        data: {
          summary: args.summary as string,
          description: (args.description as string) || undefined,
          start_time: { timestamp: startTs },
          end_time: { timestamp: endTs },
          attendee_ability: "can_modify_event",
        },
      }, larkOptions);

      const eventId = res.data?.event?.event_id;

      // With user identity the event already belongs to the requester,
      // so only add explicitly requested attendees.
      if (eventId) {
        const allAttendees: Array<{ type: "user" | "chat" | "resource"; user_id?: string; chat_id?: string }> = [];
        if (userOpenId && !larkOptions) {
          allAttendees.push({ type: "user", user_id: userOpenId });
        }
        if (extraAttendees?.length) {
          for (const a of extraAttendees) {
            allAttendees.push({
              type: (a.type as "user" | "chat" | "resource") || "user",
              user_id: a.user_id,
              chat_id: a.chat_id,
            });
          }
        }
        if (allAttendees.length > 0) {
          await larkClient.calendar.v4.calendarEventAttendee.create({
            path: { calendar_id: calendarId, event_id: eventId },
            params: { user_id_type: "open_id" },
            data: { attendees: allAttendees },
          }, larkOptions);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Event created. event_id: ${eventId}, summary: ${args.summary}`,
          },
        ],
      };
    }

    case "cal_query_events": {
      const calendarId = (args.calendar_id as string) || "primary";
      const res = await larkClient.calendar.v4.calendarEvent.list({
        path: { calendar_id: calendarId },
        params: {
          start_time: toUnixSeconds(args.start_time as string),
          end_time: toUnixSeconds(args.end_time as string),
          page_size: 50,
        },
      }, larkOptions);
      const events = (res.data?.items ?? []).map((e) => ({
        event_id: e.event_id,
        summary: e.summary,
        start_time: e.start_time,
        end_time: e.end_time,
        status: e.status,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
      };
    }

    case "cal_freebusy": {
      const userIds = args.user_ids as string[];
      // SDK types define user_id as string, but the actual API accepts an object
      // with { user_ids: string[], id_type: string } for batch querying.
      const res = await larkClient.calendar.v4.freebusy.list({
        data: {
          time_min: toUnixSeconds(args.start_time as string),
          time_max: toUnixSeconds(args.end_time as string),
          user_id: { user_ids: userIds, id_type: "open_id" } as any,
        },
      }, larkOptions);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(res.data?.freebusy_list ?? [], null, 2),
          },
        ],
      };
    }

    default:
      return unknownToolError(name);
  }
}
