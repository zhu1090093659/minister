// Personal configuration API routes — /api/v1/user/*
import { Hono } from "hono";
import {
  readAdminConfig,
  writeAdminConfig,
  readClaudeMd,
  writeClaudeMd,
  listSkills,
  readSkill,
  writeSkill,
  deleteSkill,
  readSettingsJson,
  maskMcpSecrets,
  resolveSystemPrompt,
  resolveAdminMcpServers,
  config,
} from "@minister/shared";
import type { AdminConfig, McpServerConfig } from "@minister/shared";

const userRoutes = new Hono();

// ---------------------------------------------------------------------------
// Config overview
// ---------------------------------------------------------------------------

userRoutes.get("/config", (c) => {
  const userId = c.get("user").openId;
  const adminCfg = readAdminConfig(userId);
  const settings = readSettingsJson(userId);
  const skills = listSkills(userId, adminCfg);

  // Effective system prompt source
  const hasCustomPrompt = !!adminCfg?.systemPrompt;
  const effectivePrompt = resolveSystemPrompt(config.systemPrompt, userId, undefined, { userCfg: adminCfg });

  // MCP servers: merge admin-managed + settings.json (from AI)
  const adminMcp = adminCfg?.mcpServers ?? {};
  const settingsMcp = (settings as any).mcpServers ?? {};

  return c.json({
    userId,
    prompt: {
      source: hasCustomPrompt ? "user" : "system",
      value: effectivePrompt.slice(0, 200) + (effectivePrompt.length > 200 ? "..." : ""),
    },
    mcpServers: {
      adminManaged: maskMcpSecrets(adminMcp),
      aiInstalled: maskMcpSecrets(settingsMcp),
    },
    skills: skills.map(({ name, description, enabled, isBuiltin }) => ({ name, description, enabled, isBuiltin })),
    memory: { exists: !!readClaudeMd(userId) },
  });
});

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

userRoutes.get("/prompt", (c) => {
  const userId = c.get("user").openId;
  const adminCfg = readAdminConfig(userId);
  return c.json({
    customPrompt: adminCfg?.systemPrompt ?? null,
    defaultPrompt: config.systemPrompt,
    source: adminCfg?.systemPrompt ? "user" : "system",
  });
});

userRoutes.put("/prompt", async (c) => {
  const userId = c.get("user").openId;
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt || typeof prompt !== "string") return c.json({ error: "prompt is required" }, 400);

  const cfg = readAdminConfig(userId) ?? { type: "user", updatedAt: "" };
  cfg.systemPrompt = prompt;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(userId, cfg as AdminConfig);

  return c.json({ ok: true });
});

userRoutes.delete("/prompt", (c) => {
  const userId = c.get("user").openId;
  const cfg = readAdminConfig(userId);
  if (cfg) {
    cfg.systemPrompt = null;
    cfg.updatedAt = new Date().toISOString();
    cfg.updatedBy = userId;
    writeAdminConfig(userId, cfg);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

userRoutes.get("/mcp", (c) => {
  const userId = c.get("user").openId;
  const cfg = readAdminConfig(userId);
  const servers = cfg?.mcpServers ?? {};
  return c.json({ servers: maskMcpSecrets(servers) });
});

userRoutes.put("/mcp/:name", async (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  if (!/^[\w\-]{1,100}$/.test(name)) return c.json({ error: "Invalid server name" }, 400);

  const body = await c.req.json<McpServerConfig>();
  if (!body.type) return c.json({ error: "type is required (stdio | sse | http)" }, 400);

  const cfg = readAdminConfig(userId) ?? { type: "user" as const, updatedAt: "" };
  if (!cfg.mcpServers) cfg.mcpServers = {};
  cfg.mcpServers[name] = { ...body, enabled: body.enabled ?? true };
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(userId, cfg as AdminConfig);

  return c.json({ ok: true });
});

userRoutes.delete("/mcp/:name", (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  const cfg = readAdminConfig(userId);
  if (cfg?.mcpServers) {
    delete cfg.mcpServers[name];
    cfg.updatedAt = new Date().toISOString();
    cfg.updatedBy = userId;
    writeAdminConfig(userId, cfg);
  }
  return c.json({ ok: true });
});

userRoutes.post("/mcp/:name/test", async (c) => {
  // Basic connectivity test for MCP servers
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  const cfg = readAdminConfig(userId);
  const srv = cfg?.mcpServers?.[name];
  if (!srv) return c.json({ error: "Server not found" }, 404);

  if (srv.type === "sse" || srv.type === "http") {
    try {
      const res = await fetch(srv.url!, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      return c.json({ ok: true, status: res.status });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message });
    }
  }

  // For stdio, we just verify the command exists
  if (srv.type === "stdio" && srv.command) {
    try {
      const proc = Bun.spawn(["which", srv.command], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      return c.json({ ok: proc.exitCode === 0, detail: proc.exitCode === 0 ? "Command found" : "Command not found" });
    } catch (err: any) {
      return c.json({ ok: false, error: err.message });
    }
  }

  return c.json({ ok: false, error: "Cannot test this server type" });
});

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

userRoutes.get("/skills", (c) => {
  const userId = c.get("user").openId;
  const skills = listSkills(userId);
  return c.json({
    skills: skills.map(({ name, description, enabled, isBuiltin }) => ({ name, description, enabled, isBuiltin })),
  });
});

userRoutes.get("/skills/:name", (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  const content = readSkill(userId, name);
  if (content === null) return c.json({ error: "Skill not found" }, 404);

  const adminCfg = readAdminConfig(userId);
  const enabled = adminCfg?.skillOverrides?.[name] ?? true;

  return c.json({ name, content, enabled });
});

userRoutes.put("/skills/:name", async (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  if (!/^[\w\-]{1,100}$/.test(name)) return c.json({ error: "Invalid skill name" }, 400);

  const { content } = await c.req.json<{ content: string }>();
  if (!content) return c.json({ error: "content is required" }, 400);

  writeSkill(userId, name, content);
  return c.json({ ok: true });
});

userRoutes.delete("/skills/:name", (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  try {
    deleteSkill(userId, name);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

userRoutes.patch("/skills/:name/toggle", async (c) => {
  const userId = c.get("user").openId;
  const name = c.req.param("name");
  const { enabled } = await c.req.json<{ enabled: boolean }>();

  const cfg = readAdminConfig(userId) ?? { type: "user" as const, updatedAt: "" };
  if (!cfg.skillOverrides) cfg.skillOverrides = {};
  cfg.skillOverrides[name] = enabled;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(userId, cfg as AdminConfig);

  return c.json({ ok: true, enabled });
});

// ---------------------------------------------------------------------------
// Memory (CLAUDE.md)
// ---------------------------------------------------------------------------

userRoutes.get("/memory", (c) => {
  const userId = c.get("user").openId;
  return c.json({ content: readClaudeMd(userId) });
});

userRoutes.put("/memory", async (c) => {
  const userId = c.get("user").openId;
  const { content } = await c.req.json<{ content: string }>();
  if (typeof content !== "string") return c.json({ error: "content is required" }, 400);
  writeClaudeMd(userId, content);
  return c.json({ ok: true });
});

export { userRoutes };
