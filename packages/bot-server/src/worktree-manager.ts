// Manage per-user worktree directories — isolated CWD for each user's AI engine session.
// Each worktree contains memory files, settings, and skills for both Claude Code and Codex.
import { resolve } from "node:path";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { config, PROJECT_ROOT } from "@minister/shared";

// Parameterized memory templates — Claude and Codex share the same structure,
// differing only in the agent label used in HTML comments.

function userMemoryTemplate(agent: string): string {
  return `# User Memory

<!-- Auto-maintained by ${agent}. Records personal preferences, habits, and recurring instructions. -->

## Writing Rules

- When the user explicitly states a preference or recurring instruction (e.g. "remember I like..."), write it here
- Read existing content before writing to avoid duplicates
- Only record preferences and instructions — not conversation content or temporary info

## Skills

<!-- Personal skills live in .claude/skills/<name>/SKILL.md — each directory is a skill invoked with /{name}. -->
`;
}

function groupMemoryTemplate(agent: string): string {
  const cap = agent.charAt(0).toUpperCase() + agent.slice(1);
  return `# Group Workspace

<!-- Shared memory for this group chat. Auto-maintained by ${agent}. -->

## Group Conventions

<!-- ${cap} will record group-level agreements here. Example:

- We use OKR format for goal tracking
- All meeting notes go into the shared Bitable
-->

## Skills

<!-- Group skills live in .claude/skills/<name>/SKILL.md — each directory is a skill invoked with /{name}. -->
`;
}

const DEFAULT_USER_CLAUDE_MD = userMemoryTemplate("Claude");
const DEFAULT_GROUP_CLAUDE_MD = groupMemoryTemplate("Claude");
const DEFAULT_USER_AGENTS_MD = userMemoryTemplate("the AI assistant");
const DEFAULT_GROUP_AGENTS_MD = groupMemoryTemplate("the AI assistant");

// AGENTS.override.md template — system prompt wrapper for Codex (read-only, highest priority)
function buildAgentsOverrideMd(systemPrompt: string): string {
  return `${systemPrompt}

---

## Workspace Structure

- User memory is stored in \`AGENTS.md\` — you may read and update it to record user preferences
- Skills are stored in \`.claude/skills/<name>/SKILL.md\` — check there for available skills
- **DO NOT modify this file (AGENTS.override.md)** — it contains system instructions
`;
}

// Read config/config.toml and append feishu MCP server definition for per-worktree use
function buildCodexConfigToml(): string {
  const tomlPath = resolve(PROJECT_ROOT, "config/config.toml");
  let content = existsSync(tomlPath) ? readFileSync(tomlPath, "utf-8") : "";

  const mcpPath = resolve(PROJECT_ROOT, "packages/feishu-mcp/src/index.ts");
  const normalizedPath = mcpPath.replace(/\\/g, "/");

  content += [
    "",
    "[mcp_servers.feishu]",
    `type = "stdio"`,
    `command = "bun"`,
    `args = ["run", "${normalizedPath}"]`,
    "",
    "[mcp_servers.feishu.env]",
    `FEISHU_APP_ID = "${config.feishu.appId}"`,
    `FEISHU_APP_SECRET = "${config.feishu.appSecret}"`,
    "",
  ].join("\n");

  return content;
}

interface UserSettings {
  permissions: { deny: string[] };
}

// Derive parent data directory (contains both worktrees/ and users/)
const DATA_DIR = resolve(config.worktreeDir, "..");

// Permission deny rules built once from config — prevents cross-user data discovery via file tools
const USER_SETTINGS: UserSettings = {
  permissions: {
    deny: [
      `Read(${config.worktreeDir}/)`,
      `Read(${config.userDataDir}/)`,
      `Bash(ls ${DATA_DIR}*)`,
      `Bash(find ${DATA_DIR}*)`,
      "Bash(ls /root*)",
    ],
  },
};

// Cache deploy-mutable content — computed once per process, reused for all worktrees
const CACHED_CODEX_TOML = buildCodexConfigToml();
const CACHED_AGENTS_OVERRIDE = buildAgentsOverrideMd(config.systemPrompt);
const CACHED_SETTINGS_JSON = JSON.stringify(USER_SETTINGS, null, 2) + "\n";

// Refresh files that may change between deploys (called for both new and existing worktrees)
function refreshDeployFiles(worktreePath: string): void {
  // .codex/config.toml — per-worktree MCP config for Codex
  const codexDir = resolve(worktreePath, ".codex");
  mkdirSync(codexDir, { recursive: true });
  writeFileSync(resolve(codexDir, "config.toml"), CACHED_CODEX_TOML, { mode: 0o600 });

  // AGENTS.override.md — system prompt for Codex (set read-only to deter model edits)
  const overridePath = resolve(worktreePath, "AGENTS.override.md");
  if (existsSync(overridePath)) chmodSync(overridePath, 0o600);
  writeFileSync(overridePath, CACHED_AGENTS_OVERRIDE, { mode: 0o444 });

  // settings.json — permission deny-rules (security: new deny rules must propagate)
  const settingsPath = resolve(worktreePath, ".claude/settings.json");
  writeFileSync(settingsPath, CACHED_SETTINGS_JSON, { mode: 0o600 });
}

