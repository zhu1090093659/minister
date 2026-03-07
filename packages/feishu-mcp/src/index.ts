// Feishu MCP Server entry point
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ToolResult } from "@minister/shared";
import { messageToolDefs, handleMessageTool } from "./tools/message.js";
import { taskToolDefs, handleTaskTool } from "./tools/task.js";
import { contactToolDefs, handleContactTool } from "./tools/contact.js";
import { bitableToolDefs, handleBitableTool } from "./tools/bitable.js";
import { documentToolDefs, handleDocumentTool } from "./tools/document.js";
import { calendarToolDefs, handleCalendarTool } from "./tools/calendar.js";

const allTools = [
  ...messageToolDefs,
  ...taskToolDefs,
  ...contactToolDefs,
  ...bitableToolDefs,
  ...documentToolDefs,
  ...calendarToolDefs,
];

// Build a router map: tool name -> handler function
const toolModules: Array<{
  defs: typeof messageToolDefs;
  handler: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
}> = [
  { defs: messageToolDefs, handler: handleMessageTool },
  { defs: taskToolDefs, handler: handleTaskTool },
  { defs: contactToolDefs, handler: handleContactTool },
  { defs: bitableToolDefs, handler: handleBitableTool },
  { defs: documentToolDefs, handler: handleDocumentTool },
  { defs: calendarToolDefs, handler: handleCalendarTool },
];

const toolHandlers = new Map<
  string,
  (args: Record<string, unknown>) => Promise<ToolResult>
>();
for (const { defs, handler } of toolModules) {
  for (const def of defs) toolHandlers.set(def.name, (a) => handler(def.name, a));
}

const server = new Server(
  { name: "feishu-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = toolHandlers.get(name);
  if (!handler) {
    return {
      content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }
  try {
    return await handler((args ?? {}) as Record<string, unknown>);
  } catch (err: unknown) {
    // Dump full error for debugging Feishu API issues
    let detail: string;
    try {
      detail = JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2);
    } catch {
      detail = err instanceof Error ? err.message : String(err);
    }
    return {
      content: [{ type: "text" as const, text: `Error calling ${name}: ${detail}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
