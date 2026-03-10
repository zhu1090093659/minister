// JWT authentication middleware for admin API.
// Extracts open_id from JWT in cookie or Authorization header.
import { createMiddleware } from "hono/factory";
import { sign, verify } from "hono/jwt";
import { getCookie, setCookie } from "hono/cookie";
import { config } from "@minister/shared";
import type { Context } from "hono";

const JWT_SECRET = config.admin.jwtSecret;
const COOKIE_NAME = "minister_token";
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days

export interface AuthUser {
  openId: string;
  name?: string;
  avatarUrl?: string;
}

// Extend Hono context with typed user
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

// Create a signed JWT for the given user
export async function createToken(user: AuthUser): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: user.openId, name: user.name, avatar: user.avatarUrl, iat: now, exp: now + TOKEN_EXPIRY_SECONDS },
    JWT_SECRET,
  );
}

// Set JWT as HttpOnly cookie on the response
export function setTokenCookie(c: Context, token: string): void {
  setCookie(c, COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: TOKEN_EXPIRY_SECONDS,
  });
}

// Auth middleware — require valid JWT; sets c.get("user")
export const authMiddleware = createMiddleware(async (c, next) => {
  const token = extractToken(c);
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, JWT_SECRET);
    c.set("user", {
      openId: payload.sub as string,
      name: payload.name as string | undefined,
      avatarUrl: payload.avatar as string | undefined,
    });
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
});

function extractToken(c: Context): string | null {
  // Try Authorization header first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);

  // Fall back to cookie
  return getCookie(c, COOKIE_NAME) ?? null;
}
