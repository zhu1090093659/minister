// Bridge to AI engine CLI — spawn process and parse NDJSON/JSONL stream.
// Delegates engine-specific logic (args, event parsing) to the active EngineAdapter.
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import type { Session } from "@minister/shared";
import { config, PROJECT_ROOT } from "@minister/shared";
import { ensureUserWorktree } from "./worktree-manager.js";
import { ClaudeAdapter, CodexAdapter, type EngineAdapter, type ParsedEvent } from "./engine-adapter.js";

// ---------------------------------------------------------------------------
// Engine adapter — selected once at startup based on ENGINE_TYPE
// ---------------------------------------------------------------------------

const adapter: EngineAdapter = config.engine === "codex"
  ? new CodexAdapter()
  : new ClaudeAdapter();

// MCP config — each adapter handles format differences (JSON vs TOML)
const { configPath: mcpConfigPath, cleanup: cleanupMcp } = adapter.setupMcpConfig({
  feishu: {
    command: "bun",
    args: ["run", resolve(PROJECT_ROOT, "packages/feishu-mcp/src/index.ts")],
    env: {
      FEISHU_APP_ID: config.feishu.appId,
      FEISHU_APP_SECRET: config.feishu.appSecret,
    },
  },
});

process.on("exit", cleanupMcp);
process.on("SIGTERM", () => { cleanupMcp(); process.exit(0); });
process.on("SIGINT", () => { cleanupMcp(); process.exit(0); });

console.log(`[Engine] Using ${adapter.name} engine`);

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

// Maximum time allowed for a single CLI invocation
const ENGINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface BridgeCallbacks {
  // Return false to abort the process immediately
  onText?: (text: string) => boolean | void;
  onToolUse?: (toolName: string) => void;
  onError?: (error: string) => void;
}

// Patterns that indicate sensitive config/credential content in a response
const SENSITIVE_PATTERNS: RegExp[] = [
  /\bFEISHU_APP_SECRET\s*[:=]\s*\S{4,}/i,
  /\bANTHROPIC_API_KEY\s*[:=]\s*\S{4,}/i,
  /\bOPENAI_API_KEY\s*[:=]\s*\S{4,}/i,
  /\bFEISHU_APP_ID\s*[:=]\s*cli_\S+/i,
  /\bsk-ant-[A-Za-z0-9\-_]{20,}/,
  /\bsk-[A-Za-z0-9\-_]{40,}/,
  // Generic env-var-like line: UPPER_CASE=longvalue (matches .env file content)
  /^[A-Z][A-Z0-9_]{4,}=\S{16,}$/m,
];

export function containsSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

export const SENSITIVE_CONTENT_ERROR = "SENSITIVE_CONTENT_DETECTED";

export interface BridgeResult {
  text: string;
  tools: string[];
  sessionId?: string;
}

/** Expose the active engine name for log messages */
export const engineName = adapter.name;

// ---------------------------------------------------------------------------
// Core invocation
// ---------------------------------------------------------------------------

export async function runEngine(
  prompt: string,
  session: Session,
  callbacks: BridgeCallbacks = {},
  imagePaths?: string[],
): Promise<BridgeResult> {
  // Group chats use the chatId as the shared workspace; private chats use the userId
  const workspaceId = session.chatId ?? session.userId;
  const worktreePath = ensureUserWorktree(workspaceId);

  // Codex reads model from config.toml; only Claude needs the model param
  const model = config.claude.model;

  // Prepend user context as a system tag so the model knows the caller
  // but treats it as metadata rather than part of the user's message
  const contextualPrompt = `<context user_open_id="${session.userId}" />\n${prompt}`;

  const { command, args } = adapter.buildArgs({
    prompt: contextualPrompt,
    model,
    systemPrompt: config.systemPrompt,
    mcpConfigPath,
    conversationId: session.conversationId,
    imagePaths,
  });

  // Filter out --system-prompt value to avoid logging sensitive content
  const safeArgs = args.filter((_, i) => args[i - 1] !== "--system-prompt");
  console.log(`[${adapter.name}] Spawning: ${command} ${safeArgs.join(" ").slice(0, 150)}...`);

  return new Promise((resolvePromise, reject) => {
    const proc: ChildProcess = spawn(command, args, {
      cwd: worktreePath,
      stdio: ["ignore", "pipe", "pipe"],
    });
    console.log(`[${adapter.name}] Process spawned, pid: ${proc.pid}`);

    let fullText = "";
    const tools: string[] = [];
    let sessionId: string | undefined;
    let buffer = "";
    let stderrChunks: string[] = [];
    let settled = false;

    function abort(reason: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      proc.kill("SIGTERM");
      reject(reason);
    }

    function applyParsedEvent(parsed: ParsedEvent): void {
      switch (parsed.kind) {
        case "text":
          fullText += parsed.text;
          if (parsed.sessionId) sessionId = parsed.sessionId;
          {
            const abortSignal = callbacks.onText?.(parsed.text);
            if (abortSignal === false) {
              abort(new Error(SENSITIVE_CONTENT_ERROR));
            }
          }
          break;
        case "tool_use":
          tools.push(parsed.toolName);
          if (parsed.sessionId) sessionId = parsed.sessionId;
          callbacks.onToolUse?.(parsed.toolName);
          break;
        case "result":
          if (parsed.sessionId) sessionId = parsed.sessionId;
          if (!fullText && parsed.result) fullText = parsed.result;
          break;
      }
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
          const parsed = adapter.parseEvent(event);
          if (parsed) applyParsedEvent(parsed);
        } catch {
          // Skip non-JSON lines
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        if (stderrChunks.length >= 20) stderrChunks.shift();
        stderrChunks.push(msg);
        console.warn(`[${adapter.name}] stderr: ${msg.slice(0, 500)}`);
      }
    });

    // Kill process if it runs too long
    const timeoutId = setTimeout(() => {
      abort(new Error(`${adapter.name} CLI timed out after ${ENGINE_TIMEOUT_MS / 60_000} minutes`));
    }, ENGINE_TIMEOUT_MS);

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      console.log(`[${adapter.name}] Process exited with code ${code}, fullText length: ${fullText.length}`);

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer.trim());
          const parsed = adapter.parseEvent(event);
          if (parsed) applyParsedEvent(parsed);
        } catch {
          // Ignore
        }
      }

      if (code !== 0 && !fullText) {
        const stderrSummary = stderrChunks.join("\n").slice(-500);
        reject(new Error(
          `${adapter.name} CLI exited with code ${code}` +
          (stderrSummary ? `\n${stderrSummary}` : ""),
        ));
        return;
      }

      // Persist session ID for future resume
      if (sessionId) session.conversationId = sessionId;

      resolvePromise({ text: fullText, tools, sessionId });
    });

    proc.on("error", (err) => {
      abort(err);
    });
  });
}
