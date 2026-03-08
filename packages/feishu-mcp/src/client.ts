// Feishu SDK client singleton
import * as Lark from "@larksuiteoapi/node-sdk";
import { config } from "@minister/shared";

// Redirect all Lark SDK logs to stderr — stdout is reserved for the MCP stdio transport.
// Without this, the SDK's "[info]: [ "client ready" ]" line corrupts the JSON-RPC stream
// and causes Codex CLI's rmcp to fail with "serde error expected value".
const stderrLogger: Lark.Logger = {
  error: (...msg: unknown[]) => console.error("[lark]", ...msg),
  warn:  (...msg: unknown[]) => console.error("[lark]", ...msg),
  info:  (...msg: unknown[]) => console.error("[lark]", ...msg),
  debug: (...msg: unknown[]) => console.error("[lark]", ...msg),
  trace: (...msg: unknown[]) => console.error("[lark]", ...msg),
};

export const larkClient = new Lark.Client({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
  logger: stderrLogger,
});
