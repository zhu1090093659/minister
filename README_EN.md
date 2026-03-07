# Minister

> Plug Claude Code into Feishu. Give your team a capable colleague that actually does things.

**[中文](./README.md)**

---

Minister is a Feishu AI assistant framework built on Claude Code, designed for teams. It's not another chatbot — it's a colleague that lives inside Feishu, capable of sending messages, creating tasks, writing documents, scheduling events, and operating Bitable on your behalf. You say it, it does it.

Works for a ten-person team splitting the busywork, or a solo founder who needs a capable partner. Either way, it fits.

Minister maintains dedicated memory for each team member. Tell it "I like my weekly reports in three sections", and it remembers — just for you. Everyone's preferences stay separate, persisting across sessions and restarts.

Under the hood, Minister exposes Feishu APIs to Claude Code via MCP (Model Context Protocol), giving the AI real execution power beyond text generation. Written in TypeScript, powered by Bun, deployable with a single Docker command.

---

### What is Minister?

Minister is an open-source Feishu AI assistant framework. Mention it in a group chat or DM, and the Claude behind it understands your intent and acts: sends messages, creates tasks, writes docs, schedules events, queries Bitable. Not a wall of text for you to act on — it handles things for you.

Technically, Minister exposes Feishu APIs to Claude via MCP, receives messages over a WebSocket long-connection, and displays real-time progress through streaming cards. The project is organized as a TypeScript monorepo, powered by Bun, and deployable with a single Docker command.

### Architecture

```
packages/
  shared/        Shared types and configuration
  bot-server/    Feishu chatbot server (WebSocket long-connection)
  feishu-mcp/    MCP tool server exposing Feishu APIs to Claude
```

The bot server receives Feishu messages, spawns a Claude CLI subprocess with streaming JSON output, and renders real-time progress through interactive cards. Sessions are managed per user with a 30-minute TTL, supporting conversation continuity via Claude's `--resume` flag.

### Per-User Memory

Each user gets an isolated memory folder at `data/users/{open_id}/`, where Claude autonomously maintains a personal `CLAUDE.md` file. When a user expresses preferences, habits, or standing instructions (e.g. "remember I prefer Markdown reports"), Claude writes them to this file. On subsequent conversations — even after session expiry or service restarts — the stored preferences are automatically loaded into the system prompt, giving Claude persistent, cross-session knowledge of each user.

### MCP Tools

The MCP server provides six tool categories for Claude to interact with Feishu:

| Category | Tools | Description |
|----------|-------|-------------|
| Message | `msg_send`, `msg_reply`, `msg_read_history` | Send, reply, read chat history |
| Task | `task_create`, `task_update`, `task_complete`, `task_query`, `tasklist_create` | Full task lifecycle management |
| Contact | `contact_search`, `contact_get_user` | Search users, get user profiles |
| Bitable | `bitable_create_app`, `bitable_create_record`, `bitable_query`, `bitable_update_record` | Multi-dimensional table operations |
| Document | `doc_create`, `doc_read`, `doc_update` | Document CRUD |
| Calendar | `cal_create_event`, `cal_query_events`, `cal_freebusy` | Calendar events and availability |

### Prerequisites

- [Bun](https://bun.sh/) v1.x
- A Feishu custom app (from [open.feishu.cn](https://open.feishu.cn))
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code) installed (automatically installed in Docker)
- An Anthropic API key

### Feishu App Setup

Create a custom app on the [Feishu Open Platform](https://open.feishu.cn), then configure it in the Events & Callbacks page:

1. **Subscription mode**: Select "Receive events through persistent connection" (WebSocket). Do NOT use HTTP callback.
2. **Subscribe to events**: Add `im.message.receive_v1` (Receive messages).
3. **Permissions**: Grant the API scopes required by the MCP tools (messaging, tasks, contacts, calendar, docs, bitable). A full list is in `config/feishu-permissions.json`.

### Quick Start

1. Clone and install dependencies:

```bash
git clone <repo-url> minister
cd minister
bun install
```

2. Configure environment:

```bash
cp config/.env.example .env
cp config/claude.env.example config/claude.env
# Edit both files with your credentials
```

`.env` holds Feishu credentials:

```
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
```

`config/claude.env` holds all Claude Code settings — API key, base URL, model, proxy, and `settings.json` overrides. See `config/claude.env.example` for the full list.

3. Generate `.claude/settings.json` (optional for local, automatic in Docker):

```bash
bun run generate-settings
```

4. Run:

```bash
bun run bot     # Start bot server
bun run mcp     # Start MCP server (used by Claude CLI internally)
```

### Docker Deployment

```bash
docker compose up -d
```

The Docker image is built on `oven/bun:1-debian`, with Claude CLI installed at build time. On container startup, `.claude/settings.json` is auto-generated from `config/claude.env` and `.env`, so all Claude Code behavior (API endpoint, model, proxy, permissions, etc.) can be controlled purely through environment variables.

### Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Feishu SDK**: @larksuiteoapi/node-sdk
- **MCP SDK**: @modelcontextprotocol/sdk
- **Validation**: Zod

---

## License

MIT
