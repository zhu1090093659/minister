// Bot Server entry point — WebSocket long-connection to Feishu + Admin HTTP server
import * as Lark from "@larksuiteoapi/node-sdk";
import { config } from "@minister/shared";
import { handleMessage } from "./message-handler.js";
import { createAdminApp } from "./admin/index.js";

// ---------------------------------------------------------------------------
// 1. Start Admin HTTP server (Hono)
// ---------------------------------------------------------------------------

const adminApp = createAdminApp();
const adminPort = config.admin.port;

Bun.serve({ fetch: adminApp.fetch, port: adminPort });
console.log(`[Admin] HTTP server listening on http://localhost:${adminPort}`);

// ---------------------------------------------------------------------------
// 2. Start Feishu WebSocket client
// ---------------------------------------------------------------------------

const wsClient = new Lark.WSClient({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  loggerLevel: Lark.LoggerLevel.info,
});

console.log("[Minister] Starting bot server...");

wsClient.start({
  eventDispatcher: new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
      try {
        await handleMessage(data as any);
      } catch (err) {
        console.error("[Minister] Message handler error:", err);
      }
    },
  }),
});

console.log("[Minister] Bot server started. Listening for messages...");
