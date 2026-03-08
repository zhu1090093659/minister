// Manage per-user worktree directories — isolated CWD for each user's Claude session.
// Each worktree contains CLAUDE.md (user memory) and .claude/settings.json (per-user config).
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { config } from "@minister/shared";

// Default CLAUDE.md for personal (private-chat) workspaces
const DEFAULT_USER_CLAUDE_MD = `# User Memory

<!-- Auto-maintained by Claude. Records personal preferences, habits, and recurring instructions. -->

## Writing Rules

- When the user explicitly states a preference or recurring instruction (e.g. "remember I like..."), write it here
- Read existing content before writing to avoid duplicates
- Only record preferences and instructions — not conversation content or temporary info

## Skills

<!-- Personal skills live in .claude/skills/<name>/SKILL.md — each directory is a skill invoked with /{name}. -->
`;

// Default CLAUDE.md for group chat workspaces — shared by all members of the chat
const DEFAULT_GROUP_CLAUDE_MD = `# Group Workspace

<!-- Shared memory for this group chat. Auto-maintained by Claude. -->

## Group Conventions

<!-- Claude will record group-level agreements here. Example:

- We use OKR format for goal tracking
- All meeting notes go into the shared Bitable
-->

## Skills

<!-- Group skills live in .claude/skills/<name>/SKILL.md — each directory is a skill invoked with /{name}. -->
`;

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
      // Feishu group chat IDs start with "oc_", user IDs start with "ou_"
      const isGroup = userId.startsWith("oc_");
      writeFileSync(claudeMdPath, isGroup ? DEFAULT_GROUP_CLAUDE_MD : DEFAULT_USER_CLAUDE_MD, { mode: 0o600 });
    }

    // Write per-user settings.json (permission deny-rules only, no credentials)
    writeFileSync(settingsPath, JSON.stringify(USER_SETTINGS, null, 2) + "\n", { mode: 0o600 });
    console.log(`[worktree] Initialized worktree for user ${userId} at ${worktreePath}`);
  }

  // Cache so future calls skip the stat
  initializedUsers.add(userId);
  return worktreePath;
}
