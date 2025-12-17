# ==========================================
# Starships.ai - Application Container
# Contains: Frontend + Backend (no embedded PostgreSQL)
# ==========================================

FROM node:20-alpine AS builder
WORKDIR /app

# Share Corepack artifacts across users/stages (avoid per-user caches)
ENV COREPACK_HOME=/usr/local/share/corepack
RUN mkdir -p "$COREPACK_HOME" && chmod 755 "$COREPACK_HOME"

# Build-time OS deps (toolchain stays in builder only)
RUN apk add --no-cache \
    python3 make g++ git bash wget curl netcat-openbsd \
    ca-certificates

# Enable pnpm (via corepack)
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

# Set DOCKER_BUILD=true to skip Docker checks in postinstall
ENV DOCKER_BUILD=true

# Increase Node heap for monorepo builds in Docker (configurable)
# Can be overridden at build time: --build-arg NODE_MAX_OLD_SPACE_SIZE=8192
ARG NODE_MAX_OLD_SPACE_SIZE=8192
ENV NODE_OPTIONS="--no-node-snapshot --max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}"

# Prime pnpm store from lockfile (cacheable) then do an offline install after full source copy.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm fetch --frozen-lockfile

# Copy the rest of the monorepo
COPY . .

# Install dependencies using the primed store (offline)
RUN --mount=type=cache,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --offline

# Build the application with secrets mounted (not stored in layers)
RUN --mount=type=secret,id=stripe_secret_key \
    --mount=type=secret,id=stripe_publishable_key \
    STRIPE_SECRET_KEY=$(cat /run/secrets/stripe_secret_key 2>/dev/null || echo "") \
    STRIPE_PUBLISHABLE_KEY=$(cat /run/secrets/stripe_publishable_key 2>/dev/null || echo "") \
    NODE_OPTIONS="--no-node-snapshot --max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE}" pnpm run build


FROM node:20-alpine AS runtime
WORKDIR /app

# Share Corepack artifacts across users/stages (avoid per-user caches)
ENV COREPACK_HOME=/usr/local/share/corepack
RUN mkdir -p "$COREPACK_HOME" && chmod 755 "$COREPACK_HOME"

# Runtime-only OS deps
RUN apk add --no-cache \
    bash wget curl netcat-openbsd \
    supervisor \
    ca-certificates

# Create supervisor config directory
RUN mkdir -p /etc/supervisor/conf.d

# Enable pnpm (via corepack) and install concurrently globally
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate && \
    npm install -g concurrently

# Create a nodejs user as an alias for compatibility
# The base image already has a 'node' user/group; we reuse group 'node'.
RUN adduser -D -u 1001 -G node nodejs

# Copy runtime files (built outputs + deps) from builder
COPY --from=builder --chown=nodejs:node /app/docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --from=builder --chown=nodejs:node /app/supervisor-entrypoint.sh /app/supervisor-entrypoint.sh
COPY --from=builder --chown=nodejs:node /app/package.json /app/package.json
COPY --from=builder --chown=nodejs:node /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder --chown=nodejs:node /app/turbo.json /app/turbo.json
COPY --from=builder --chown=nodejs:node /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder --chown=nodejs:node /app/tsconfig.nodejs.json /app/tsconfig.nodejs.json
COPY --from=builder --chown=nodejs:node /app/node_modules /app/node_modules
COPY --from=builder --chown=nodejs:node /app/packages /app/packages

RUN chmod +x /app/docker-entrypoint.sh /app/supervisor-entrypoint.sh

# Create necessary directories
RUN mkdir -p data/sessions data/starships data/docker && \
    chown -R nodejs:node data

# Expose application ports
EXPOSE 3000 3001 4000

# Health check for frontend and backend
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health

# Start supervisor to manage all services
CMD ["/app/supervisor-entrypoint.sh"]