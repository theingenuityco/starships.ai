# ==========================================
# Starships.ai - Application Container
# Contains: Frontend + Backend (no embedded PostgreSQL)
# ==========================================

FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache \
    python3 make g++ git bash wget curl netcat-openbsd \
    supervisor \
    ca-certificates

# Create supervisor config directory
RUN mkdir -p /etc/supervisor/conf.d

# Fix pnpm cache permissions for all users
# The node:20-alpine image already has a 'node' user with uid 1000
RUN mkdir -p /root/.cache/node/corepack/v1/pnpm && \
    chmod -R 755 /root/.cache && \
    mkdir -p /home/node/.cache/node/corepack/v1/pnpm && \
    chown -R node:node /home/node/.cache && \
    chmod -R 755 /home/node/.cache && \
    # Also create a nodejs user as an alias for compatibility
    adduser -D -u 1001 -G node nodejs && \
    mkdir -p /home/nodejs/.cache/node/corepack/v1/pnpm && \
    chown -R nodejs:node /home/nodejs/.cache && \
    chmod -R 755 /home/nodejs/.cache

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

# Install concurrently globally
RUN npm install -g concurrently

# The nodejs user was already created earlier for pnpm cache permissions

# Copy all application files
COPY --chown=nodejs:node docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --chown=nodejs:node supervisor-entrypoint.sh /app/supervisor-entrypoint.sh
COPY --chown=nodejs:node . .
RUN chmod +x /app/docker-entrypoint.sh /app/supervisor-entrypoint.sh

# Set DOCKER_BUILD=true to skip Docker checks in postinstall
ENV DOCKER_BUILD=true

# Install dependencies
RUN pnpm install --frozen-lockfile

# Cache bust to force rebuild when environment variables change
ARG CACHE_BUST=1
RUN echo "Cache bust: ${CACHE_BUST}"

# Build the application with secrets mounted (not stored in layers)
# Secrets are only available during this RUN command, not in the final image.
# After building, ensure that the runtime user (nodejs) owns the application
# files so that processes like the docs server can write generated artifacts.
RUN --mount=type=secret,id=stripe_secret_key \
    --mount=type=secret,id=stripe_publishable_key \
    STRIPE_SECRET_KEY=$(cat /run/secrets/stripe_secret_key 2>/dev/null || echo "") \
    STRIPE_PUBLISHABLE_KEY=$(cat /run/secrets/stripe_publishable_key 2>/dev/null || echo "") \
    pnpm run build && \
    chown -R nodejs:node /app

# Create necessary directories
RUN mkdir -p data/sessions data/starships data/docker && \
    chown -R nodejs:node data

# Supervisor config will be created by supervisor-entrypoint.sh

# Expose application ports
EXPOSE 3000 3001 4000

# Health check for frontend and backend
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      wget --no-verbose --tries=1 --spider http://localhost:4000/api/v1/health

# Start supervisor to manage all services
CMD ["/app/supervisor-entrypoint.sh"]