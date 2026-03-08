// Generate .claude/settings.json from environment variables.
// Run before bot startup in Docker to apply user configuration.

import { resolve, dirname } from "node:path";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../packages/shared/src/env.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const SETTINGS_PATH = resolve(PROJECT_ROOT, ".claude/settings.json");

// Load env files — .env first (higher priority), then claude.env for defaults
loadEnvFile(resolve(PROJECT_ROOT, ".env"));
loadEnvFile(resolve(PROJECT_ROOT, "config/claude.env"));

// Read existing settings.json as base template
let settings: Record<string, unknown> = {};
if (existsSync(SETTINGS_PATH)) {
  settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
}

// Build the env block for settings.json from CLAUDE_* and ANTHROPIC_* env vars
const envKeys = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "ANTHROPIC_DEFAULT_SONNET_MODEL",
  "ANTHROPIC_DEFAULT_OPUS_MODEL",
  "ANTHROPIC_REASONING_MODEL",
  "CLAUDE_MODEL",
  "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
  "BASH_DEFAULT_TIMEOUT_MS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
];

const envBlock: Record<string, string> = {};
for (const key of envKeys) {
  const val = process.env[key];
  if (val && val !== "" && !val.startsWith("your_")) {
    envBlock[key] = val;
  }
}

if (Object.keys(envBlock).length > 0) {
  settings.env = { ...(settings.env as Record<string, string> || {}), ...envBlock };
}

// Map CLAUDE_SETTINGS_* env vars to top-level settings.json fields
const settingsMap: Record<string, string> = {
  CLAUDE_SETTINGS_LANGUAGE: "language",
  CLAUDE_SETTINGS_INCLUDE_COAUTHORED_BY: "includeCoAuthoredBy",
};

for (const [envKey, settingsKey] of Object.entries(settingsMap)) {
  const val = process.env[envKey];
  if (val === undefined || val === "") continue;
  if (val === "true") settings[settingsKey] = true;
  else if (val === "false") settings[settingsKey] = false;
  else settings[settingsKey] = val;
}

// Map CLAUDE_SETTINGS_PERMISSIONS_ALLOW to permissions.allow array
const permAllow = process.env.CLAUDE_SETTINGS_PERMISSIONS_ALLOW;
if (permAllow) {
  const perms = settings.permissions as Record<string, unknown> || {};
  perms.allow = permAllow.split(",").map((s) => s.trim()).filter(Boolean);
  settings.permissions = perms;
}

// Resolve ${VAR} references in mcpServers.*.env using current process.env
const mcpServers = settings.mcpServers as Record<string, Record<string, unknown>> | undefined;
if (mcpServers) {
  for (const server of Object.values(mcpServers)) {
    const serverEnv = server.env as Record<string, string> | undefined;
    if (!serverEnv) continue;
    for (const [k, v] of Object.entries(serverEnv)) {
      if (typeof v === "string") {
        serverEnv[k] = v.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] || "");
      }
    }
  }
}

// Write output
mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");

console.log("[generate-claude-settings] Written", SETTINGS_PATH);
