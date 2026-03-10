// Group configuration API routes — /api/v1/groups/*
import { Hono } from "hono";
import {
  readAdminConfig,
  writeAdminConfig,
  listSkills,
  readSkill,
  writeSkill,
  deleteSkill,
  maskMcpSecrets,
  resolveSystemPrompt,
  config,
  getWorktreePath,
} from "@minister/shared";
import type { AdminConfig, McpServerConfig, GroupBehavior } from "@minister/shared";
import { existsSync, readdirSync } from "node:fs";

const groupRoutes = new Hono();

// ---------------------------------------------------------------------------
// List groups — scan worktree directories for oc_ prefixed dirs
// ---------------------------------------------------------------------------

groupRoutes.get("/", (c) => {
  // List all group worktrees (chatIds starting with oc_)
  try {
    const entries = readdirSync(config.worktreeDir);
    const groups = entries
      .filter((e) => e.startsWith("oc_"))
      .map((chatId) => {
        const cfg = readAdminConfig(chatId);
        return {
          chatId,
          hasConfig: !!cfg,
          promptSource: cfg?.systemPrompt ? "group" : "system",
          requireMention: cfg?.groupBehavior?.requireMention ?? true,
        };
      });
    return c.json({ groups });
  } catch {
    return c.json({ groups: [] });
  }
});

// ---------------------------------------------------------------------------
// Group config overview
// ---------------------------------------------------------------------------

groupRoutes.get("/:chatId/config", (c) => {
  const chatId = c.req.param("chatId");
  if (!chatId.startsWith("oc_")) return c.json({ error: "Invalid chatId format" }, 400);

  const userId = c.get("user").openId;
  const groupCfg = readAdminConfig(chatId);
  const userCfg = readAdminConfig(userId);
  const skills = listSkills(chatId, groupCfg);

  // Build inheritance chain visualization
  const effectivePrompt = resolveSystemPrompt(config.systemPrompt, userId, chatId, { userCfg, groupCfg });
  let promptSource: "system" | "user" | "group" = "system";
  if (groupCfg?.systemPrompt) promptSource = "group";
  else if (userCfg?.systemPrompt) promptSource = "user";

  const groupMcp = groupCfg?.mcpServers ?? {};
  const behavior = groupCfg?.groupBehavior ?? { requireMention: true, allowAutoToolExec: true };

  return c.json({
    chatId,
    prompt: {
      source: promptSource,
      value: effectivePrompt.slice(0, 200) + (effectivePrompt.length > 200 ? "..." : ""),
    },
    behavior,
    mcpServers: maskMcpSecrets(groupMcp),
    skills: skills.map(({ name, description, enabled, isBuiltin }) => ({ name, description, enabled, isBuiltin })),
    inheritance: {
      systemDefault: config.systemPrompt.slice(0, 100) + "...",
      userOverride: userCfg?.systemPrompt ? "set" : "none",
      groupOverride: groupCfg?.systemPrompt ? "set" : "none",
    },
  });
});

// ---------------------------------------------------------------------------
// Group system prompt
// ---------------------------------------------------------------------------

groupRoutes.put("/:chatId/prompt", async (c) => {
  const chatId = c.req.param("chatId");
  if (!chatId.startsWith("oc_")) return c.json({ error: "Invalid chatId" }, 400);

  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt || typeof prompt !== "string") return c.json({ error: "prompt is required" }, 400);

  const userId = c.get("user").openId;
  const cfg = readAdminConfig(chatId) ?? { type: "group" as const, updatedAt: "" };
  cfg.type = "group";
  cfg.systemPrompt = prompt;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(chatId, cfg as AdminConfig);

  return c.json({ ok: true });
});

