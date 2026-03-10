// Shared worktree file I/O — read/write admin-config.json, CLAUDE.md, skills, settings.json.
// Used by both bot-server (runtime config resolution) and admin API routes.
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { config } from "./config.js";
import type { AdminConfig, SkillInfo } from "./types.js";

// Path validation — reuses the same pattern as worktree-manager.ts
const SAFE_ID = /^[\w\-:]{1,200}$/;

function validateId(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`Invalid id format: ${id}`);
}

export function getWorktreePath(id: string): string {
  validateId(id);
  return resolve(config.worktreeDir, id);
}

// ---------------------------------------------------------------------------
// admin-config.json
// ---------------------------------------------------------------------------

function adminConfigPath(id: string): string {
  return resolve(getWorktreePath(id), "admin-config.json");
}

export function readAdminConfig(id: string): AdminConfig | null {
  try {
    return JSON.parse(readFileSync(adminConfigPath(id), "utf-8")) as AdminConfig;
  } catch {
    return null;
  }
}

export function writeAdminConfig(id: string, cfg: AdminConfig): void {
  const dir = getWorktreePath(id);
  // Ensure worktree directory exists (group configs may be written before first message)
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "admin-config.json"), JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// CLAUDE.md (user memory)
// ---------------------------------------------------------------------------

export function readClaudeMd(id: string): string {
  try {
    return readFileSync(resolve(getWorktreePath(id), "CLAUDE.md"), "utf-8");
  } catch {
    return "";
  }
}

export function writeClaudeMd(id: string, content: string): void {
  const p = resolve(getWorktreePath(id), "CLAUDE.md");
  writeFileSync(p, content, { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// .claude/settings.json
// ---------------------------------------------------------------------------

export function readSettingsJson(id: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(resolve(getWorktreePath(id), ".claude/settings.json"), "utf-8"));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const BUILTIN_SKILL_NAMES = new Set(["workspace-guide", "feishu-bitable"]);

export function listSkills(id: string, adminCfg?: AdminConfig | null): SkillInfo[] {
  let entries: string[];
  const skillsDir = resolve(getWorktreePath(id), ".claude/skills");
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return [];
  }

  const overrides = (adminCfg === undefined ? readAdminConfig(id) : adminCfg)?.skillOverrides ?? {};
  const results: SkillInfo[] = [];

  for (const name of entries) {
    try {
      const content = readFileSync(resolve(skillsDir, name, "SKILL.md"), "utf-8");
      const description = parseSkillDescription(content);
      const isBuiltin = BUILTIN_SKILL_NAMES.has(name);
      const enabled = overrides[name] ?? true;
      results.push({ name, description, enabled, isBuiltin, content });
    } catch {
      // Skip entries without SKILL.md
    }
  }

  return results;
}

export function readSkill(id: string, name: string): string | null {
  validateId(name);
  try {
    return readFileSync(resolve(getWorktreePath(id), `.claude/skills/${name}/SKILL.md`), "utf-8");
  } catch {
    return null;
  }
}

export function writeSkill(id: string, name: string, content: string): void {
  validateId(name);
  const dir = resolve(getWorktreePath(id), `.claude/skills/${name}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "SKILL.md"), content, { mode: 0o600 });
}

export function deleteSkill(id: string, name: string): void {
  validateId(name);
  if (BUILTIN_SKILL_NAMES.has(name)) {
    throw new Error(`Cannot delete built-in skill: ${name}`);
  }
  const dir = resolve(getWorktreePath(id), `.claude/skills/${name}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Config resolution — merge admin configs for effective runtime config
// ---------------------------------------------------------------------------

export function resolveSystemPrompt(
  globalDefault: string,
  userId: string,
  chatId?: string,
  preloaded?: { userCfg?: AdminConfig | null; groupCfg?: AdminConfig | null },
): string {
  // Group config takes highest priority, then personal, then global
  if (chatId) {
    const groupCfg = preloaded?.groupCfg ?? readAdminConfig(chatId);
    if (groupCfg?.systemPrompt) return groupCfg.systemPrompt;
  }

  const userCfg = preloaded?.userCfg ?? readAdminConfig(userId);
  if (userCfg?.systemPrompt) return userCfg.systemPrompt;

  return globalDefault;
}

// Collect admin-managed MCP servers from personal + group configs.
// Returns a flat map of server name -> config (group overrides personal).
export function resolveAdminMcpServers(
  userId: string,
  chatId?: string,
): Record<string, { command?: string; args?: string[]; url?: string; headers?: Record<string, string>; env?: Record<string, string> }> {
  const merged: Record<string, any> = {};

  // Personal MCP servers
  const userCfg = readAdminConfig(userId);
  if (userCfg?.mcpServers) {
    for (const [name, srv] of Object.entries(userCfg.mcpServers)) {
      if (srv.enabled) merged[name] = srv;
    }
  }

  // Group MCP servers override personal
  if (chatId) {
    const groupCfg = readAdminConfig(chatId);
    if (groupCfg?.mcpServers) {
      for (const [name, srv] of Object.entries(groupCfg.mcpServers)) {
        if (srv.enabled) merged[name] = srv;
        else delete merged[name]; // explicitly disabled at group level
      }
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSkillDescription(content: string): string | undefined {
  // Parse YAML frontmatter: ---\n...\n---
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return undefined;
  const frontmatter = match[1];
  const descLine = frontmatter.split("\n").find((l) => l.startsWith("description:"));
  return descLine?.slice("description:".length).trim().replace(/^["']|["']$/g, "");
}

// Mask sensitive values for API responses — keep first 4 and last 4 chars
export function maskSensitiveValue(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "***" + value.slice(-4);
}

// Mask all env/header values in an MCP server config for safe API response
export function maskMcpSecrets(
  servers: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, srv] of Object.entries(servers)) {
    const masked = { ...srv };
    if (masked.env) {
      masked.env = Object.fromEntries(
        Object.entries(masked.env).map(([k, v]) => [k, maskSensitiveValue(String(v))]),
      );
    }
    if (masked.headers) {
      masked.headers = Object.fromEntries(
        Object.entries(masked.headers).map(([k, v]) => [k, maskSensitiveValue(String(v))]),
      );
    }
    result[name] = masked;
  }
  return result;
}
