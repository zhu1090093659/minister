// System-level read-only routes — /api/v1/system/*
import { Hono } from "hono";
import { config } from "@minister/shared";

const systemRoutes = new Hono();

// GET /api/v1/system/defaults — system default configuration
systemRoutes.get("/defaults", (c) => {
  return c.json({
    systemPrompt: config.systemPrompt,
    engine: config.engine,
    model: config.claude.model,
  });
});

// GET /api/v1/system/skill-templates — built-in skill templates
systemRoutes.get("/skill-templates", (c) => {
  return c.json({
    templates: [
      {
        name: "workspace-guide",
        description: "Background knowledge for workspace customization — creating skills, installing MCP servers, managing preferences.",
        category: "system",
      },
      {
        name: "feishu-bitable",
        description: "Feishu Bitable (multi-dimensional tables) best practices — creating apps, tables, and records.",
        category: "feishu",
      },
    ],
  });
});

export { systemRoutes };
