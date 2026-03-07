// P0: Task tools — create, update, query, complete + tasklist management
import { larkClient } from "../client.js";
import { toUnixSeconds, unknownToolError } from "../utils.js";
import type { ToolResult } from "@minister/shared";

export const taskToolDefs = [
  {
    name: "task_create",
    description:
      "Create a task in Feishu. Can assign members and set due date.",
    inputSchema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        due: {
          type: "string",
          description:
            "Due date timestamp in seconds (e.g. '1741651200'). Can also be ISO date string which will be auto-converted.",
        },
        members: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Member open_id or user_id" },
              id_type: {
                type: "string",
                enum: ["open_id", "user_id"],
                description: "ID type, default open_id",
              },
              role: {
                type: "string",
                enum: ["assignee", "follower"],
                description: "Role, default assignee",
              },
            },
            required: ["id"],
          },
          description: "Task members (assignees / followers)",
        },
        tasklist_id: {
          type: "string",
          description: "Tasklist ID to add this task into",
        },
      },
      required: ["summary"],
    },
  },
  {
    name: "task_update",
    description: "Update an existing task (summary, description, due, etc).",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task GUID" },
        summary: { type: "string", description: "New task title" },
        description: { type: "string", description: "New task description" },
        due: { type: "string", description: "New due timestamp in seconds" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "task_query",
    description:
      "List tasks. Can filter by tasklist. Returns up to 50 tasks.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page_size: { type: "number", description: "Max tasks to return (default 50)" },
        completed: { type: "boolean", description: "If set, filter completed (true) or incomplete (false) tasks" },
      },
    },
  },
  {
    name: "task_complete",
    description: "Mark a task as completed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task GUID to complete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "tasklist_create",
    description: "Create a new tasklist (task group).",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Tasklist name" },
      },
      required: ["name"],
    },
  },
];

export async function handleTaskTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "task_create": {
      const members = args.members as
        | Array<{ id: string; id_type?: string; role?: string }>
        | undefined;
      const due = args.due ? toUnixSeconds(args.due as string) : undefined;

      const res = await larkClient.task.v2.task.create({
        data: {
          summary: args.summary as string,
          description: (args.description as string) || undefined,
          due: due ? { timestamp: due, is_all_day: false } : undefined,
          members: members?.map((m) => ({
            id: m.id,
            type: (m.id_type as "open_id" | "user_id") || "open_id",
            role: m.role || "assignee",
          })),
          origin: {
            platform_i18n_name: { zh_cn: "丞相AI", en_us: "Minister AI" },
          },
        },
      });

      const taskId = res.data?.task?.guid;

      // Optionally add to tasklist
      if (taskId && args.tasklist_id) {
        await larkClient.task.v2.task.addTasklist({
          path: { task_guid: taskId },
          data: { tasklist_guid: args.tasklist_id as string },
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `Task created. guid: ${taskId}, summary: ${args.summary}`,
          },
        ],
      };
    }

    case "task_update": {
      const updateData: Record<string, unknown> = {};
      const updateFields: string[] = [];
      if (args.summary) {
        updateData.summary = args.summary;
        updateFields.push("summary");
      }
      if (args.description) {
        updateData.description = args.description;
        updateFields.push("description");
      }
      if (args.due) {
        updateData.due = {
          timestamp: toUnixSeconds(args.due as string),
          is_all_day: false,
        };
        updateFields.push("due");
      }

      await larkClient.task.v2.task.patch({
        path: { task_guid: args.task_id as string },
        data: {
          task: updateData as any,
          update_fields: updateFields,
        },
      });
      return {
        content: [
          { type: "text", text: `Task ${args.task_id} updated: ${updateFields.join(", ")}` },
        ],
      };
    }

    case "task_query": {
      const res = await larkClient.task.v2.task.list({
        params: {
          page_size: (args.page_size as number) || 50,
          completed: args.completed !== undefined ? String(args.completed) : undefined,
        },
      });
      const tasks = (res.data?.items ?? []).map((t) => ({
        guid: t.guid,
        summary: t.summary,
        completed_at: t.completed_at,
        due: t.due,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
      };
    }

    case "task_complete": {
      await larkClient.task.v2.task.complete({
        path: { task_guid: args.task_id as string },
      });
      return {
        content: [
          { type: "text", text: `Task ${args.task_id} marked as completed.` },
        ],
      };
    }

    case "tasklist_create": {
      const res = await larkClient.task.v2.tasklist.create({
        data: { name: args.name as string },
      });
      return {
        content: [
          {
            type: "text",
            text: `Tasklist created. guid: ${res.data?.tasklist?.guid}, name: ${args.name}`,
          },
        ],
      };
    }

    default:
      return unknownToolError(name);
  }
}
