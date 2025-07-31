# Node.js Base Image for MCP Servers
# Optimized for Model Context Protocol implementations in JavaScript/TypeScript

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    git \
    curl \
    bash \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Install global npm packages commonly used by MCP servers
RUN npm install -g \
    npm@latest \
    typescript \
    tsx \
    nodemon

# Create app user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Create directories for MCP protocol handling
RUN mkdir -p /app/mcp-protocol /app/workspace /app/config && \
    chown -R appuser:appgroup /app

# Copy MCP protocol helper scripts
COPY --chown=appuser:appgroup mcp-protocol/ /app/mcp-protocol/

# Install MCP protocol dependencies
WORKDIR /app/mcp-protocol
COPY --chown=appuser:appgroup mcp-protocol/package.json ./
RUN npm install --production

# Switch back to main working directory
WORKDIR /app

# Switch to non-root user
USER appuser

# Set environment variables
ENV NODE_ENV=production
ENV MCP_PROTOCOL_VERSION=1.0
ENV LOG_LEVEL=info

# Expose common MCP server port (customizable via compose)
EXPOSE 3000

# Health check for MCP server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Default command (will be overridden by docker-compose)
CMD ["node", "--version"]