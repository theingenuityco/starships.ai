# MCP Base Images

This directory contains Docker base images for MCP (Model Context Protocol) servers used in the Starships platform.

## Overview

The base images provide a standardized foundation for MCP server implementations with:
- Pre-installed MCP protocol dependencies
- Standardized logging and health checking
- Security best practices (non-root user)
- Optimized for containerized deployment

## Available Images

### 🟢 Node.js Base Image (`starships/mcp-node:latest`)

**Purpose**: For MCP servers implemented in JavaScript/TypeScript

**Features**:
- Node.js 20 Alpine base
- Pre-installed npm packages: typescript, tsx, nodemon
- MCP protocol helpers
- Health check endpoint
- Structured logging
- Non-root user (uid:1001)

**Usage**:
```dockerfile
FROM starships/mcp-node:latest

# Copy your MCP server code
COPY . /app

# Install dependencies
RUN npm install

# Start your MCP server
CMD ["npm", "start"]
```

### 🐍 Python Base Image (`starships/mcp-python:latest`)

**Purpose**: For MCP servers implemented in Python

**Features**:
- Python 3.11 slim base
- UV package manager for fast installs
- MCP SDK and FastAPI pre-installed
- Structured logging with structlog
- Health check utilities
- Non-root user

**Usage**:
```dockerfile
FROM starships/mcp-python:latest

# Copy your MCP server code
COPY . /app

# Install dependencies
RUN uv pip install -r requirements.txt

# Start your MCP server
CMD ["python", "main.py"]
```

## Building Images

Build all base images:
```bash
./build.sh
```

Build and push to registry:
```bash
./build.sh --push
```

Build specific image:
```bash
# Node.js image
cd node && docker build -t starships/mcp-node:latest .

# Python image
cd python && docker build -t starships/mcp-python:latest .
```

## Protocol Helpers

Both images include MCP protocol helper utilities:

### Node.js Helpers
- `health-check.js` - Health endpoint server
- `logger.js` - Structured logging with Winston
- `package.json` - Pre-configured dependencies

### Python Helpers
- `health_check.py` - Health check utility
- `logger.py` - Structured logging with structlog
- `requirements.txt` - MCP dependencies

## Health Checks

All images include standardized health checks:

**Endpoints**:
- `GET /health` - Full health status
- `GET /ready` - Readiness check (K8s compatible)

**Health Check Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-25T10:30:00Z",
  "uptime": 3600,
  "memory": {...},
  "pid": 1,
  "version": "1.0",
  "environment": "production",
  "starship_id": "starship-123",
  "template_slug": "github"
}
```

## Environment Variables

Standard environment variables supported by all images:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_PROTOCOL_VERSION` | MCP protocol version | `1.0` |
| `LOG_LEVEL` | Logging level | `info` |
| `STARSHIP_ID` | Starship identifier | `unknown` |
| `TEMPLATE_SLUG` | MCP template slug | `unknown` |
| `MCP_SERVICE_NAME` | Service name for logging | `mcp-server` |
| `HEALTH_CHECK_PORT` | Health check port | `3000` |

## Security Features

- **Non-root user**: All processes run as `appuser` (uid:1001)
- **Minimal attack surface**: Alpine/slim base images
- **Security updates**: Regular base image updates
- **Read-only filesystem**: Supports read-only containers

## Volume Mounts

Recommended volume mount points:

```yaml
volumes:
  - /data/starships/{starshipId}/workspace:/app/workspace  # Work directory
  - /data/starships/{starshipId}/config:/app/config        # Configuration
  - /data/starships/{starshipId}/logs:/app/logs            # Logs (optional)
```

## Integration with Starships

These base images are designed to work seamlessly with:
- Docker Compose generator service
- Template-to-Docker mapping system
- Health monitoring service
- Logging aggregation
- Network isolation per starship

## Testing

Test images locally:
```bash
# Test Node.js image
docker run --rm starships/mcp-node:latest node --version

# Test Python image  
docker run --rm starships/mcp-python:latest python --version

# Test health check
docker run -d -p 3000:3000 starships/mcp-node:latest
curl http://localhost:3000/health
```

## Maintenance

- **Updates**: Images should be rebuilt monthly for security updates
- **Monitoring**: Health check endpoints should be monitored
- **Logs**: Container logs are available via `docker logs`
- **Cleanup**: Old image versions should be cleaned up regularly