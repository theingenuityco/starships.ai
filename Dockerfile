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

# Fix pnpm cache permissions
RUN mkdir -p /root/.cache/node/corepack/v1/pnpm && \
    chmod -R 777 /root/.cache

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

# Create user for running services
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy all application files
COPY --chown=nodejs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --chown=nodejs:nodejs supervisor-entrypoint.sh /app/supervisor-entrypoint.sh
COPY --chown=nodejs:nodejs production-startup.sh /app/production-startup.sh
RUN chmod +x /app/production-startup.sh
COPY --chown=nodejs:nodejs . .
RUN chmod +x /app/docker-entrypoint.sh /app/supervisor-entrypoint.sh

# Install dependencies (skip postinstall script which tries to detect Docker)
RUN SKIP_POSTINSTALL=1 pnpm install --ignore-scripts

# Build the application (bypass prebuild script entirely)
# Provide dummy env vars for build time only (real ones come from K8s secrets at runtime)
ENV STRIPE_SECRET_KEY=sk_test_dummy_build_only \
    STRIPE_WEBHOOK_SECRET=whsec_dummy_build_only \
    STRIPE_PUBLISHABLE_KEY=pk_test_dummy_build_only \
    NEO4J_URI=bolt://localhost:7687 \
    NEO4J_USERNAME=neo4j \
    NEO4J_PASSWORD=password \
    OPENAI_API_KEY=sk-dummy_build_only \
    ANTHROPIC_API_KEY=sk-ant-dummy_build_only \
    KINDE_CLIENT_ID=be7f5cf7e3ec4789a25a1875dd49f77d \
    KINDE_CLIENT_SECRET=IxdFNqlGrpBfYF2GFBI7uNVHhncU5QnZB000dfXjBk9VU0VHMRG \
    KINDE_ISSUER_URL=https://starships.kinde.com \
    KINDE_SITE_URL=http://starships.ai \
    KINDE_POST_LOGIN_REDIRECT_URL=http://starships.ai/fleet \
    KINDE_POST_LOGOUT_REDIRECT_URL=http://starships.ai
RUN npx turbo run build

# Create necessary directories
RUN mkdir -p data/sessions data/starships data/docker data/faiss_index && \
    mkdir -p /var/lib/neo4j/data /var/lib/neo4j/logs && \
    chown -R nodejs:nodejs data && \
    chown -R nodejs:nodejs /var/lib/neo4j && \
    chown -R nodejs:nodejs ${NEO4J_HOME}

# Supervisor config will be created dynamically by supervisor-entrypoint.sh
# based on whether NEO4J_EXTERNAL_URI is set

# Expose all ports
EXPOSE 3000 4000 7474 7687

# Health check for all services
HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 && \
      wget --no-verbose --tries=1 --spider http://localhost:4000/health && \
      wget --no-verbose --tries=1 --spider http://localhost:7474

# Default startup script for production
COPY do-deployment/all-in-one-optimized.yaml /deployment/
CMD ["/bin/sh", "-c", "cd /app/packages/client && npx next start"]