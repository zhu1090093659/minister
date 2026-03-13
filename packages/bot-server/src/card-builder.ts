// Build Feishu interactive message cards

// Convert standard Markdown to lark_md compatible format.
// lark_md does not support # headings, > blockquotes, or --- horizontal rules.
function convertToLarkMd(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) return `**${heading[2].trim()}**`;

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) return quote[1];

      if (/^[-*_]{3,}\s*$/.test(line)) return "————————";

      return line;
    })
    .join("\n");
}

interface CardOptions {
  title: string;
  content: string;
  status?: string;
  tools?: string[];
  headerColor?: string;
}

export function buildProgressCard(opts: CardOptions): string {
  const elements: unknown[] = [];

  // Main content
  if (opts.content) {
    elements.push({
      tag: "div",
      text: { tag: "lark_md", content: convertToLarkMd(opts.content) },
    });
  }

  // Tool execution chain
  if (opts.tools?.length) {
    elements.push({
      tag: "note",
      elements: [
        { tag: "plain_text", content: `Tools: ${opts.tools.join(" → ")}` },
      ],
    });
  }

  elements.push({ tag: "hr" });

  // Status footer
  elements.push({
    tag: "note",
    elements: [
      { tag: "plain_text", content: opts.status || "Processing..." },
    ],
  });

  const card = {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: opts.title },
      template: opts.headerColor || "blue",
    },
    elements,
  };

  return JSON.stringify(card);
}

export function buildThinkingCard(): string {
  return buildProgressCard({
    title: "丞相正在思考...",
    content: "正在分析您的请求...",
    status: "思考中...",
    headerColor: "blue",
  });
}

export function buildResultCard(content: string): string {
  return buildProgressCard({
    title: "丞相",
    content,
    status: "处理完毕",
    headerColor: "green",
  });
}

export function buildStreamingCard(content: string, tools: string[]): string {
  return buildProgressCard({
    title: "丞相正在思考...",
    content,
    tools,
    status: "处理中...",
  });
}

export function buildToolUseCard(content: string, tools: string[], toolName: string): string {
  return buildProgressCard({
    title: "丞相正在工作...",
    content: content || "正在调用工具...",
    tools,
    status: `正在使用: ${toolName}`,
  });
}

export function buildErrorCard(error: string): string {
  return buildProgressCard({
    title: "丞相 - 出错了",
    content: error,
    status: "处理失败",
    headerColor: "red",
  });
}

export function buildAuthCard(authUrl: string): string {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "启用用户身份" },
      template: "orange",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content:
            "为了让文档、日程、任务和表格以**你的身份**创建，请先完成一次授权。授权后，后续相关操作会自动使用你的账号。",
        },
      },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "立即授权" },
            type: "primary",
            url: authUrl,
          },
        ],
      },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "未授权前，系统会继续使用应用身份执行本次请求。",
          },
        ],
      },
    ],
  });
}
