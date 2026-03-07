# Stage 1: Install production dependencies only
FROM oven/bun:1-debian AS deps

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/bot-server/package.json packages/bot-server/
COPY packages/feishu-mcp/package.json packages/feishu-mcp/
RUN bun install --frozen-lockfile --production

# Stage 2: Final runtime image
FROM oven/bun:1-debian

RUN apt-get update && apt-get install -y --no-install-recommends curl bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Claude CLI (native binary)
ENV PATH="/root/.local/bin:${PATH}"
RUN curl -fsSL https://claude.ai/install.sh | bash

WORKDIR /app

# Copy installed dependencies (bun hoists all deps to root node_modules)
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config
COPY package.json ./
COPY packages/shared/ packages/shared/
COPY packages/bot-server/ packages/bot-server/
COPY packages/feishu-mcp/ packages/feishu-mcp/
COPY .claude/ .claude/
COPY config/ config/
COPY scripts/ scripts/

RUN chmod +x scripts/docker-entrypoint.sh

CMD ["sh", "scripts/docker-entrypoint.sh"]
