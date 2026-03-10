// Admin panel Hono app — creates the HTTP application with all routes mounted.
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { PROJECT_ROOT } from "@minister/shared";
import { auth } from "./routes/auth.js";
import { userRoutes } from "./routes/user.js";
import { groupRoutes } from "./routes/groups.js";
import { systemRoutes } from "./routes/system.js";
import { authMiddleware } from "./middleware/auth.js";

const ADMIN_UI_DIST = resolve(PROJECT_ROOT, "packages/admin-ui/dist");

export function createAdminApp(): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", logger());
  app.use("/api/*", cors());

  // Public routes (no auth required)
  app.route("/api/v1/auth", auth);

  // Protected routes (require JWT)
  app.use("/api/v1/user/*", authMiddleware);
  app.use("/api/v1/groups/*", authMiddleware);
  app.use("/api/v1/system/*", authMiddleware);

  app.route("/api/v1/user", userRoutes);
  app.route("/api/v1/groups", groupRoutes);
  app.route("/api/v1/system", systemRoutes);

  // Serve admin-ui static assets (JS, CSS, images)
  app.use("/assets/*", serveStatic({ root: ADMIN_UI_DIST }));

  // SPA fallback — serve index.html for all non-API routes (client-side routing)
  app.get("*", (c) => {
    const indexPath = resolve(ADMIN_UI_DIST, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      return c.html(html);
    }
    return c.html(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Minister Admin</title></head>
<body>
  <h1>Minister Admin Panel</h1>
  <p>Admin UI is not built yet. Run <code>bun run admin:build</code> to build the frontend.</p>
</body>
</html>`);
  });

  return app;
}
