#!/bin/sh
set -e

# Generate .claude/settings.json from env vars before starting the bot
bun run scripts/generate-claude-settings.ts

# Generate ~/.codex/config.toml when ENGINE_TYPE=codex
bun run scripts/generate-codex-config.ts

# Start the bot server
exec bun run packages/bot-server/src/index.ts
