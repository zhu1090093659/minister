// P0: Message tools — send, reply, read history
import { larkClient } from "../client.js";
import { unknownToolError } from "../utils.js";
import type { ToolResult } from "@minister/shared";

export const messageToolDefs = [
  {
    name: "msg_send",
    description:
      "Send a message to a Feishu chat or user. Supports text and interactive card.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id. Ignored for bot-only messaging tools.",
        },
        receive_id: {
          type: "string",
          description: "Target ID (chat_id, open_id, or user_id)",
        },
        receive_id_type: {
          type: "string",
          enum: ["chat_id", "open_id", "user_id"],
          description: "Type of receive_id, default chat_id",
        },
        msg_type: {
          type: "string",
          enum: ["text", "interactive"],
          description: "Message type, default text",
        },
        content: {
          type: "string",
          description:
            "Message content. For text: plain string. For interactive: JSON string of card object.",
        },
      },
      required: ["receive_id", "content"],
    },
  },
  {
    name: "msg_reply",
    description: "Reply to a specific message by message_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id. Ignored for bot-only messaging tools.",
        },
        message_id: { type: "string", description: "ID of message to reply" },
        msg_type: {
          type: "string",
          enum: ["text", "interactive"],
          description: "Message type, default text",
        },
        content: { type: "string", description: "Reply content" },
      },
      required: ["message_id", "content"],
    },
  },
  {
    name: "msg_read_history",
    description:
      "Read recent messages from a chat. Returns up to 20 messages.",
    inputSchema: {
      type: "object" as const,
      properties: {
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id. Ignored for bot-only messaging tools.",
        },
        container_id: { type: "string", description: "Chat ID" },
        page_size: {
          type: "number",
          description: "Number of messages to return (max 50, default 20)",
        },
      },
      required: ["container_id"],
    },
  },
];

function textContent(content: string, msgType: string): string {
  if (msgType === "interactive") return content;
  return JSON.stringify({ text: content });
}

export async function handleMessageTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "msg_send": {
      const msgType = (args.msg_type as string) || "text";
      const res = await larkClient.im.v1.message.create({
        params: {
          receive_id_type:
            (args.receive_id_type as "chat_id" | "open_id" | "user_id") ||
            "chat_id",
        },
        data: {
          receive_id: args.receive_id as string,
          content: textContent(args.content as string, msgType),
          msg_type: msgType,
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `Message sent. message_id: ${res.data?.message_id}`,
          },
        ],
      };
    }

    case "msg_reply": {
      const msgType = (args.msg_type as string) || "text";
      const res = await larkClient.im.v1.message.reply({
        path: { message_id: args.message_id as string },
        data: {
          content: textContent(args.content as string, msgType),
          msg_type: msgType,
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `Reply sent. message_id: ${res.data?.message_id}`,
          },
        ],
      };
    }

    case "msg_read_history": {
      const res = await larkClient.im.v1.message.list({
        params: {
          container_id_type: "chat",
          container_id: args.container_id as string,
          page_size: (args.page_size as number) || 20,
        },
      });
      const items = (res.data?.items ?? []).map((m) => ({
        message_id: m.message_id,
        sender_id: m.sender?.id,
        msg_type: m.msg_type,
        content: m.body?.content,
        create_time: m.create_time,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    }

    default:
      return unknownToolError(name);
  }
}
