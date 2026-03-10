// Load environment variables from .env and config/claude.env at project root
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "../../..");

// Load env files — .env first (higher priority), then claude.env for engine-specific defaults
loadEnvFile(resolve(PROJECT_ROOT, ".env"));
loadEnvFile(resolve(PROJECT_ROOT, "config/claude.env"));

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

function loadPromptFile(filename: string): string {
  return readFileSync(resolve(PROJECT_ROOT, "config", filename), "utf-8").trim();
}

const VALID_ENGINES = ["claude", "codex"] as const;
type EngineType = (typeof VALID_ENGINES)[number];

function validateEngine(value: string): EngineType {
  if (VALID_ENGINES.includes(value as EngineType)) return value as EngineType;
  throw new Error(`Invalid ENGINE_TYPE: "${value}" (expected: ${VALID_ENGINES.join(", ")})`);
}

export const config = {
  feishu: {
    appId: required("FEISHU_APP_ID"),
    appSecret: required("FEISHU_APP_SECRET"),
  },
  engine: validateEngine(process.env.ENGINE_TYPE || "claude"),
  systemPrompt: process.env.SYSTEM_PROMPT || loadPromptFile("system-prompt.md"),
  claude: {
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
  },
  // Codex configuration lives in config/config.toml (native TOML format).
  // No env-based config fields needed here — config.toml is copied directly
  // to ~/.codex/config.toml by scripts/generate-codex-config.ts at startup.
  userDataDir: resolve(PROJECT_ROOT, "data/users"),
  worktreeDir: resolve(PROJECT_ROOT, "data/worktrees"),

  // Admin panel HTTP server
  admin: {
    port: Number(process.env.ADMIN_PORT) || 3000,
    jwtSecret: process.env.ADMIN_JWT_SECRET || "minister-admin-default-secret",
  },
} as const;
