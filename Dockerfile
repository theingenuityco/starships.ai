# ==========================================
# Starships.ai - All-in-One Fat Container
# Contains: Frontend + Backend + PostgreSQL Database
# ==========================================

FROM node:20-alpine
WORKDIR /app

# Install system dependencies including PostgreSQL
RUN apk add --no-cache \
    python3 make g++ git bash wget curl netcat-openbsd \
    postgresql postgresql-contrib postgresql-client \
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

# Configure PostgreSQL
ENV POSTGRES_VERSION=15
ENV PGDATA=/var/lib/postgresql/data

# Install su-exec for user switching and prepare PostgreSQL directories
# PostgreSQL will be initialized at runtime by supervisor-entrypoint.sh
# This allows proper volume mount support without overwriting initialization
RUN apk add --no-cache su-exec && \
    mkdir -p /var/lib/postgresql/data /run/postgresql /var/log/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql /var/log/postgresql && \
    chmod 700 /var/lib/postgresql/data && \
    chmod 775 /run/postgresql

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

# Copy PostgreSQL initialization script (standard pattern)
RUN mkdir -p /docker-entrypoint-initdb.d
COPY --chown=postgres:postgres init-postgres.sh /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/init-postgres.sh

# Set DOCKER_BUILD=true to skip Docker checks in postinstall
ENV DOCKER_BUILD=true

# Install dependencies
RUN pnpm install --frozen-lockfile

# Cache bust to force rebuild when environment variables change
ARG CACHE_BUST=1
RUN echo "Cache bust: ${CACHE_BUST}"

# Build the application with secrets mounted (not stored in layers)
# Secrets are only available during this RUN command, not in the final image
RUN --mount=type=secret,id=stripe_secret_key \
    --mount=type=secret,id=stripe_publishable_key \
    STRIPE_SECRET_KEY=$(cat /run/secrets/stripe_secret_key 2>/dev/null || echo "") \
    STRIPE_PUBLISHABLE_KEY=$(cat /run/secrets/stripe_publishable_key 2>/dev/null || echo "") \
    pnpm run build

# Create necessary directories
RUN mkdir -p data/sessions data/starships data/docker && \
    chown -R nodejs:node data

# Supervisor config will be created dynamically by supervisor-entrypoint.sh
# based on whether POSTGRES_EXTERNAL_HOST is set

# Expose all ports
EXPOSE 3000 4000 5432

# Health check for all services
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      wget --no-verbose --tries=1 --spider http://localhost:4000/health && \
      pg_isready -h localhost -p 5432

# Start supervisor to manage all services
CMD ["/app/supervisor-entrypoint.sh"]