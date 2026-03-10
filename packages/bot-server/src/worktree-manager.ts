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

  // settings.json — merge permissions into existing file to preserve user-installed mcpServers.
  // Previous behavior was full overwrite, which wiped any MCP configs added via AI conversation.
  const settingsPath = resolve(worktreePath, ".claude/settings.json");
  let merged: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try { merged = JSON.parse(readFileSync(settingsPath, "utf-8")); } catch { /* corrupt file, reset */ }
  }
  merged.permissions = USER_SETTINGS.permissions;
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });

  // Built-in skills — refresh on each deploy so existing users get new/updated skills
  for (const [name, content] of BUILTIN_SKILLS) {
    const dir = resolve(worktreePath, `.claude/skills/${name}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "SKILL.md"), content, { mode: 0o600 });
  }
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

// Built-in skill: best practices for creating and managing Feishu Bitable (multi-dimensional tables)
const FEISHU_BITABLE_SKILL = `---
name: feishu-bitable
description: 飞书多维表格操作最佳实践指南 — 创建、配置字段、写入数据的完整流程。当用户要求创建表格、数据统计或信息汇总时自动加载。
---

# 飞书多维表格操作指南

## 核心流程

创建新的多维表格项目：
\`\`\`
bitable_create_app → bitable_create_table → bitable_create_record
\`\`\`

### 步骤一：创建 Bitable 应用

调用 bitable_create_app，传入 name（应用名称）。返回值中包含 app_token 和 default_table_id。

### 步骤二：创建数据表格

调用 bitable_create_table，传入 app_token、name（表格名称）和 fields（字段定义数组）。

字段类型对照表：
- 1: 文本 (Text)
- 2: 数字 (Number)
- 3: 单选 (SingleSelect)
- 4: 多选 (MultiSelect)
- 5: 日期时间 (DateTime)
- 7: 复选框 (Checkbox)
- 11: 用户 (User)
- 13: 电话 (Phone)
- 15: 链接 (URL)
- 22: 位置 (Location)

### 步骤三：添加记录数据

调用 bitable_create_record，传入 app_token、table_id 和 fields（{字段名: 值} 对象）。

## 关键注意事项

1. API 成功不代表界面立即显示 — 飞书多维表格存在数据同步延迟（通常 1-5 分钟），告知用户需要等待或刷新页面。
2. 字段名一致性 — update 时字段名必须与创建时完全一致，推荐简洁命名，避免特殊字符。
3. 批量操作 — 避免一次性创建过多记录，分批添加并逐步验证。

## 操作模板

### 创建完整的数据表格
1. 创建应用 (bitable_create_app)
2. 创建表格并定义字段结构 (bitable_create_table)
3. 添加示例数据验证结构正确 (bitable_create_record)
4. 批量添加真实数据
5. 查询确认最终结果 (bitable_query)
6. 提供给用户访问链接

### 更新现有记录
1. 先查询获取 record_id (bitable_query)
2. 使用 bitable_update_record 更新
3. 再次查询确认更新成功

### 查询数据
- page_size: 控制返回数量（默认 20，最大 50）
- filter: 使用过滤表达式筛选数据
- sort: 设置排序规则
`;

// All built-in skills — written/refreshed on every deploy for both new and existing worktrees
const BUILTIN_SKILLS: ReadonlyArray<[name: string, content: string]> = [
  ["workspace-guide", WORKSPACE_GUIDE_SKILL],
  ["feishu-bitable", FEISHU_BITABLE_SKILL],
];

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
    // First visit — initialize directory structure
    mkdirSync(resolve(worktreePath, ".claude/skills"), { recursive: true });

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
