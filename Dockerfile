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

ARG APT_MIRROR=deb.debian.org
# Bootstrap: mirror may redirect HTTP→HTTPS; disable SSL verify until ca-certificates is installed
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/*.sources 2>/dev/null; \
    sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list 2>/dev/null; \
    printf 'Acquire { https::Verify-Peer false; https::Verify-Host false; };\n' \
        > /etc/apt/apt.conf.d/99bootstrap-insecure; \
    apt-get update && \
    apt-get install -y --no-install-recommends curl bash ca-certificates && \
    rm /etc/apt/apt.conf.d/99bootstrap-insecure && \
    rm -rf /var/lib/apt/lists/*

# Install Claude CLI (native binary)
ENV PATH="/root/.local/bin:${PATH}"
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install Codex CLI (npm global — only used when ENGINE_TYPE=codex)
RUN bun install -g @openai/codex

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
