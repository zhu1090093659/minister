// Bridge to Claude Code CLI — spawn process and parse NDJSON stream
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

export async function runClaude(
  prompt: string,
  session: Session,
  callbacks: BridgeCallbacks = {},
): Promise<BridgeResult> {
  const args = [
    "--print",
    ...(config.claude.verbose ? ["--verbose"] : []),
    "--output-format", "stream-json",
    "--model", config.claude.model,
  ];

  if (session.conversationId) {
    args.push("--resume", session.conversationId);
  }

  args.push(prompt);

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
