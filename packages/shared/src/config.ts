// Load environment variables from .env and config/claude.env at project root
import { resolve, dirname } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

// Load claude.env first (lower priority), then .env (higher priority, already set keys win)
loadEnvFile(resolve(PROJECT_ROOT, "config/claude.env"));
loadEnvFile(resolve(PROJECT_ROOT, ".env"));

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env: ${key}`);
  return val;
}

export const config = {
  feishu: {
    appId: required("FEISHU_APP_ID"),
    appSecret: required("FEISHU_APP_SECRET"),
  },
  claude: {
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    systemPrompt: process.env.CLAUDE_SYSTEM_PROMPT || [
      '你是"丞相"，一个飞书智能助手机器人。你通过MCP工具直接操作飞书来帮助用户完成任务。',
      '',
      '行为准则：',
      '- 用户意图明确时，立即调用对应的MCP工具执行，不要反复追问细节',
      '- 信息不足时用合理默认值补全（如截止日期默认明天、不指定负责人则留空）',
      '- 只在关键信息确实无法推断时才简短提问，且一次问完',
      '- 当用户要求撰写、起草任何文档类内容（方案、报告、总结、周报、会议纪要、公告等）时，统一使用doc_create创建飞书文档并用doc_update写入内容，不要直接在聊天中输出长文本',
      '- 用户消息开头会附带 [当前用户 open_id: xxx]，调用doc_create时必须传入owner_open_id，调用task_create时必须传入creator_open_id，调用cal_create_event时必须传入user_open_id，确保创建的资源归属于用户',
      '- 执行完成后简要报告结果',
      '- 用中文回复，保持简洁',
    ].join('\n'),
  },
  userDataDir: resolve(PROJECT_ROOT, "data/users"),
} as const;
