# Stage 1: Install all dependencies (including devDependencies for admin-ui build)
FROM oven/bun:1-debian AS deps

ARG NPM_REGISTRY=https://registry.npmjs.org
ENV BUN_CONFIG_REGISTRY=$NPM_REGISTRY

WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/bot-server/package.json packages/bot-server/
COPY packages/feishu-mcp/package.json packages/feishu-mcp/
COPY packages/admin-ui/package.json packages/admin-ui/
RUN bun install --frozen-lockfile

# Stage 2: Build admin-ui static assets
FROM deps AS admin-build
COPY packages/shared/ packages/shared/
COPY packages/admin-ui/ packages/admin-ui/
COPY tsconfig.json ./
RUN cd packages/admin-ui && bun run build

# Stage 3: Final runtime image
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
ARG NPM_REGISTRY=https://registry.npmjs.org
ENV BUN_CONFIG_REGISTRY=$NPM_REGISTRY
RUN bun install -g @openai/codex

WORKDIR /app

# Copy installed dependencies (production only — reinstall without devDependencies)
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and config
COPY package.json ./
COPY packages/shared/ packages/shared/
COPY packages/bot-server/ packages/bot-server/
COPY packages/feishu-mcp/ packages/feishu-mcp/

# Copy workspace-specific node_modules (Bun places per-workspace deps here, not root)
COPY --from=deps /app/packages/bot-server/node_modules ./packages/bot-server/node_modules
COPY --from=deps /app/packages/feishu-mcp/node_modules ./packages/feishu-mcp/node_modules

# Copy admin-ui build output (static files served by Hono)
COPY --from=admin-build /app/packages/admin-ui/dist packages/admin-ui/dist
COPY .claude/ .claude/
COPY config/ config/
COPY scripts/ scripts/

RUN chmod +x scripts/docker-entrypoint.sh

CMD ["sh", "scripts/docker-entrypoint.sh"]
