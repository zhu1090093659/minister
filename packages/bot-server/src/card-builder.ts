// Build Feishu interactive message cards

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
      text: { tag: "lark_md", content: opts.content },
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
