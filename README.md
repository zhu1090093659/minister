# 丞相 / Minister

<div align="center">

<video src="resource/minister-intro.mp4" width="720" controls>
  Your browser does not support the video tag.
</video>

*[点击此处观看介绍视频](resource/minister-intro.mp4)*

</div>

> 把 Claude Code 塞进飞书，给你的团队加一个全能同事。

**[English](./README_EN.md)**

---

丞相是一个基于 Claude Code 的飞书 AI 助手框架，为企业团队打造。它不是又一个聊天机器人——它是一个住在飞书里的同事，能直接帮你发消息、建任务、写文档、排日程、操作多维表格，说完就办，不用你再动手。

十人团队用它分担杂活，一人公司拿它当全能搭档，都合适。

丞相为每位同事维护专属记忆。你说过"我的周报喜欢分三段写"，它就记住了，下次直接照做。张三的习惯是张三的，李四的偏好是李四的，互不干扰。会话断了、服务重启了，记忆都还在。

底层，丞相通过 MCP 协议将飞书 API 暴露给 Claude Code，让 AI 拥有真正的执行力而不只是生成文本。整个项目用 TypeScript 写成，Bun 驱动，Docker 一键部署。

---

### Minister 是什么?

丞相是一个开源的飞书 AI 助手框架。你在飞书群里或私聊中 @ 它，背后的 Claude 会理解你的意图并直接行动：帮你发消息、建任务、写文档、排日程、查多维表格。不是给你一段文字让你自己去操作，而是它替你把事情办了。

技术层面，丞相通过 MCP 协议将飞书 API 暴露给 Claude，WebSocket 长连接接收消息，流式卡片实时展示处理进度。整个项目用 TypeScript 单体仓库组织，Bun 驱动，Docker 一键部署。

### 为什么选丞相？

| 对比项 | 丞相 | OpenClaw | 飞书智能伙伴 |
|--------|------|----------|------------|
| **飞书功能覆盖** | 6 类 20 个原生工具，消息、任务、文档、日历、多维表格、通讯录全栈覆盖 | 飞书为近期新增频道，工具以基础消息收发为主 | 可操作范围受平台策略约束 |
| **执行方式** | 直接调用飞书 API，真正替你把事情办完 | 通用任务执行，飞书专项能力有限 | 生成文字和建议，需用户自行操作 |
| **推理引擎** | Claude Code CLI — Anthropic 工业级 agentic loop | LLM API + 社区自研 ReAct 循环 | 对话式文本生成，无持续推理循环 |
| **图片理解** | 原生支持图片输入，可识图、看截图、分析设计稿，图文混发自动合并处理 | 依赖所接入 LLM 的视觉能力，集成深度有限 | 支持基础识图，能力受平台限制 |
| **用户记忆隔离** | 每人独立 `CLAUDE.md`，偏好互不干扰，服务重启后依然保留 | 全局记忆存储，无用户级隔离 | 会话结束即清空，无持久记忆 |
| **飞书场景专注度** | 为飞书团队专属打造，每个细节都针对飞书生态优化 | 通用平台，飞书是众多支持频道之一 | — |

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

在[飞书开放平台](https://open.feishu.cn)创建自建应用后，进入事件与回调页面完成以下配置：

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

## 协议

本项目采用 [Apache License 2.0](./LICENSE) 开源协议。允许商业使用，但使用时必须保留原始版权声明与项目来源说明。
