// Bridge to Claude Code CLI — spawn process and parse NDJSON stream
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import type { Session } from "@minister/shared";
import { config } from "@minister/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

interface BridgeCallbacks {
  onText?: (text: string) => void;
  onToolUse?: (toolName: string) => void;
  onError?: (error: string) => void;
}

interface BridgeResult {
  text: string;
  tools: string[];
  sessionId?: string;
}

// Ensure per-user data directory exists and return its absolute path
function ensureUserDir(userId: string): string {
  const userDir = resolve(config.userDataDir, userId);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

// Read user-specific CLAUDE.md memory file
function getUserMemory(userId: string): string {
  const claudeMdPath = resolve(config.userDataDir, userId, "CLAUDE.md");
  if (!existsSync(claudeMdPath)) return "";
  try {
    return readFileSync(claudeMdPath, "utf-8").trim();
  } catch {
    return "";
  }
}

// Build system prompt with per-user memory injected
function buildSystemPrompt(userId: string): string {
  const userDir = ensureUserDir(userId);
  const memoryPath = resolve(userDir, "CLAUDE.md");
  const userMemory = getUserMemory(userId);

  let prompt = config.claude.systemPrompt;

  prompt += [
    "",
    "",
    "# 用户记忆管理",
    `你有一个专属于当前用户的记忆文件: ${memoryPath}`,
    '- 当用户明确表达偏好、习惯或常用指令时（如"记住我喜欢..."、"以后帮我..."），将其写入该文件',
    "- 写入前先读取现有内容，避免重复",
    "- 仅记录用户偏好和指令，不记录对话内容或临时信息",
    "- 保持文件简洁，控制在 50 行以内",
  ].join("\n");

  if (userMemory) {
    prompt += `\n\n# 当前用户的个人记忆\n${userMemory}`;
  }

  return prompt;
}

// Build MCP config JSON with resolved env vars
function buildMcpConfig(): string {
  return JSON.stringify({
    mcpServers: {
      feishu: {
        command: "bun",
        args: ["run", "./packages/feishu-mcp/src/index.ts"],
        env: {
          FEISHU_APP_ID: config.feishu.appId,
          FEISHU_APP_SECRET: config.feishu.appSecret,
        },
      },
    },
  });
}

export async function runClaude(
  prompt: string,
  session: Session,
  callbacks: BridgeCallbacks = {},
): Promise<BridgeResult> {
  const args = [
    "--print",
    "--permission-mode", "auto",
    "--verbose",
    "--output-format", "stream-json",
    "--model", config.claude.model,
    "--system-prompt", buildSystemPrompt(session.userId),
    "--mcp-config", buildMcpConfig(),
  ];

  if (session.conversationId) {
    args.push("--resume", session.conversationId);
  }

  // "--" separates options from positional args;
  // without it, --mcp-config (variadic) swallows the prompt
  args.push("--", prompt);

  console.log(`[Claude] Spawning: claude ${args.join(" ").slice(0, 100)}...`);

  return new Promise((resolve, reject) => {
    const proc: ChildProcess = spawn("claude", args, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(`[Claude] Process spawned, pid: ${proc.pid}`);

    let fullText = "";
    const tools: string[] = [];
    let sessionId: string | undefined;
    let buffer = "";

    // Extract result event fields (used in both streaming and close handlers)
    function applyResultEvent(event: { session_id?: string; result?: string }) {
      sessionId = event.session_id || sessionId;
      if (!fullText && event.result) fullText = event.result;
    }

    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      // Keep last incomplete line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const event = JSON.parse(trimmed);

          if (event.type === "assistant") {
            // v2.x format: text in event.message.content[]
            const contentBlocks = event.message?.content;
            if (Array.isArray(contentBlocks)) {
              for (const block of contentBlocks) {
                if (block.type === "text" && block.text) {
                  fullText += block.text;
                  callbacks.onText?.(block.text);
                } else if (block.type === "tool_use") {
                  const toolName = block.name || "unknown";
                  tools.push(toolName);
                  callbacks.onToolUse?.(toolName);
                }
              }
            }
            sessionId = event.session_id || sessionId;
          }

          if (event.type === "result") {
            applyResultEvent(event);
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.warn(`[Claude] stderr: ${msg.slice(0, 200)}`);
      }
    });

    proc.on("close", (code) => {
      console.log(`[Claude] Process exited with code ${code}, fullText length: ${fullText.length}`);
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          if (event.type === "result") applyResultEvent(event);
        } catch {
          // Ignore
        }
      }

      if (code !== 0 && !fullText) {
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }

      // Persist session ID for future --resume
      if (sessionId) session.conversationId = sessionId;

      resolve({ text: fullText, tools, sessionId });
    });

    proc.on("error", reject);
  });
}
