// Common types shared across packages

export interface Session {
  userId: string;
  chatId?: string;
  conversationId?: string;
  createdAt: number;
  lastActiveAt: number;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface FeishuUserToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  refresh_expires_at: number;
}

// ---------------------------------------------------------------------------
// Admin configuration — stored in data/worktrees/{id}/admin-config.json
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  type: "stdio" | "sse" | "http";
  command?: string;                 // stdio only
  args?: string[];                  // stdio only
  url?: string;                     // sse / http
  headers?: Record<string, string>; // sse / http
  env?: Record<string, string>;     // stdio
  enabled: boolean;
}

export interface GroupBehavior {
  requireMention: boolean;          // Must @bot to trigger (default: true)
  allowAutoToolExec: boolean;       // Allow auto tool execution (default: true)
  memberWhitelist?: string[];       // Allowed member open_ids (empty = all)
}

export interface AdminConfig {
  type: "user" | "group";

  // Custom system prompt (null/undefined = use global default)
  systemPrompt?: string | null;

  // Group-specific behavior control (only meaningful when type = "group")
  groupBehavior?: GroupBehavior;

  // MCP servers managed via admin UI
  mcpServers?: Record<string, McpServerConfig>;

  // Skill enable/disable overrides (skill name -> enabled)
  skillOverrides?: Record<string, boolean>;

  updatedAt: string;    // ISO timestamp
  updatedBy?: string;   // open_id of last editor
}

// Skill metadata parsed from SKILL.md YAML frontmatter
export interface SkillInfo {
  name: string;
  description?: string;
  enabled: boolean;       // derived from AdminConfig.skillOverrides
  isBuiltin: boolean;     // built-in vs user-created
  content: string;        // raw SKILL.md content
}
