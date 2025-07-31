# Python Base Image for MCP Servers
# Optimized for Model Context Protocol implementations in Python

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install UV package manager for fast Python installs
RUN pip install --no-cache-dir uv

# Create app user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Create directories for MCP protocol handling
RUN mkdir -p /app/mcp-protocol /app/workspace /app/config /app/logs && \
    chown -R appuser:appgroup /app

# Copy MCP protocol helper scripts
COPY --chown=appuser:appgroup mcp-protocol/ /app/mcp-protocol/

# Install MCP protocol dependencies
WORKDIR /app/mcp-protocol
COPY --chown=appuser:appgroup mcp-protocol/requirements.txt ./
RUN uv pip install --system -r requirements.txt

# Switch back to main working directory
WORKDIR /app

# Switch to non-root user
USER appuser

# Set environment variables
ENV PYTHONPATH=/app:/app/mcp-protocol
ENV PYTHONUNBUFFERED=1
ENV MCP_PROTOCOL_VERSION=1.0
ENV LOG_LEVEL=INFO

# Expose common MCP server port (customizable via compose)
EXPOSE 3000

# Health check for MCP server
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python /app/mcp-protocol/health_check.py || exit 1

# Default command (will be overridden by docker-compose)
CMD ["python", "--version"]