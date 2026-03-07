// Feishu REST API client singleton for bot-server
import * as Lark from "@larksuiteoapi/node-sdk";
import { config } from "@minister/shared";

export const larkClient = new Lark.Client({
  appId: config.feishu.appId,
  appSecret: config.feishu.appSecret,
  appType: Lark.AppType.SelfBuild,
  domain: Lark.Domain.Feishu,
});

// Fetch bot's own open_id once at startup; used to filter group-chat @mentions
async function fetchBotOpenId(): Promise<string | null> {
  try {
    const res = await larkClient.request<{
      code?: number;
      bot?: { open_id?: string };
    }>({ url: "/open-apis/bot/v3/info/", method: "GET" });
    const openId = res.bot?.open_id;
    if (!openId) throw new Error("open_id not found in response");
    console.log(`[Minister] Bot open_id: ${openId}`);
    return openId;
  } catch (err) {
    console.error("[Minister] Failed to fetch bot info:", err);
    return null;
  }
}

export const botOpenId: Promise<string | null> = fetchBotOpenId();
