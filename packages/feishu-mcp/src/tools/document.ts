// P1: Document tools — create, read, update
import { larkClient } from "../client.js";
import { unknownToolError } from "../utils.js";
import {
  markdownToBlocks,
  isTableMarker,
  getTableData,
  buildCellTextBlock,
  BlockType,
} from "../markdown-parser.js";
import type { ToolResult } from "@minister/shared";
import type { LarkRequestOptions } from "../user-token.js";

export const documentToolDefs = [
  {
    name: "doc_create",
    description: "Create a new Feishu document.",
    inputSchema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Document title" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        folder_token: {
          type: "string",
          description: "Folder token to create in (optional)",
        },
      },
      required: ["title", "user_open_id"],
    },
  },
  {
    name: "doc_read",
    description:
      "Read content of a Feishu document. Accepts either a document_id or a Feishu document URL (e.g. https://xxx.feishu.cn/docx/TOKEN).",
    inputSchema: {
      type: "object" as const,
      properties: {
        document_id: { type: "string", description: "Document ID" },
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        url: {
          type: "string",
          description:
            "Feishu document URL. Supports /docx/, /docs/, and /wiki/ paths.",
        },
      },
      required: ["user_open_id"],
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
        user_open_id: {
          type: "string",
          description: "Requesting user's open_id, used for user identity access",
        },
        content: {
          type: "string",
          description:
            "Markdown-like text content to append. Will be converted to document blocks.",
        },
      },
      required: ["document_id", "content", "user_open_id"],
    },
  },
];

export async function handleDocumentTool(
  name: string,
  args: Record<string, unknown>,
  larkOptions?: LarkRequestOptions,
): Promise<ToolResult> {
  switch (name) {
    case "doc_create": {
      const res = await larkClient.docx.v1.document.create({
        data: {
          title: args.title as string,
          folder_token: (args.folder_token as string) || undefined,
        },
      }, larkOptions);
      const doc = res.data?.document;
      const docToken = doc?.document_id;
      const ownerOpenId =
        (args.user_open_id as string | undefined) ||
        (args.owner_open_id as string | undefined);

      // Only fall back to transferOwner when the document was created with app identity.
      if (docToken && ownerOpenId && !larkOptions) {
        await larkClient.drive.v1.permissionMember.transferOwner({
          path: { token: docToken },
          params: { type: "docx", need_notification: false },
          data: {
            member_type: "openid",
            member_id: ownerOpenId,
          },
        }, larkOptions);
      }

      return {
        content: [
          {
            type: "text",
            text: `Document created. document_id: ${docToken}, title: ${doc?.title}, url: https://feishu.cn/docx/${docToken}`,
          },
        ],
      };
    }

    case "doc_read": {
      let documentId = args.document_id as string | undefined;

      // Extract document_id from URL if provided
      if (!documentId && args.url) {
        const match = (args.url as string).match(
          /(?:feishu\.cn|larksuite\.com)\/(docx|docs|wiki)\/([A-Za-z0-9]+)/,
        );
        if (!match) {
          return {
            content: [{ type: "text", text: "Invalid Feishu document URL." }],
            isError: true,
          };
        }
        const [, docType, token] = match;
        if (docType === "wiki") {
          // Resolve wiki node token to actual document_id
          const nodeRes = await larkClient.wiki.v2.space.getNode({
            params: { token },
          }, larkOptions);
          documentId = nodeRes.data?.node?.obj_token;
          if (!documentId) {
            return {
              content: [{ type: "text", text: "Failed to resolve wiki document token." }],
              isError: true,
            };
          }
        } else {
          documentId = token;
        }
      }

      if (!documentId) {
        return {
          content: [{ type: "text", text: "Either document_id or url is required." }],
          isError: true,
        };
      }

      const res = await larkClient.docx.v1.document.rawContent({
        path: { document_id: documentId },
      }, larkOptions);
      return {
        content: [
          { type: "text", text: res.data?.content || "(empty document)" },
        ],
      };
    }

    case "doc_update": {
      const documentId = args.document_id as string;
      const content = args.content as string;
      const allBlocks = markdownToBlocks(content);

      // Split blocks into batches: regular blocks get created together,
      // table markers require multi-step API calls.
      let regularBatch: Record<string, unknown>[] = [];

      const flushRegular = async () => {
        if (regularBatch.length === 0) return;
        await larkClient.docx.v1.documentBlockChildren.create({
          path: { document_id: documentId, block_id: documentId },
          data: { children: regularBatch as any, index: -1 },
        }, larkOptions);
        regularBatch = [];
      };

      for (const block of allBlocks) {
        if (!isTableMarker(block)) {
          regularBatch.push(block);
          continue;
        }

        // Flush any accumulated regular blocks first
        await flushRegular();

        // Create table block via multi-step process
        const tableData = getTableData(block);
        const rowSize = tableData.rows.length + 1; // +1 for header row
        const columnSize = tableData.headers.length;

        // Step 1: Create the table block (cells are auto-generated)
        const tableRes =
          await larkClient.docx.v1.documentBlockChildren.create({
            path: { document_id: documentId, block_id: documentId },
            data: {
              children: [
                {
                  block_type: BlockType.Table,
                  table: {
                    property: {
                      row_size: rowSize,
                      column_size: columnSize,
                      header_row: true,
                    },
                  },
                },
              ] as any,
              index: -1,
            },
          }, larkOptions);

        // Step 2: Get the created table block and its cell children
        const tableBlock = tableRes.data?.children?.[0];
        const cellIds: string[] =
          (tableBlock as any)?.table?.cells ?? [];

        if (cellIds.length === 0) continue;

        // Step 3: Fill each cell with text content (parallel)
        // Cells are laid out row-by-row: [row0col0, row0col1, ..., row1col0, ...]
        const allCellTexts = [
          ...tableData.headers,
          ...tableData.rows.flat(),
        ];

        const cellTasks = cellIds
          .map((cellId, idx) => {
            const cellText = allCellTexts[idx];
            if (!cellText) return null;
            return larkClient.docx.v1.documentBlockChildren.create({
              path: { document_id: documentId, block_id: cellId },
              data: { children: [buildCellTextBlock(cellText)] as any, index: -1 },
            }, larkOptions);
          })
          .filter(Boolean);
        await Promise.all(cellTasks);
      }

      // Flush remaining regular blocks
      await flushRegular();

      return {
        content: [
          {
            type: "text",
            text: `Content appended to document ${documentId}.`,
          },
        ],
      };
    }

    default:
      return unknownToolError(name);
  }
}
