// P1: Bitable (multi-dimensional table) tools
import { larkClient } from "../client.js";
import { unknownToolError } from "../utils.js";
import type { ToolResult } from "@minister/shared";
import type { LarkRequestOptions } from "../user-token.js";

export const bitableToolDefs = [
  {
    name: "bitable_create_app",
    description: "Create a new Bitable (multi-dimensional spreadsheet) app.",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Bitable app name" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        folder_token: {
          type: "string",
          description: "Folder token to create in (optional)",
        },
      },
      required: ["name", "user_open_id"],
    },
  },
  {
    name: "bitable_create_record",
    description: "Create a record (row) in a Bitable table.",
    inputSchema: {
      type: "object" as const,
      properties: {
        app_token: { type: "string", description: "Bitable app token" },
        table_id: { type: "string", description: "Table ID" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        fields: {
          type: "object",
          description:
            "Field name-value pairs. e.g. { '任务名称': 'Do X', '状态': '进行中' }",
        },
      },
      required: ["app_token", "table_id", "fields", "user_open_id"],
    },
  },
  {
    name: "bitable_query",
    description:
      "Query records from a Bitable table. Supports filter and sort.",
    inputSchema: {
      type: "object" as const,
      properties: {
        app_token: { type: "string", description: "Bitable app token" },
        table_id: { type: "string", description: "Table ID" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        filter: {
          type: "string",
          description:
            'Filter expression, e.g. AND(CurrentValue.[状态]="进行中")',
        },
        sort: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_name: { type: "string" },
              desc: { type: "boolean" },
            },
          },
          description: "Sort conditions",
        },
        page_size: { type: "number", description: "Max records (default 20)" },
      },
      required: ["app_token", "table_id", "user_open_id"],
    },
  },
  {
    name: "bitable_update_record",
    description: "Update an existing record in a Bitable table.",
    inputSchema: {
      type: "object" as const,
      properties: {
        app_token: { type: "string", description: "Bitable app token" },
        table_id: { type: "string", description: "Table ID" },
        record_id: { type: "string", description: "Record ID to update" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        fields: {
          type: "object",
          description: "Field name-value pairs to update",
        },
      },
      required: ["app_token", "table_id", "record_id", "fields", "user_open_id"],
    },
  },
  {
    name: "bitable_create_table",
    description:
      "Create a new data table with custom fields (columns) inside a Bitable app.",
    inputSchema: {
      type: "object" as const,
      properties: {
        app_token: { type: "string", description: "Bitable app token" },
        name: { type: "string", description: "Table name" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field_name: { type: "string", description: "Field/column name" },
              type: {
                type: "number",
                description:
                  "Field type: 1=Text, 2=Number, 3=SingleSelect, 4=MultiSelect, 5=DateTime, 7=Checkbox, 11=User, 13=Phone, 15=Url, 22=Location",
              },
            },
            required: ["field_name", "type"],
          },
          description: "Array of field definitions for the table columns",
        },
      },
      required: ["app_token", "name", "fields", "user_open_id"],
    },
  },
  {
    name: "bitable_list_tables",
    description: "List all data tables in a Bitable app to get their table IDs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        app_token: { type: "string", description: "Bitable app token" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
      },
      required: ["app_token", "user_open_id"],
    },
  },
];

export async function handleBitableTool(
  name: string,
  args: Record<string, unknown>,
  larkOptions?: LarkRequestOptions,
): Promise<ToolResult> {
  switch (name) {
    case "bitable_create_app": {
      const res = await larkClient.bitable.v1.app.create({
        data: {
          name: args.name as string,
          folder_token: (args.folder_token as string) || undefined,
        },
      }, larkOptions);
      const app = res.data?.app;
      return {
        content: [
          {
            type: "text",
            text: `Bitable created. app_token: ${app?.app_token}, default_table_id: ${app?.default_table_id}, name: ${app?.name}, url: ${app?.url}`,
          },
        ],
      };
    }

    case "bitable_create_record": {
      const res = await larkClient.bitable.v1.appTableRecord.create({
        path: {
          app_token: args.app_token as string,
          table_id: args.table_id as string,
        },
        data: { fields: args.fields as any },
      }, larkOptions);
      return {
        content: [
          {
            type: "text",
            text: `Record created. record_id: ${res.data?.record?.record_id}`,
          },
        ],
      };
    }

    case "bitable_query": {
      const res = await larkClient.bitable.v1.appTableRecord.list({
        path: {
          app_token: args.app_token as string,
          table_id: args.table_id as string,
        },
        params: {
          filter: (args.filter as string) || undefined,
          sort: args.sort ? JSON.stringify(args.sort) : undefined,
          page_size: (args.page_size as number) || 20,
        },
      }, larkOptions);
      const records = (res.data?.items ?? []).map((r) => ({
        record_id: r.record_id,
        fields: r.fields,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(records, null, 2) }],
      };
    }

    case "bitable_update_record": {
      await larkClient.bitable.v1.appTableRecord.update({
        path: {
          app_token: args.app_token as string,
          table_id: args.table_id as string,
          record_id: args.record_id as string,
        },
        data: { fields: args.fields as any },
      }, larkOptions);
      return {
        content: [
          {
            type: "text",
            text: `Record ${args.record_id} updated successfully.`,
          },
        ],
      };
    }

    case "bitable_create_table": {
      const fields = args.fields as Array<{
        field_name: string;
        type: number;
      }>;
      const res = await larkClient.bitable.v1.appTable.create({
        path: { app_token: args.app_token as string },
        data: {
          table: {
            name: args.name as string,
            fields: fields.map((f) => ({
              field_name: f.field_name,
              type: f.type,
            })),
          },
        },
      }, larkOptions);
      return {
        content: [
          {
            type: "text",
            text: `Table created. table_id: ${res.data?.table_id}, fields: ${(res.data?.field_id_list ?? []).join(", ")}`,
          },
        ],
      };
    }

    case "bitable_list_tables": {
      const res = await larkClient.bitable.v1.appTable.list({
        path: { app_token: args.app_token as string },
      }, larkOptions);
      const tables = (res.data?.items ?? []).map((t) => ({
        table_id: t.table_id,
        name: t.name,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(tables, null, 2) }],
      };
    }

    default:
      return unknownToolError(name);
  }
}
