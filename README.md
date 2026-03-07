# Minister / 丞相

> 把 Claude Code 塞进飞书，给你的团队加一个全能同事。

丞相是一个基于 Claude Code 的飞书 AI 助手框架，为企业团队打造。它不是又一个聊天机器人——它是一个住在飞书里的同事，能直接帮你发消息、建任务、写文档、排日程、操作多维表格，说完就办，不用你再动手。

十人团队用它分担杂活，一人公司拿它当全能搭档，都合适。

丞相为每位同事维护专属记忆。你说过"我的周报喜欢分三段写"，它就记住了，下次直接照做。张三的习惯是张三的，李四的偏好是李四的，互不干扰。会话断了、服务重启了，记忆都还在。

底层，丞相通过 MCP 协议将飞书 API 暴露给 Claude Code，让 AI 拥有真正的执行力而不只是生成文本。整个项目用 TypeScript 写成，Bun 驱动，Docker 一键部署。

---

**[English](#english)** | **[中文](#中文)**

---

## English

### What is Minister?

Minister is a Feishu AI assistant framework built on Claude Code, designed for teams. It's not another chatbot — it's a colleague that lives inside Feishu, capable of sending messages, creating tasks, writing documents, scheduling events, and operating Bitable on your behalf. You say it, it does it.

Works for a ten-person team splitting the busywork, or a solo founder who needs a capable partner. Either way, it fits.

Minister maintains dedicated memory for each team member. Tell it "I like my weekly reports in three sections", and it remembers — just for you. Everyone's preferences stay separate, persisting across sessions and restarts.

Under the hood, Minister exposes Feishu APIs to Claude Code via MCP (Model Context Protocol), giving the AI real execution power beyond text generation. Written in TypeScript, powered by Bun, deployable with a single Docker command.

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

Create a custom app on the [Feishu Open Platform](https://open.feishu.cn), then configure it in the [Events & Callbacks](https://open.feishu.cn/app/cli_a920409767f89bc0/event?tab=event) page:

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

## 中文

### Minister 是什么?

丞相是一个开源的飞书 AI 助手框架。你在飞书群里或私聊中 @ 它，背后的 Claude 会理解你的意图并直接行动：帮你发消息、建任务、写文档、排日程、查多维表格。不是给你一段文字让你自己去操作，而是它替你把事情办了。

技术层面，丞相通过 MCP 协议将飞书 API 暴露给 Claude，WebSocket 长连接接收消息，流式卡片实时展示处理进度。整个项目用 TypeScript 单体仓库组织，Bun 驱动，Docker 一键部署。

### 项目结构

```
packages/
  shared/        共享类型与配置
  bot-server/    飞书机器人服务（WebSocket 长连接）
  feishu-mcp/    MCP 工具服务，向 Claude 暴露飞书 API
```

机器人服务接收飞书消息后，启动 Claude CLI 子进程进行流式 JSON 输出处理，并通过交互式卡片实时展示进度。每个用户的会话独立管理，30 分钟自动过期，通过 Claude 的 `--resume` 参数支持对话延续。

### 用户记忆

每个用户拥有独立的记忆文件夹 `data/users/{open_id}/`，Claude 会在对话中自主维护其中的 `CLAUDE.md` 文件。当用户表达个人偏好、工作习惯或常用指令时（比如"记住我喜欢 Markdown 格式的报告"），Claude 会将这些信息写入该文件。在后续对话中——即使会话过期或服务重启——已存储的偏好会自动加载到系统提示词中，让 Claude 对每个用户都具备持久的跨会话记忆能力。

### MCP 工具集

MCP 服务提供六大类工具，供 Claude 与飞书进行交互：

| 类别 | 工具 | 说明 |
|------|------|------|
| 消息 | `msg_send`, `msg_reply`, `msg_read_history` | 发送、回复消息，读取聊天记录 |
| 任务 | `task_create`, `task_update`, `task_complete`, `task_query`, `tasklist_create` | 任务全生命周期管理 |
| 通讯录 | `contact_search`, `contact_get_user` | 搜索用户、获取用户信息 |
| 多维表格 | `bitable_create_app`, `bitable_create_record`, `bitable_query`, `bitable_update_record` | 多维表格数据操作 |
| 文档 | `doc_create`, `doc_read`, `doc_update` | 文档增删改查 |
| 日历 | `cal_create_event`, `cal_query_events`, `cal_freebusy` | 日历事件与空闲查询 |

### 环境要求

- [Bun](https://bun.sh/) v1.x
- 一个飞书自建应用（在 [open.feishu.cn](https://open.feishu.cn) 创建）
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-code)（Docker 部署时自动安装）
- Anthropic API Key

### 飞书应用配置

在[飞书开放平台](https://open.feishu.cn)创建自建应用后，进入[事件与回调](https://open.feishu.cn/app/cli_a920409767f89bc0/event?tab=event)页面完成以下配置：

1. **订阅方式**：选择"使用长连接接收事件"（WebSocket），不要使用 HTTP 回调。
2. **事件订阅**：添加 `im.message.receive_v1`（接收消息）。
3. **权限管理**：开通 MCP 工具所需的 API 权限（消息、任务、通讯录、日历、文档、多维表格等）。完整权限清单见 `config/feishu-permissions.json`。

### 快速开始

1. 克隆并安装依赖：

```bash
git clone <repo-url> minister
cd minister
bun install
```

2. 配置环境变量：

```bash
cp config/.env.example .env
cp config/claude.env.example config/claude.env
# 分别编辑两个文件，填入对应凭据
```

`.env` 存放飞书凭据：

```
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
```

`config/claude.env` 存放所有 Claude Code 配置——API Key、接入地址、模型、代理、`settings.json` 覆盖项等。完整配置项见 `config/claude.env.example`。

3. 生成 `.claude/settings.json`（本地可选，Docker 中自动执行）：

```bash
bun run generate-settings
```

4. 启动：

```bash
bun run bot     # 启动机器人服务
bun run mcp     # 启动 MCP 服务（由 Claude CLI 内部调用）
```

### Docker 部署

```bash
docker compose up -d
```

Docker 镜像基于 `oven/bun:1-debian` 构建，Claude CLI 在构建阶段自动安装。容器启动时会自动从 `config/claude.env` 和 `.env` 生成 `.claude/settings.json`，因此 Claude Code 的所有行为（API 端点、模型、代理、权限等）都可以通过环境变量控制。

### 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **飞书 SDK**: @larksuiteoapi/node-sdk
- **MCP SDK**: @modelcontextprotocol/sdk
- **校验**: Zod

---

## License

MIT
