// Message routing: parse incoming Feishu events, dispatch to Claude
import { resolve } from "node:path";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { larkClient as client, botOpenId } from "./client.js";
import { sessionManager } from "./session-manager.js";
import { runEngine, engineName, containsSensitiveContent, SENSITIVE_CONTENT_ERROR } from "./engine-bridge.js";
import {
  buildThinkingCard,
  buildResultCard,
  buildStreamingCard,
  buildToolUseCard,
  buildErrorCard,
} from "./card-builder.js";

// Deduplicate events delivered more than once by Feishu SDK
// Map value is the insertion timestamp; a single interval handles all expiry
const processedMessages = new Map<string, number>();
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [id, ts] of processedMessages) {
    if (ts < cutoff) processedMessages.delete(id);
  }
}, 60_000).unref();

// Per-user serial processing queue: prevents concurrent Claude invocations for the same user
const processingQueues = new Map<string, Promise<void>>();

// Enqueue a task for a given key, ensuring serial execution per key
function enqueueForUser(key: string, task: () => Promise<void>): void {
  const prev = processingQueues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(task);
  const queued = next.catch(() => {});
  processingQueues.set(key, queued);
  // Remove the entry once the queue drains so the Map doesn't grow unboundedly
  queued.finally(() => {
    if (processingQueues.get(key) === queued) processingQueues.delete(key);
  });
}

// Throttle card updates to avoid Feishu rate limits (>= 1.5s between updates)
const MIN_UPDATE_INTERVAL = 1500;
const lastUpdateTime = new Map<string, number>();

function canUpdate(messageId: string): boolean {
  const now = Date.now();
  const last = lastUpdateTime.get(messageId) || 0;
  if (now - last < MIN_UPDATE_INTERVAL) return false;
  lastUpdateTime.set(messageId, now);
  return true;
}

async function sendCard(chatId: string, cardJson: string): Promise<string | undefined> {
  const res = await client.im.v1.message.create({
    params: { receive_id_type: "chat_id" },
    data: {
      receive_id: chatId,
      content: cardJson,
      msg_type: "interactive",
    },
  });
  return res.data?.message_id;
}

async function updateCard(messageId: string, cardJson: string): Promise<void> {
  await client.im.v1.message.patch({
    path: { message_id: messageId },
    data: { content: cardJson },
  });
}

// Feishu message as stored in the aggregation buffer
type FeishuMessage = {
  message_id: string;
  chat_id: string;
  chat_type: string;
  message_type: string;
  create_time?: string;
  content?: string;
  mentions?: Array<{ key: string; id: { open_id?: string }; name: string }>;
};

// Extract text and image_keys from a single Feishu message
function extractContent(message: FeishuMessage): { text: string; imageKeys: string[] } {
  if (!message.content) return { text: "", imageKeys: [] };
  try {
    const parsed = JSON.parse(message.content);
    if (message.message_type === "text") {
      let text: string = parsed.text || "";
      // Remove @mention placeholders like @_user_1
      for (const m of message.mentions ?? []) text = text.replace(m.key, "");
      return { text: text.trim(), imageKeys: [] };
    }
    if (message.message_type === "image") {
      return { text: "", imageKeys: parsed.image_key ? [parsed.image_key] : [] };
    }
    if (message.message_type === "post") {
      // post content: { zh_cn: { content: [[block, ...], ...] } }
      const lang = parsed.zh_cn ?? parsed.en_us ?? Object.values(parsed)[0] as any;
      const textParts: string[] = [];
      const imageKeys: string[] = [];
      for (const paragraph of (lang?.content ?? []) as any[][]) {
        for (const block of paragraph) {
          if (block.tag === "text") textParts.push(block.text ?? "");
          else if (block.tag === "img" && block.image_key) imageKeys.push(block.image_key);
        }
      }
      let text = textParts.join("").trim();
      // post @mention appears as its own tag; strip any leftover placeholders just in case
      for (const m of message.mentions ?? []) text = text.replace(m.key, "");
      return { text: text.trim(), imageKeys };
    }
  } catch {
    // fall through
  }
  return { text: "", imageKeys: [] };
}

