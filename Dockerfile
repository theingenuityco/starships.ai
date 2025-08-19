# ==========================================
# Starships.ai - All-in-One Fat Container
# Contains: Frontend + Backend + Neo4j Database
# ==========================================

FROM node:20-alpine
WORKDIR /app

# Install system dependencies including Java for Neo4j
RUN apk add --no-cache \
    python3 make g++ git bash wget curl netcat-openbsd \
    openjdk11-jre-headless \
    supervisor

# Download and install Neo4j Community Edition
ENV NEO4J_VERSION=5.13.0
ENV NEO4J_HOME=/opt/neo4j
RUN wget -q https://dist.neo4j.com/neo4j-community-${NEO4J_VERSION}-unix.tar.gz && \
    tar -xzf neo4j-community-${NEO4J_VERSION}-unix.tar.gz && \
    mv neo4j-community-${NEO4J_VERSION} ${NEO4J_HOME} && \
    rm neo4j-community-${NEO4J_VERSION}-unix.tar.gz

# Configure Neo4j
RUN echo "server.default_listen_address=0.0.0.0" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.bolt.listen_address=:7687" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.http.listen_address=:7474" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "server.https.listen_address=:7473" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.security.auth_enabled=false" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.heap.initial_size=512m" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.heap.max_size=1G" >> ${NEO4J_HOME}/conf/neo4j.conf && \
    echo "dbms.memory.pagecache.size=512m" >> ${NEO4J_HOME}/conf/neo4j.conf

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

# Install concurrently globally
RUN npm install -g concurrently

# Create user for running services
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy application files
COPY --chown=nodejs:nodejs docker-entrypoint.sh /app/docker-entrypoint.sh
COPY --chown=nodejs:nodejs supervisor-entrypoint.sh /app/supervisor-entrypoint.sh
COPY --chown=nodejs:nodejs . .
RUN chmod +x /app/docker-entrypoint.sh /app/supervisor-entrypoint.sh

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

# Start supervisor to manage all services
CMD ["/app/supervisor-entrypoint.sh"]