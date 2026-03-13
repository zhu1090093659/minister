// P0: Contact tools — search user, get user info
import { larkClient } from "../client.js";
import { unknownToolError } from "../utils.js";
import type { ToolResult } from "@minister/shared";
import type { LarkRequestOptions } from "../user-token.js";

export const contactToolDefs = [
  {
    name: "contact_search",
    description:
      "Search for a user in the company directory by name or keyword.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search keyword (name, etc)" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        page_size: {
          type: "number",
          description: "Max results to return (default 10)",
        },
      },
      required: ["query", "user_open_id"],
    },
  },
  {
    name: "contact_get_user",
    description: "Get detailed user information by user_id or open_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_id: { type: "string", description: "User ID or Open ID" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        user_id_type: {
          type: "string",
          enum: ["open_id", "user_id", "union_id"],
          description: "ID type, default open_id",
        },
      },
      required: ["user_id", "user_open_id"],
    },
  },
];

export async function handleContactTool(
  name: string,
  args: Record<string, unknown>,
  larkOptions?: LarkRequestOptions,
): Promise<ToolResult> {
  switch (name) {
    case "contact_search": {
      // SDK types don't expose search.v2.user, but the API endpoint exists
      const res = await (larkClient as any).search.v2.user.create({
        params: {
          page_size: (args.page_size as number) || 10,
          user_id_type: "open_id",
        },
        data: { query: args.query as string },
      }, larkOptions);
      const users = (res.data?.items ?? []).map((u: any) => ({
        open_id: u.user_id,
        name: u.name,
        department: u.department?.name,
        avatar: u.avatar?.avatar_72,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
      };
    }

    case "contact_get_user": {
      const res = await larkClient.contact.v3.user.get({
        path: { user_id: args.user_id as string },
        params: {
          user_id_type:
            (args.user_id_type as "open_id" | "user_id" | "union_id") ||
            "open_id",
        },
      }, larkOptions);
      const u = res.data?.user;
      const info = {
        open_id: u?.open_id,
        user_id: u?.user_id,
        name: u?.name,
        en_name: u?.en_name,
        email: u?.email,
        mobile: u?.mobile,
        department_ids: u?.department_ids,
        status: u?.status,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      };
    }

    default:
      return unknownToolError(name);
  }
}
