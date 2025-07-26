FROM node:18-alpine

# Install common dependencies for MCP servers
RUN apk add --no-cache curl python3 py3-pip git bash

# Install Python package manager for Python MCP servers
RUN pip3 install --break-system-packages uv

# Create app directory
WORKDIR /app

# Copy package files and install ALL dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy TypeScript source
COPY src/ ./src/

# Install TypeScript compiler and types, then compile the source
RUN npm install -g typescript && \
    npm install @types/node @types/express --save-dev && \
    npx tsc --target ES2020 --module commonjs --outDir ./lib --rootDir ./src --esModuleInterop --skipLibCheck src/services/mcp/HttpBridge.ts

# Copy application code
COPY server.js ./

# Remove dev dependencies but keep the compiled code
RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Create directories for MCP server data
RUN mkdir -p /data /workspace /credentials && \
    chown -R nodejs:nodejs /data /workspace /credentials /app

# Switch to non-root user
USER nodejs

# Expose the HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the HTTP bridge server
CMD ["node", "server.js"]