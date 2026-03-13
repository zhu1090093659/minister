// Feishu OAuth 2.0 authentication routes.
// Flow: /feishu-url → Feishu authorize page → /callback → JWT cookie → redirect to app
import { Hono, type Context } from "hono";
import { config, writeFeishuToken } from "@minister/shared";
import { createToken, setTokenCookie, authMiddleware } from "../middleware/auth.js";

const auth = new Hono();

// Feishu OAuth endpoints
const FEISHU_AUTHORIZE_URL = "https://open.feishu.cn/open-apis/authen/v1/authorize";
const FEISHU_APP_TOKEN_URL = "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal";
const FEISHU_USER_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v1/oidc/access_token";
const FEISHU_USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info";

// GET /api/v1/auth/feishu-url — return the Feishu OAuth authorization URL
auth.get("/feishu-url", (c) => {
  const base = config.admin.baseUrl || getOrigin(c);
  const redirectUri = c.req.query("redirect_uri") || `${base}/api/v1/auth/callback`;
  const state = c.req.query("state");
  const stateParam = state ? `&state=${encodeURIComponent(state)}` : "";
  const url = `${FEISHU_AUTHORIZE_URL}?app_id=${config.feishu.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code${stateParam}`;
  return c.json({ url, redirectUri });
});

// GET /api/v1/auth/callback — exchange code for user token, set JWT cookie, redirect to app
auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") || "admin";
  if (!code) return c.json({ error: "Missing code parameter" }, 400);

  try {
    // Step 1: Get app_access_token
    const appTokenRes = await fetch(FEISHU_APP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret }),
    });
    const appTokenData = await appTokenRes.json() as any;
    if (appTokenData.code !== 0) {
      return c.json({ error: "Failed to get app token", detail: appTokenData.msg }, 500);
    }
    const appAccessToken = appTokenData.app_access_token;

    // Step 2: Exchange code for user_access_token
    const userTokenRes = await fetch(FEISHU_USER_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${appAccessToken}`,
      },
      body: JSON.stringify({ grant_type: "authorization_code", code }),
    });
    const userTokenData = await userTokenRes.json() as any;
    if (userTokenData.code !== 0) {
      return c.json({ error: "Failed to exchange code", detail: userTokenData.msg }, 500);
    }
    const userToken = userTokenData.data;
    const userAccessToken = userToken.access_token;

    // Step 3: Get user info
    const userInfoRes = await fetch(FEISHU_USER_INFO_URL, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    });
    const userInfoData = await userInfoRes.json() as any;
    if (userInfoData.code !== 0) {
      return c.json({ error: "Failed to get user info", detail: userInfoData.msg }, 500);
    }

    const { open_id, name, avatar_url } = userInfoData.data;
    const now = Math.floor(Date.now() / 1000);
    writeFeishuToken(open_id, {
      access_token: userAccessToken,
      refresh_token: String(userToken.refresh_token || ""),
      expires_at: now + Number(userToken.expires_in || 0),
      refresh_expires_at: now + Number(userToken.refresh_expires_in || 0),
    });

    if (state === "bot") {
      return c.html(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>授权成功</title></head><body><p>授权成功，请返回飞书继续对话。</p></body></html>`);
    }

    // Step 4: Issue JWT and set cookie
    const token = await createToken({ openId: open_id, name, avatarUrl: avatar_url });
    setTokenCookie(c, token);

    console.log("[Admin Auth] OAuth success for", name, "— redirecting to /");

    // Use HTML redirect instead of 302 to guarantee Set-Cookie header is processed
    // (some Hono/Bun combos may not preserve setCookie headers on c.redirect())
    return c.html(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=/"></head><body></body></html>`);
  } catch (err) {
    console.error("[Admin Auth] OAuth callback error:", err);
    return c.json({ error: "OAuth callback failed" }, 500);
  }
});

// GET /api/v1/auth/me — return current user info (requires auth)
auth.get("/me", authMiddleware, (c) => {
  const user = c.get("user");
  return c.json({ openId: user.openId, name: user.name, avatarUrl: user.avatarUrl });
});

function getOrigin(c: Context): string {
  const proto = c.req.header("X-Forwarded-Proto") || "http";
  const host = c.req.header("Host") || `localhost:${config.admin.port}`;
  return `${proto}://${host}`;
}

export { auth };
