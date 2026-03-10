# 丞相 / Minister

<div align="center">

[![观看介绍视频](https://img.shields.io/badge/Bilibili-观看介绍视频-00A1D6?style=for-the-badge&logo=bilibili&logoColor=white)](https://www.bilibili.com/video/BV1MLNwzUEje/)

</div>

> 把 Claude Code 塞进飞书，给你的团队加一个全能同事。

**[English](./README_EN.md)**

---

丞相是一个基于 Claude Code 的飞书 AI 助手框架，为企业团队打造。它不是又一个聊天机器人——它是一个住在飞书里的同事，能直接帮你发消息、建任务、写文档、排日程、操作多维表格，说完就办，不用你再动手。

十人团队用它分担杂活，一人公司拿它当全能搭档，都合适。

丞相为每位同事维护专属记忆。你说过"我的周报喜欢分三段写"，它就记住了，下次直接照做。张三的习惯是张三的，李四的偏好是李四的，互不干扰。会话断了、服务重启了，记忆都还在。

底层，丞相通过 MCP 协议将飞书 API 暴露给 AI 引擎，让 AI 拥有真正的执行力而不只是生成文本。支持 Claude Code 和 OpenAI Codex 双引擎，通过一个环境变量即可切换。整个项目用 TypeScript 写成，Bun 驱动，Docker 一键部署。

---

### Minister 是什么?

丞相是一个开源的飞书 AI 助手框架。你在飞书群里或私聊中 @ 它，背后的 Claude 会理解你的意图并直接行动：帮你发消息、建任务、写文档、排日程、查多维表格。不是给你一段文字让你自己去操作，而是它替你把事情办了。

技术层面，丞相通过 MCP 协议将飞书 API 暴露给 AI 引擎（支持 Claude Code 和 OpenAI Codex 双引擎切换），WebSocket 长连接接收消息，流式卡片实时展示处理进度。整个项目用 TypeScript 单体仓库组织，Bun 驱动，Docker 一键部署。

### 为什么选丞相？

| 对比项 | 丞相 | OpenClaw | 飞书智能伙伴 |
|--------|------|----------|------------|
| **飞书功能覆盖** | 6 类 20 个原生工具，消息、任务、文档、日历、多维表格、通讯录全栈覆盖 | 飞书为近期新增频道，工具以基础消息收发为主 | 可操作范围受平台策略约束 |
| **执行方式** | 直接调用飞书 API，真正替你把事情办完 | 通用任务执行，飞书专项能力有限 | 生成文字和建议，需用户自行操作 |
| **推理引擎** | 双引擎可选：Claude Code CLI（Anthropic 工业级 agentic loop）或 OpenAI Codex CLI，一个环境变量切换 | LLM API + 社区自研 ReAct 循环 | 对话式文本生成，无持续推理循环 |
| **图片理解** | 原生支持图片输入，可识图、看截图、分析设计稿，图文混发自动合并处理 | 依赖所接入 LLM 的视觉能力，集成深度有限 | 支持基础识图，能力受平台限制 |
| **用户隔离与个性化** | 每人独立工作区（`CLAUDE.md` 记忆 + 专属 MCP 配置），可自建 skill 和接入第三方 MCP，偏好互不干扰，文件系统权限保护 | 全局记忆存储，无用户级隔离 | 会话结束即清空，无持久记忆 |
| **飞书场景专注度** | 为飞书团队专属打造，每个细节都针对飞书生态优化 | 通用平台，飞书是众多支持频道之一 | — |

### 项目结构

```
packages/
  shared/        共享类型与配置
  bot-server/    飞书机器人服务（WebSocket 长连接 + Admin HTTP API）
  feishu-mcp/    MCP 工具服务，向 Claude 暴露飞书 API
  admin-ui/      管理后台前端（React + Vite SPA）
```

机器人服务接收飞书消息后，启动 AI 引擎子进程（Claude Code 或 Codex CLI，由 `ENGINE_TYPE` 环境变量决定）进行流式 JSON 输出处理，并通过交互式卡片实时展示进度。每个用户的会话独立管理，30 分钟自动过期，支持对话延续。

### 管理后台

丞相内置了一个 Web 管理后台，通过飞书账号登录，无需额外部署。管理后台与机器人服务运行在同一个进程中，提供以下能力：

**个人配置** — 管理你自己的 AI 行为。自定义系统提示词（System Prompt），覆盖全局默认值或恢复默认；管理 MCP 服务器（支持 stdio / SSE / HTTP 三种类型，在线测试连接，敏感 Token 自动脱敏）；管理 Skill（创建、编辑、启停，也可从内置模板创建）；编辑 `CLAUDE.md` 个人记忆。

**群组配置** — 为不同群聊设置不同的 AI 人格和行为策略。每个群可以有独立的系统提示词、MCP 服务器和 Skill；行为控制包括是否需要 @机器人才触发、是否允许自动执行工具、成员白名单。

**配置继承** — 三层优先级：系统默认 < 个人配置 < 群组配置。管理后台会可视化展示配置的来源和继承链，让你清楚每项配置实际生效的是哪一层。

### 个人工作区

每位用户在 `data/worktrees/{open_id}/` 下拥有完全隔离的个人工作区，包含两个核心文件：

```
data/worktrees/{open_id}/
├── CLAUDE.md              # 用户专属记忆，跨会话持久保留
└── .claude/
    └── settings.json      # 用户专属配置（MCP、权限等）
```

**记忆持久化**：当用户表达偏好、习惯或常用指令时（比如"记住我喜欢三段式周报"），Claude 会自主写入 `CLAUDE.md`。每次启动时 Claude 原生读取该文件，无需重新说明——即使会话过期或服务重启，记忆依然在。

**专属 MCP 与 skill**：每位用户拥有独立的 `.claude/settings.json`，可以通过自然语言让 Claude 为自己扩展能力：

- 接入第三方 MCP 服务（如 GitHub、Jira、自定义内部系统）
- 写入 `CLAUDE.md` 定义个人 skill（特定格式模板、专属工作流、常用提示词库）
- 调整权限策略，适配自己的使用场景

举例——你可以对丞相说：

> "帮我在 settings.json 里添加 GitHub MCP，我的 Token 是 xxx"

丞相会直接修改你的 `settings.json`，下次对话起 GitHub 工具就对你生效，对其他用户没有任何影响。

**安全隔离**：工作区目录使用文件系统权限限制，系统提示词中有明确的多层防护规则，禁止任何跨用户的读写操作。

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
- AI 引擎二选一：
  - [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) + Anthropic API Key（默认）
  - [Codex CLI](https://codex.openai.com/) + OpenAI API Key

### 飞书应用配置

在[飞书开放平台](https://open.feishu.cn)创建自建应用后，完成以下配置：

1. **订阅方式**：进入事件与回调页面，选择"使用长连接接收事件"（WebSocket），不要使用 HTTP 回调。
2. **事件订阅**：添加 `im.message.receive_v1`（接收消息）。
3. **权限管理**：开通 MCP 工具所需的 API 权限（消息、任务、通讯录、日历、文档、多维表格等）。完整权限清单见 `config/feishu-permissions.json`。
4. **管理后台登录**：进入安全设置，在"重定向 URL"中添加管理后台的 OAuth 回调地址。该地址必须与 `.env` 中的 `ADMIN_BASE_URL` 严格一致（包括协议和端口），格式为 `{ADMIN_BASE_URL}/api/v1/auth/callback`。例如本地开发时添加 `http://localhost:3000/api/v1/auth/callback`。

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

`.env` 存放飞书凭据和管理后台配置：

```
FEISHU_APP_ID=your_app_id
FEISHU_APP_SECRET=your_app_secret
ADMIN_BASE_URL=http://localhost:3000
```

`ADMIN_BASE_URL` 是管理后台的外部访问地址，用于构造飞书 OAuth 回调链接。本地开发填 `http://localhost:3000`，生产环境填你的实际域名（如 `https://admin.example.com`）。另外两个可选项：`ADMIN_PORT` 控制监听端口（默认 3000），`ADMIN_JWT_SECRET` 用于签发登录令牌（生产环境务必设置一个随机字符串）。

`config/claude.env` 存放所有 Claude Code 配置——API Key、接入地址、模型、代理、`settings.json` 覆盖项等。完整配置项见 `config/claude.env.example`。

如需使用 Codex 引擎，在 `.env` 中额外设置：

```
ENGINE_TYPE=codex
OPENAI_API_KEY=your_openai_api_key
```

并编辑 `config/config.toml` 配置模型和 Provider（参考文件内注释）。

3. 生成 `.claude/settings.json`（本地可选，Docker 中自动执行）：

```bash
bun run generate-settings
```

4. 启动：

```bash
bun run bot     # 启动机器人服务（同时启动管理后台 HTTP 服务）
bun run mcp     # 启动 MCP 服务（由 Claude CLI 内部调用）
```

启动后访问 `http://localhost:3000`（或你配置的 `ADMIN_BASE_URL`）即可进入管理后台，通过飞书账号登录。

### Docker 部署

```bash
docker compose up -d
```

Docker 镜像基于 `oven/bun:1-debian` 构建，Claude CLI 在构建阶段自动安装。容器启动时会根据 `ENGINE_TYPE` 自动完成配置——Claude 引擎生成 `.claude/settings.json`，Codex 引擎则将 `config/config.toml` 写入 `~/.codex/config.toml` 并附加 MCP 服务定义。所有引擎行为均可通过环境变量控制。

### 技术栈

- **运行时**: Bun
- **语言**: TypeScript
- **飞书 SDK**: @larksuiteoapi/node-sdk
- **MCP SDK**: @modelcontextprotocol/sdk
- **校验**: Zod
- **后端框架**: Hono（Admin API + 静态托管）
- **前端**: React + Vite + React Router

---

## 协议

本项目采用 [Apache License 2.0](./LICENSE) 开源协议。允许商业使用，但使用时必须保留原始版权声明与项目来源说明。
