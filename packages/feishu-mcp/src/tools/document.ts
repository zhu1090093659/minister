// P1: Document tools — create, read, update
import { larkClient } from "../client.js";
import { unknownToolError } from "../utils.js";
import { markdownToBlocks } from "../markdown-parser.js";
import type { ToolResult } from "@minister/shared";

export const documentToolDefs = [
  {
    name: "doc_create",
    description: "Create a new Feishu document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Document title" },
        folder_token: {
          type: "string",
          description: "Folder token to create in (optional)",
        },
        owner_open_id: {
          type: "string",
          description: "User open_id to transfer document ownership to",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "doc_read",
    description: "Read content of a Feishu document by document_id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_id: { type: "string", description: "Document ID" },
      },
      required: ["document_id"],
    },
  },
  {
    name: "doc_update",
    description:
      "Append content to a Feishu document. Content is provided as an array of block operations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_id: { type: "string", description: "Document ID" },
        content: {
          type: "string",
          description:
            "Markdown-like text content to append. Will be converted to document blocks.",
        },
      },
      required: ["document_id", "content"],
    },
  },
];

export async function handleDocumentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "doc_create": {
      const res = await larkClient.docx.v1.document.create({
        data: {
          title: args.title as string,
          folder_token: (args.folder_token as string) || undefined,
        },
      });
      const doc = res.data?.document;
      const docToken = doc?.document_id;

      // Transfer ownership to the requesting user
      if (docToken && args.owner_open_id) {
        await larkClient.drive.v1.permissionMember.transferOwner({
          path: { token: docToken },
          params: { type: "docx", need_notification: false },
          data: {
            member_type: "openid",
            member_id: args.owner_open_id as string,
          },
        });
      }

      return {
        content: [
          {
            type: "text",
            text: `Document created. document_id: ${docToken}, title: ${doc?.title}`,
          },
        ],
      };
    }

    case "doc_read": {
      const res = await larkClient.docx.v1.document.rawContent({
        path: { document_id: args.document_id as string },
      });
      return {
        content: [
          { type: "text", text: res.data?.content || "(empty document)" },
        ],
      };
    }

    case "doc_update": {
      // Parse markdown into structured Feishu document blocks
      const content = args.content as string;
      const children = markdownToBlocks(content);
      await larkClient.docx.v1.documentBlockChildren.create({
        path: {
          document_id: args.document_id as string,
          block_id: args.document_id as string, // root block ID equals document ID
        },
        data: {
          children: children as any,
          index: -1,
        },
      });
      return {
        content: [
          {
            type: "text",
            text: `Content appended to document ${args.document_id}.`,
          },
        ],
      };
    }

    default:
      return unknownToolError(name);
  }
}
