// Copy config/config.toml to ~/.codex/config.toml and append MCP server definitions.
// Run before bot startup in Docker to apply Codex CLI configuration.
// Only needed when ENGINE_TYPE=codex (read from .env or system environment).

import { resolve, dirname } from "node:path";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../packages/shared/src/env.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");

loadEnvFile(resolve(PROJECT_ROOT, ".env"));

const engineType = process.env.ENGINE_TYPE || "claude";
if (engineType !== "codex") {
  console.log("[generate-codex-config] ENGINE_TYPE is not codex, skipping");
  process.exit(0);
}

// Read the user-maintained config.toml (model, provider, etc.)
const sourceToml = resolve(PROJECT_ROOT, "config/config.toml");
if (!existsSync(sourceToml)) {
  console.error("[generate-codex-config] config/config.toml not found — skipping");
  process.exit(1);
}
let content = readFileSync(sourceToml, "utf-8");

// Append MCP server: feishu (using env vars for credentials)
const mcpPath = resolve(PROJECT_ROOT, "packages/feishu-mcp/src/index.ts");
const normalizedPath = mcpPath.replace(/\\/g, "/");
const feishuAppId = process.env.FEISHU_APP_ID || "";
const feishuAppSecret = process.env.FEISHU_APP_SECRET || "";

const mcpSection = [
  "",
  "# --- MCP servers (auto-appended by generate-codex-config) ---",
  "",
  "[mcp_servers.feishu]",
  `type = "stdio"`,
  `command = "bun"`,
  `args = ["run", "${normalizedPath}"]`,
];

if (feishuAppId || feishuAppSecret) {
  mcpSection.push("");
  mcpSection.push("[mcp_servers.feishu.env]");
  if (feishuAppId) mcpSection.push(`FEISHU_APP_ID = "${feishuAppId}"`);
  if (feishuAppSecret) mcpSection.push(`FEISHU_APP_SECRET = "${feishuAppSecret}"`);
}

mcpSection.push("");
content += mcpSection.join("\n");

// Write to ~/.codex/config.toml
const configDir = resolve(homedir(), ".codex");
mkdirSync(configDir, { recursive: true });
const configPath = resolve(configDir, "config.toml");
writeFileSync(configPath, content, { mode: 0o600 });

console.log("[generate-codex-config] Written", configPath);
