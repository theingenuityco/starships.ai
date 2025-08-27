# ==========================================
# Starships.ai - All-in-One Fat Container
# Contains: Frontend + Backend + Neo4j Database
# ==========================================

FROM node:20-alpine
WORKDIR /app

# Install system dependencies including Java 17 for Neo4j
RUN apk add --no-cache \
    python3 make g++ git bash wget curl netcat-openbsd \
    openjdk17-jre-headless \
    supervisor \
    ca-certificates

# Create supervisor config directory
RUN mkdir -p /etc/supervisor/conf.d

# Fix pnpm cache permissions for all users
# The node:20-alpine image already has a 'node' user with uid 1000
RUN mkdir -p /root/.cache/node/corepack/v1/pnpm && \
    chmod -R 777 /root/.cache && \
    mkdir -p /home/node/.cache/node/corepack/v1/pnpm && \
    chown -R node:node /home/node/.cache && \
    chmod -R 777 /home/node/.cache && \
    # Also create a nodejs user as an alias for compatibility
    adduser -D -u 1001 -G node nodejs && \
    mkdir -p /home/nodejs/.cache/node/corepack/v1/pnpm && \
    chown -R nodejs:node /home/nodejs/.cache && \
    chmod -R 777 /home/nodejs/.cache

# Download and install Neo4j Community Edition
ENV NEO4J_VERSION=5.13.0
ENV NEO4J_HOME=/opt/neo4j

# Download Neo4j with multiple fallback URLs and proper error handling
RUN set -eux && \
    echo "Downloading Neo4j ${NEO4J_VERSION}..." && \
    (wget --progress=dot:giga --timeout=300 --tries=3 \
        -O neo4j.tar.gz \
        "https://dist.neo4j.com/neo4j-community-${NEO4J_VERSION}-unix.tar.gz" || \
    wget --progress=dot:giga --timeout=300 --tries=3 \
        -O neo4j.tar.gz \
        "https://neo4j.com/artifact.php?name=neo4j-community-${NEO4J_VERSION}-unix.tar.gz" || \
    curl -L --progress-bar --retry 3 --retry-delay 5 \
        -o neo4j.tar.gz \
        "https://dist.neo4j.com/neo4j-community-${NEO4J_VERSION}-unix.tar.gz") && \
    echo "Download complete. Extracting Neo4j..." && \
    tar -xzf neo4j.tar.gz && \
    mv neo4j-community-${NEO4J_VERSION} ${NEO4J_HOME} && \
    rm neo4j.tar.gz && \
    echo "Neo4j ${NEO4J_VERSION} installed successfully at ${NEO4J_HOME}"

# Configure Neo4j
RUN echo "server.default_listen_address=0.0.0.0" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.bolt.listen_address=:7687" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.http.listen_address=:7474" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.https.listen_address=:7473" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.security.auth_enabled=false" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.heap.initial_size=512m" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.heap.max_size=1G" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.pagecache.size=512m" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.connector.bolt.enabled=true" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.connector.http.enabled=true" >> ${NEO4J_HOME}/conf/neo4j.conf

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
# Secrets are only available during this RUN command, not in the final image
RUN --mount=type=secret,id=stripe_secret_key \
    --mount=type=secret,id=stripe_publishable_key \
    --mount=type=secret,id=kinde_client_id \
    --mount=type=secret,id=kinde_client_secret \
    --mount=type=secret,id=kinde_issuer_url \
    --mount=type=secret,id=kinde_site_url \
    --mount=type=secret,id=kinde_post_login_redirect_url \
    --mount=type=secret,id=kinde_post_logout_redirect_url \
    --mount=type=secret,id=next_public_api_url \
    --mount=type=secret,id=next_public_server_url \
    STRIPE_SECRET_KEY=$(cat /run/secrets/stripe_secret_key 2>/dev/null || echo "") \
    STRIPE_PUBLISHABLE_KEY=$(cat /run/secrets/stripe_publishable_key 2>/dev/null || echo "") \
    KINDE_CLIENT_ID=$(cat /run/secrets/kinde_client_id 2>/dev/null || echo "") \
    KINDE_CLIENT_SECRET=$(cat /run/secrets/kinde_client_secret 2>/dev/null || echo "") \
    KINDE_ISSUER_URL=$(cat /run/secrets/kinde_issuer_url 2>/dev/null || echo "") \
    KINDE_SITE_URL=$(cat /run/secrets/kinde_site_url 2>/dev/null || echo "") \
    KINDE_POST_LOGIN_REDIRECT_URL=$(cat /run/secrets/kinde_post_login_redirect_url 2>/dev/null || echo "") \
    KINDE_POST_LOGOUT_REDIRECT_URL=$(cat /run/secrets/kinde_post_logout_redirect_url 2>/dev/null || echo "") \
    NEXT_PUBLIC_API_URL=$(cat /run/secrets/next_public_api_url 2>/dev/null || echo "http://localhost:4000/api") \
    NEXT_PUBLIC_SERVER_URL=$(cat /run/secrets/next_public_server_url 2>/dev/null || echo "http://localhost:4000") \
    pnpm run build

# Create necessary directories
RUN mkdir -p data/sessions data/starships data/docker && \
    mkdir -p /var/lib/neo4j/data /var/lib/neo4j/logs && \
    chown -R nodejs:node data && \
    chown -R nodejs:node /var/lib/neo4j && \
    chown -R nodejs:node ${NEO4J_HOME}

# Supervisor config will be created dynamically by supervisor-entrypoint.sh
# based on whether NEO4J_EXTERNAL_URI is set

# Expose all ports
EXPOSE 3000 4000 7474 7687

# Health check for all services
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      wget --no-verbose --tries=1 --spider http://localhost:4000/health && \
      wget --no-verbose --tries=1 --spider http://localhost:7474

# Start supervisor to manage all services
CMD ["/app/supervisor-entrypoint.sh"]