groupRoutes.delete("/:chatId/prompt", (c) => {
  const chatId = c.req.param("chatId");
  const userId = c.get("user").openId;
  const cfg = readAdminConfig(chatId);
  if (cfg) {
    cfg.systemPrompt = null;
    cfg.updatedAt = new Date().toISOString();
    cfg.updatedBy = userId;
    writeAdminConfig(chatId, cfg);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Group behavior
// ---------------------------------------------------------------------------

groupRoutes.get("/:chatId/behavior", (c) => {
  const chatId = c.req.param("chatId");
  const cfg = readAdminConfig(chatId);
  return c.json({
    behavior: cfg?.groupBehavior ?? { requireMention: true, allowAutoToolExec: true, memberWhitelist: [] },
  });
});

groupRoutes.put("/:chatId/behavior", async (c) => {
  const chatId = c.req.param("chatId");
  if (!chatId.startsWith("oc_")) return c.json({ error: "Invalid chatId" }, 400);

  const { behavior } = await c.req.json<{ behavior: GroupBehavior }>();
  if (!behavior) return c.json({ error: "behavior is required" }, 400);

  const userId = c.get("user").openId;
  const cfg = readAdminConfig(chatId) ?? { type: "group" as const, updatedAt: "" };
  cfg.type = "group";
  cfg.groupBehavior = behavior;
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(chatId, cfg as AdminConfig);

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Group MCP servers
// ---------------------------------------------------------------------------

groupRoutes.get("/:chatId/mcp", (c) => {
  const chatId = c.req.param("chatId");
  const cfg = readAdminConfig(chatId);
  return c.json({ servers: maskMcpSecrets(cfg?.mcpServers ?? {}) });
});

groupRoutes.put("/:chatId/mcp/:name", async (c) => {
  const chatId = c.req.param("chatId");
  const name = c.req.param("name");
  if (!chatId.startsWith("oc_")) return c.json({ error: "Invalid chatId" }, 400);
  if (!/^[\w\-]{1,100}$/.test(name)) return c.json({ error: "Invalid server name" }, 400);

  const body = await c.req.json<McpServerConfig>();
  if (!body.type) return c.json({ error: "type is required" }, 400);

  const userId = c.get("user").openId;
  const cfg = readAdminConfig(chatId) ?? { type: "group" as const, updatedAt: "" };
  cfg.type = "group";
  if (!cfg.mcpServers) cfg.mcpServers = {};
  cfg.mcpServers[name] = { ...body, enabled: body.enabled ?? true };
  cfg.updatedAt = new Date().toISOString();
  cfg.updatedBy = userId;
  writeAdminConfig(chatId, cfg as AdminConfig);

  return c.json({ ok: true });
});

groupRoutes.delete("/:chatId/mcp/:name", (c) => {
  const chatId = c.req.param("chatId");
  const name = c.req.param("name");
  const userId = c.get("user").openId;
  const cfg = readAdminConfig(chatId);
  if (cfg?.mcpServers) {
    delete cfg.mcpServers[name];
    cfg.updatedAt = new Date().toISOString();
    cfg.updatedBy = userId;
    writeAdminConfig(chatId, cfg);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Group skills
// ---------------------------------------------------------------------------

groupRoutes.get("/:chatId/skills", (c) => {
  const chatId = c.req.param("chatId");
  const skills = listSkills(chatId);
  return c.json({
    skills: skills.map(({ name, description, enabled, isBuiltin }) => ({ name, description, enabled, isBuiltin })),
  });
});

groupRoutes.put("/:chatId/skills/:name", async (c) => {
  const chatId = c.req.param("chatId");
  const name = c.req.param("name");
  if (!chatId.startsWith("oc_")) return c.json({ error: "Invalid chatId" }, 400);
  if (!/^[\w\-]{1,100}$/.test(name)) return c.json({ error: "Invalid skill name" }, 400);

  const { content } = await c.req.json<{ content: string }>();
  if (!content) return c.json({ error: "content is required" }, 400);

  writeSkill(chatId, name, content);
  return c.json({ ok: true });
});

groupRoutes.delete("/:chatId/skills/:name", (c) => {
  const chatId = c.req.param("chatId");
  const name = c.req.param("name");
  try {
    deleteSkill(chatId, name);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 400);
  }
});

export { groupRoutes };