// Download a single image from a Feishu message to a temp file; return the file path
async function downloadImage(messageId: string, imageKey: string): Promise<string> {
  const tmpPath = resolve(tmpdir(), `minister-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
  const res = await (client.im.v1.messageResource as any).get({
    path: { message_id: messageId, file_key: imageKey },
    params: { type: "image" },
  });
  await res.writeFile(tmpPath);
  return tmpPath;
}

// --- Aggregation layer ---
// Collects rapid-fire messages from the same user into one logical request
// before dispatching a single Claude invocation
// Image messages take 2-5s longer to deliver than text (Feishu uploads the image
// to CDN before sending the event), so the window must cover that upload latency.
const AGGREGATION_WINDOW_MS = 5000;

interface AggregationBuffer {
  userId: string;
  messages: FeishuMessage[];
  timer: ReturnType<typeof setTimeout>;
}

const aggregationBuffers = new Map<string, AggregationBuffer>();

function addToAggregationBuffer(userId: string, queueKey: string, message: FeishuMessage): void {
  const onFlush = () => flushAggregationBuffer(queueKey);
  const existing = aggregationBuffers.get(queueKey);
  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(message);
    existing.timer = setTimeout(onFlush, AGGREGATION_WINDOW_MS);
  } else {
    aggregationBuffers.set(queueKey, {
      userId,
      messages: [message],
      timer: setTimeout(onFlush, AGGREGATION_WINDOW_MS),
    });
  }
}

function flushAggregationBuffer(queueKey: string): void {
  const buf = aggregationBuffers.get(queueKey);
  if (!buf) return;
  aggregationBuffers.delete(queueKey);
  enqueueForUser(queueKey, () => processCombinedMessages(buf.userId, buf.messages[0].chat_id, buf.messages));
}

// --- Core processing: combine buffered messages and invoke Claude ---
async function processCombinedMessages(
  userId: string,
  chatId: string,
  messages: FeishuMessage[],
): Promise<void> {
  const session = sessionManager.getOrCreate(userId, chatId);

  // Merge text parts and collect all image keys across buffered messages
  const textParts: string[] = [];
  const imageDownloadTasks: Array<{ messageId: string; imageKey: string }> = [];

  for (const msg of messages) {
    const { text, imageKeys } = extractContent(msg);
    if (text) textParts.push(text);
    for (const key of imageKeys) imageDownloadTasks.push({ messageId: msg.message_id, imageKey: key });
  }

  // Download all images in parallel; log but don't abort on partial failure
  const imagePaths: string[] = [];
  if (imageDownloadTasks.length > 0) {
    const results = await Promise.allSettled(
      imageDownloadTasks.map(({ messageId, imageKey }) => downloadImage(messageId, imageKey)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") imagePaths.push(r.value);
      else console.warn("[Minister] Image download failed:", r.reason);
    }
  }

  const combinedText = textParts.join("\n");
  if (!combinedText && imagePaths.length === 0) return;

  console.log(
    `[Minister] Processing ${messages.length} msg(s) from ${userId}: ` +
    `"${combinedText.slice(0, 50)}", ${imagePaths.length} image(s)`,
  );

  // Build enriched prompt: image paths + text (user context is in system prompt)
  const imageAnnotations = imagePaths.map((p, i) => `[附带图片 ${i + 1}: ${p}]`).join("\n");
  const enrichedPrompt = [
    imageAnnotations,
    combinedText,
  ].filter(Boolean).join("\n");

  const cardMsgId = await sendCard(chatId, buildThinkingCard());
  if (!cardMsgId) {
    console.error("[Minister] Failed to send thinking card");
    return;
  }

  try {
    const tools: string[] = [];
    let accumulatedText = "";

    const result = await runEngine(enrichedPrompt, session, {
      onText: (chunk) => {
        accumulatedText += chunk;
        if (containsSensitiveContent(chunk)) {
          console.error(`[Minister] SECURITY ALERT: Sensitive content detected in response for user ${userId}, aborting`);
          return false; // Signal engine-bridge to kill the process
        }
        if (!canUpdate(cardMsgId)) return;
        updateCard(cardMsgId, buildStreamingCard(accumulatedText, tools))
          .catch((e) => console.warn("[Minister] Card update failed:", e));
      },
      onToolUse: (toolName) => {
        tools.push(toolName);
        if (!canUpdate(cardMsgId)) return;
        updateCard(cardMsgId, buildToolUseCard(accumulatedText, tools, toolName))
          .catch((e) => console.warn("[Minister] Card update failed:", e));
      },
    }, imagePaths);

    console.log(
      `[Minister] ${engineName} done. textLen=${result.text.length}, tools=${result.tools.length}, session=${result.sessionId}`,
    );
    await updateCard(cardMsgId, buildResultCard(result.text || "处理完毕，无文本输出。"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === SENSITIVE_CONTENT_ERROR) {
      console.error(`[Minister] SECURITY ALERT: Response blocked for user ${userId} — sensitive config content detected`);
      await updateCard(cardMsgId, buildErrorCard(
        "安全警告：系统检测到回复中包含敏感配置信息，已自动拦截并终止。此事件已被记录，请勿尝试获取系统内部信息。",
      ));
    } else {
      console.error("[Minister] Error:", msg);
      await updateCard(cardMsgId, buildErrorCard(msg));
    }
  } finally {
    lastUpdateTime.delete(cardMsgId);
    // Cleanup temp image files regardless of success or failure
    for (const p of imagePaths) {
      try { unlinkSync(p); } catch { /* already gone */ }
    }
  }
}

// --- Public entry point ---

// Reject messages older than this threshold to prevent re-processing after restart/reconnect
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Supported message types (text / image / post rich-text)
const SUPPORTED_TYPES = new Set(["text", "image", "post"]);

export async function handleMessage(data: {
  sender: { sender_id: { open_id?: string; user_id?: string }; sender_type: string };
  message: FeishuMessage;
}): Promise<void> {
  const { sender, message } = data;

  // Reject stale messages: guards against re-delivery after service restart or WS reconnect
  if (message.create_time) {
    const ageMs = Date.now() - Number(message.create_time);
    if (ageMs > MAX_MESSAGE_AGE_MS) {
      console.log(`[Minister] Skipping stale message ${message.message_id} (age: ${Math.round(ageMs / 1000)}s)`);
      return;
    }
  }

  // Deduplicate: skip if already processed within this session
  if (processedMessages.has(message.message_id)) return;
  processedMessages.set(message.message_id, Date.now());

  if (!SUPPORTED_TYPES.has(message.message_type)) return;

  // In group chat, only respond when the bot itself is @mentioned
  if (message.chat_type === "group") {
    if (!message.mentions?.length) return;
    const myOpenId = await botOpenId;
    if (!myOpenId || !message.mentions.some((m) => m.id.open_id === myOpenId)) return;
  }

  const userId = sender.sender_id.open_id || sender.sender_id.user_id || "unknown";

  // Quick ping/pong shortcut — bypass aggregation for instant response
  if (message.message_type === "text") {
    const { text } = extractContent(message);
    if (!text) return;
    if (text.toLowerCase() === "ping") {
      await client.im.v1.message.reply({
        path: { message_id: message.message_id },
        data: { content: JSON.stringify({ text: "pong" }), msg_type: "text" },
      });
      return;
    }
  }

  const queueKey = message.chat_type === "group" ? `${userId}:${message.chat_id}` : userId;
  addToAggregationBuffer(userId, queueKey, message);
}
