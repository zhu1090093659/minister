// Bridge to Claude Code CLI — spawn process and parse NDJSON stream
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import type { Session } from "@minister/shared";
import { config } from "@minister/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../..");

// Maximum time allowed for a single Claude CLI invocation
const CLAUDE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

interface BridgeCallbacks {
  // Return false to abort the Claude process immediately
  onText?: (text: string) => boolean | void;
  onToolUse?: (toolName: string) => void;
  onError?: (error: string) => void;
}

// Patterns that indicate sensitive config/credential content in a response
const SENSITIVE_PATTERNS: RegExp[] = [
  /\bFEISHU_APP_SECRET\s*[:=]\s*\S{4,}/i,
  /\bANTHROPIC_API_KEY\s*[:=]\s*\S{4,}/i,
  /\bFEISHU_APP_ID\s*[:=]\s*cli_\S+/i,
  /\bsk-ant-[A-Za-z0-9\-_]{20,}/,
  // Generic env-var-like line: UPPER_CASE=longvalue (matches .env file content)
  /^[A-Z][A-Z0-9_]{4,}=\S{16,}$/m,
];

export function containsSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

export const SENSITIVE_CONTENT_ERROR = "SENSITIVE_CONTENT_DETECTED";

interface BridgeResult {
  text: string;
  tools: string[];
  sessionId?: string;
}

// Ensure per-user data directory exists and return its absolute path
function ensureUserDir(userId: string): string {
  // Guard against path traversal: allow only safe characters found in Feishu IDs
  if (!/^[\w\-:]{1,200}$/.test(userId)) {
    throw new Error(`Invalid userId format: ${userId}`);
  }
  const userDir = resolve(config.userDataDir, userId);
  // Belt-and-suspenders: use path.relative to catch traversal on any platform
  const rel = relative(config.userDataDir, userDir);
  if (rel.startsWith("..")) {
    throw new Error(`userId escapes data directory`);
  }
  mkdirSync(userDir, { recursive: true });
  return userDir;
}

// Read user-specific CLAUDE.md memory file from an already-resolved userDir
function getUserMemory(userDir: string): string {
  try {
    return readFileSync(resolve(userDir, "CLAUDE.md"), "utf-8").trim();
  } catch {
    return "";
  }
}

// Build system prompt with per-user memory injected
function buildSystemPrompt(userId: string): string {
  const userDir = ensureUserDir(userId);
  const memoryPath = resolve(userDir, "CLAUDE.md");
  const userMemory = getUserMemory(userDir);

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

// MCP config is static for the lifetime of the process — write once, reuse forever
const MCP_CONFIG_PATH = resolve(tmpdir(), `minister-mcp-${process.pid}.json`);
writeFileSync(
  MCP_CONFIG_PATH,
  JSON.stringify({
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
  }),
  { mode: 0o600 },
);
const _cleanupMcpConfig = () => { try { unlinkSync(MCP_CONFIG_PATH); } catch { /* already gone */ } };
process.on("exit", _cleanupMcpConfig);
process.on("SIGTERM", () => { _cleanupMcpConfig(); process.exit(0); });
process.on("SIGINT", () => { _cleanupMcpConfig(); process.exit(0); });

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
    "--mcp-config", MCP_CONFIG_PATH,
  ];

  if (session.conversationId) {
    args.push("--resume", session.conversationId);
  }

  // "--" separates options from positional args;
  // without it, --mcp-config (variadic) swallows the prompt
  args.push("--", prompt);

  // Filter out --system-prompt value to avoid logging sensitive user memory content
  const safeArgs = args.filter((_, i) => args[i - 1] !== "--system-prompt");
  console.log(`[Claude] Spawning: claude ${safeArgs.join(" ").slice(0, 150)}...`);

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
    let settled = false;

    function abort(reason: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      proc.kill("SIGTERM");
      reject(reason);
    }

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
                  const abortSignal = callbacks.onText?.(block.text);
                  if (abortSignal === false) {
                    abort(new Error(SENSITIVE_CONTENT_ERROR));
                    return;
                  }
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

    // Kill process if it runs too long
    const timeoutId = setTimeout(() => {
      abort(new Error(`Claude CLI timed out after ${CLAUDE_TIMEOUT_MS / 60_000} minutes`));
    }, CLAUDE_TIMEOUT_MS);

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
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

    proc.on("error", (err) => {
      abort(err);
    });
  });
}