// Built-in skill: background knowledge for workspace management (auto-loaded by Claude when relevant)
const WORKSPACE_GUIDE_SKILL = `---
name: workspace-guide
description: Background knowledge for workspace customization — creating skills, installing MCP servers, managing preferences. Auto-loaded when users ask about customization.
user-invocable: false
---

# Workspace Management

## Creating Skills for Users

When a user asks to create a skill (e.g. "make me a weekly report skill"), use the Claude Code skill format:

1. Confirm the skill name (lowercase English, hyphens OK, e.g. \`weekly-report\`)
2. Create \`.claude/skills/{name}/SKILL.md\` with YAML frontmatter:

\`\`\`yaml
---
name: {name}
description: Brief description of what this skill does and when to use it
---

[Detailed natural-language instructions, templates, or workflows]
\`\`\`

3. Tell user: "Skill /{name} has been created and is available immediately."

### Frontmatter options

- \`description\`: Helps Claude auto-discover and invoke the skill when relevant
- \`disable-model-invocation: true\`: Only user can trigger via /{name}, Claude won't auto-invoke
- \`allowed-tools\`: Tools allowed without per-use permission when skill is active
- \`argument-hint\`: Autocomplete hint, e.g. \`[issue-number]\`

### Arguments

Use \`$ARGUMENTS\` in SKILL.md content. When user runs \`/fix-issue 123\`, \`$ARGUMENTS\` becomes \`123\`.

### Supporting files

A skill directory can include extra files (templates, examples, scripts). Reference them from SKILL.md.

## Installing MCP Servers

1. Read \`.claude/settings.json\`
2. Add/update \`mcpServers\` field — **preserve existing \`permissions\` field**
3. Write back complete JSON
4. Tell user: "MCP installed. Start a new conversation for it to take effect."

Common servers:

| Service | command | args | env |
|---------|---------|------|-----|
| GitHub | npx | ["-y", "@modelcontextprotocol/server-github"] | GITHUB_PERSONAL_ACCESS_TOKEN |
| Filesystem | npx | ["-y", "@modelcontextprotocol/server-filesystem", "/path"] | — |
| Fetch | npx | ["-y", "@modelcontextprotocol/server-fetch"] | — |
`;

// Track initialized users in memory to avoid per-request filesystem stat in the hot path
const initializedUsers = new Set<string>();

// Ensure the user's worktree directory is initialized and return its absolute path.
// Creates the directory structure on first call; subsequent calls use the in-memory cache.
export function ensureUserWorktree(userId: string): string {
  // Guard against path traversal — [\w\-:] excludes all path separators and dots
  if (!/^[\w\-:]{1,200}$/.test(userId)) {
    throw new Error(`Invalid userId format: ${userId}`);
  }

  const worktreePath = resolve(config.worktreeDir, userId);

  // Memory fast path: skip filesystem stat on subsequent calls within this process
  if (initializedUsers.has(userId)) return worktreePath;

  const settingsPath = resolve(worktreePath, ".claude/settings.json");

  if (!existsSync(settingsPath)) {
    // First visit — initialize directory structure (skills dir + default skill)
    const guideDir = resolve(worktreePath, ".claude/skills/workspace-guide");
    mkdirSync(guideDir, { recursive: true });

    // Write the built-in workspace-guide skill
    writeFileSync(resolve(guideDir, "SKILL.md"), WORKSPACE_GUIDE_SKILL, { mode: 0o600 });

    // Feishu group chat IDs start with "oc_", user IDs start with "ou_"
    const isGroup = userId.startsWith("oc_");

    // Migrate legacy CLAUDE.md if it exists, otherwise write default template
    const legacyPath = resolve(config.userDataDir, userId, "CLAUDE.md");
    const claudeMdPath = resolve(worktreePath, "CLAUDE.md");

    if (existsSync(legacyPath)) {
      const content = readFileSync(legacyPath, "utf-8");
      writeFileSync(claudeMdPath, content, { mode: 0o600 });
      // Rename so migration does not run again on the next restart
      renameSync(legacyPath, legacyPath + ".migrated");
      console.log(`[worktree] Migrated legacy CLAUDE.md for user ${userId}`);
    } else {
      writeFileSync(claudeMdPath, isGroup ? DEFAULT_GROUP_CLAUDE_MD : DEFAULT_USER_CLAUDE_MD, { mode: 0o600 });
    }

    // AGENTS.md — user-editable memory for Codex (mirrors CLAUDE.md purpose)
    const agentsMdPath = resolve(worktreePath, "AGENTS.md");
    writeFileSync(agentsMdPath, isGroup ? DEFAULT_GROUP_AGENTS_MD : DEFAULT_USER_AGENTS_MD, { mode: 0o600 });

    console.log(`[worktree] Initialized worktree for user ${userId} at ${worktreePath}`);
  }

  // Refresh deploy-mutable files on every first-visit-per-process (both new and existing)
  refreshDeployFiles(worktreePath);

  // Cache so future calls skip the stat
  initializedUsers.add(userId);
  return worktreePath;
}
