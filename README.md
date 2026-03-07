# Minister / 丞相

AI-driven Feishu chatbot framework powered by Claude — your intelligent assistant that lives inside Feishu.

基于 Claude 驱动的飞书 AI 聊天机器人框架，一个住在飞书里的智能助手。

---

**[English](#english)** | **[中文](#中文)**

---

## English

### What is Minister?

Minister is a TypeScript monorepo that connects Claude AI to Feishu (Lark) instant messaging. It listens for messages via WebSocket, routes them to Claude CLI for processing, and streams the results back as interactive Feishu cards.

On top of chat, Minister exposes a set of Feishu API tools through MCP (Model Context Protocol), allowing Claude to take actions directly in your workspace — send messages, create tasks, manage documents, query calendars, and more.

### Architecture

```
packages/
  shared/        Shared types and configuration
  bot-server/    Feishu chatbot server (WebSocket long-connection)
  feishu-mcp/    MCP tool server exposing Feishu APIs to Claude
```

The bot server receives Feishu messages, spawns a Claude CLI subprocess with streaming JSON output, and renders real-time progress through interactive cards. Sessions are managed per user with a 30-minute TTL, supporting conversation continuity via Claude's `--resume` flag.

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

Minister（丞相）是一个 TypeScript 单体仓库项目，它将 Claude AI 连接到飞书即时通讯平台。通过 WebSocket 长连接监听飞书消息，将消息路由到 Claude CLI 进行处理，然后以交互式飞书卡片的形式实时回传结果。

除了对话能力，Minister 还通过 MCP（模型上下文协议）暴露了一整套飞书 API 工具，让 Claude 能够直接在你的工作空间中执行操作——发消息、建任务、管文档、查日历，一应俱全。

### 项目结构

```
packages/
  shared/        共享类型与配置
  bot-server/    飞书机器人服务（WebSocket 长连接）
  feishu-mcp/    MCP 工具服务，向 Claude 暴露飞书 API
```

机器人服务接收飞书消息后，启动 Claude CLI 子进程进行流式 JSON 输出处理，并通过交互式卡片实时展示进度。每个用户的会话独立管理，30 分钟自动过期，通过 Claude 的 `--resume` 参数支持对话延续。

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
