# MCP HTTP Bridge Migration Guide

## Overview

This guide provides step-by-step instructions for migrating existing MCP connectors from the stdio-based approach to the new HTTP bridge architecture. The HTTP bridge eliminates stdio hacks, provides proper health checking, and enables multi-client access.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Changes](#architecture-changes)
3. [Migration Process](#migration-process)
4. [Testing Guide](#testing-guide)
5. [Troubleshooting](#troubleshooting)
6. [Performance Optimization](#performance-optimization)
7. [API Reference](#api-reference)

## Prerequisites

Before starting the migration, ensure you have:

- ✅ Docker and Docker Compose installed
- ✅ HTTP bridge Docker image built (`starships/mcp-http-bridge:latest`)
- ✅ Database connectivity (Neo4j)
- ✅ Backup of existing connector configurations
- ✅ Access to starship management APIs

## Architecture Changes

### Before: Stdio-based MCP Deployment

```
[Starship Application] 
    ↓ stdio (JSON-RPC)
[MCP Server Process] ← Port conflicts, stdio hacks, poor health checks
```

**Problems:**
- Stdio workarounds: `(echo JSON; sleep infinity)`
- Confusing logs from malformed JSON-RPC
- Process-only health checks
- No multi-client support

### After: HTTP Bridge Architecture

```
[Starship Application Container]
    ↓ HTTP Requests (internal Docker network)
[MCP HTTP Bridge Container] ← Port 8080 (internal only)
    ↓ stdio (JSON-RPC)
[MCP Server Process]
```

**Benefits:**
- ✅ Clean HTTP APIs
- ✅ Functional health validation
- ✅ Multi-client ready
- ✅ Proper error handling
- ✅ Request caching and optimization

## Migration Process

### Step 1: Enable HTTP Bridge Feature Flag

Set the feature flag to enable HTTP bridge templates:

```bash
# Environment variable
export MCP_HTTP_BRIDGE_ENABLED=true

# Or via API
curl -X POST http://localhost:4000/api/admin/feature-flags \
  -H "Content-Type: application/json" \
  -d '{"name": "MCP_HTTP_BRIDGE_ENABLED", "enabled": true}'
```

### Step 2: Automated Migration Script

Use the built-in migration service to migrate existing connectors:

```typescript
import { connectorMigrationService } from '@starships/core';

// Migrate single connector
const result = await connectorMigrationService.migrateToHttpBridge({
  connectorId: 'your-connector-id',
  backupBeforeMigration: true,
  rollbackOnFailure: true,
  testBeforeSwitch: true,
  gracefulShutdown: true
});

// Migrate all connectors of a template
const results = await connectorMigrationService.migrateAllConnectorsByTemplate('brave', {
  backupBeforeMigration: true,
  rollbackOnFailure: true,
  testBeforeSwitch: true
});
```

### Step 3: Manual Migration (Alternative)

If you prefer manual control, follow these steps:

#### 3.1 Update Connector Configuration

```javascript
// Update connector to use HTTP bridge
await mcpConnectorRepo.update(connectorId, {
  httpBridgeEnabled: true,
  dockerServiceName: `mcp-${starshipId}-${templateSlug}-http`,
  internalUrl: `http://mcp-${starshipId}-${templateSlug}-http:8080`,
  bridgeVersion: '1.0.0'
});
```

#### 3.2 Deploy HTTP Bridge Container

```yaml
# Docker Compose file update
services:
  mcp-brave-http:
    image: starships/mcp-http-bridge:latest
    container_name: mcp-${starshipId}-brave-http
    environment:
      MCP_SERVER_CMD: npx -y @modelcontextprotocol/server-brave-search
      MCP_SERVER_ARGS: ""
      HTTP_PORT: "8080"
      HEALTH_CHECK_TIMEOUT: "10000"
      LOG_LEVEL: info
      BRAVE_API_KEY: ${BRAVE_API_KEY}
    networks:
      - starship-${starshipId}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

#### 3.3 Test HTTP Bridge Endpoints

```bash
# Health check
curl http://mcp-starship-brave-http:8080/health

# List tools
curl http://mcp-starship-brave-http:8080/tools

# Execute tool
curl -X POST http://mcp-starship-brave-http:8080/tools/brave_search \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "test query"}}'
```

### Step 4: Remove Legacy Container

Once the HTTP bridge is confirmed working:

```bash
# Remove old stdio-based container
docker stop mcp-${starshipId}-${templateSlug}
docker rm mcp-${starshipId}-${templateSlug}
```

## Testing Guide

### Health Check Validation

The HTTP bridge provides comprehensive health checking:

```bash
# Basic health check
curl http://localhost:8080/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00Z",
  "checks": {
    "mcp_process": "running",
    "mcp_protocol": "responsive", 
    "api_validation": "valid",
    "response_time_ms": 45
  },
  "tools": ["brave_search"],
  "last_error": null
}
```

### API Endpoint Testing

```bash
# Test all endpoints
curl http://localhost:8080/capabilities  # Get MCP capabilities
curl http://localhost:8080/tools        # List available tools
curl http://localhost:8080/resources    # List available resources
curl http://localhost:8080/status       # Detailed status and metrics
```

### Performance Testing

Use the built-in performance test script:

```bash
npx ts-node src/scripts/performance-test-http-bridge.ts
```

Expected benchmarks:
- Health endpoint: < 50ms average response time
- Tools listing: < 100ms average response time
- Tool execution: < 500ms (depends on external API)
- 99%+ success rate for all endpoints

## Troubleshooting

### Common Issues

#### 1. Container Health Check Failing

**Symptoms:**
- Container shows as unhealthy in Docker
- HTTP endpoints return connection refused

**Solutions:**
```bash
# Check container logs
docker logs mcp-${starshipId}-${templateSlug}-http

# Verify MCP server command
docker exec mcp-${starshipId}-${templateSlug}-http ps aux

# Test health endpoint directly
docker exec mcp-${starshipId}-${templateSlug}-http curl http://localhost:8080/health
```

#### 2. API Key Validation Errors

**Symptoms:**
- Tools return authentication errors
- Health check shows "api_validation": "invalid"

**Solutions:**
```bash
# Verify environment variables
docker exec mcp-${starshipId}-${templateSlug}-http env | grep API_KEY

# Test API key manually
curl -X POST http://localhost:8080/validate \
  -H "Content-Type: application/json" \
  -d '{"test_connection": true}'
```

#### 3. Performance Issues

**Symptoms:**
- Slow response times
- High CPU/memory usage
- Request timeouts

**Solutions:**
- Enable request caching
- Adjust connection pool size
- Monitor circuit breaker status
- Check rate limiting configuration

### Migration Rollback

If migration fails, you can rollback:

```typescript
// Automated rollback
const rollbackResult = await connectorMigrationService.migrateToStdio({
  connectorId: 'your-connector-id'
});

// Manual rollback
await mcpConnectorRepo.update(connectorId, {
  httpBridgeEnabled: false,
  dockerServiceName: `mcp-${starshipId}-${templateSlug}`,
  internalUrl: undefined,
  bridgeVersion: undefined
});
```

## Performance Optimization

### Enable Request Caching

```typescript
import { HTTPBridgeCache } from '@starships/core';

const cache = new HTTPBridgeCache({
  maxSize: 1000,
  ttl: 5 * 60 * 1000 // 5 minutes
});

// Cache frequently accessed tools/resources
```

### Circuit Breaker Configuration

```typescript
import { CircuitBreaker } from '@starships/core';

const circuitBreaker = new CircuitBreaker(
  5,      // failure threshold
  60000   // recovery timeout (1 minute)
);
```

### Rate Limiting

```typescript
import { RateLimiter } from '@starships/core';

const rateLimiter = new RateLimiter(
  100,    // max requests
  60000   // per minute
);
```

### Connection Pooling

```typescript
import { MCPConnectionPool } from '@starships/core';

const connectionPool = new MCPConnectionPool(10); // max 10 connections
```

## API Reference

### HTTP Bridge Endpoints

#### GET /health
Health check with functional validation.

**Response:**
```json
{
  "status": "healthy|unhealthy",
  "timestamp": "ISO-8601",
  "checks": {
    "mcp_process": "running|stopped",
    "mcp_protocol": "responsive|unresponsive", 
    "api_validation": "valid|invalid|skipped",
    "response_time_ms": 45
  },
  "tools": ["tool1", "tool2"],
  "last_error": null
}
```

#### GET /tools
List available MCP tools.

**Response:**
```json
{
  "tools": [
    {
      "name": "brave_search",
      "description": "Search the web using Brave Search API",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": {"type": "string"}
        }
      }
    }
  ]
}
```

#### POST /tools/{toolName}
Execute specific tool.

**Request:**
```json
{
  "arguments": {
    "query": "search query"
  }
}
```

**Response:**
```json
{
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Search results..."
      }
    ]
  },
  "execution_time_ms": 234
}
```

#### GET /resources
List available MCP resources.

#### GET /resources/{uri}
Get specific resource content.

#### POST /validate
Test API keys and configuration.

#### GET /status
Detailed status and metrics.

#### GET /capabilities
Get MCP server capabilities.

### Error Responses

HTTP status codes map to MCP error codes:

| MCP Error Code | HTTP Status | Description |
|----------------|-------------|-------------|
| -32700 | 400 | Parse error |
| -32600 | 400 | Invalid Request |
| -32601 | 404 | Method not found |
| -32602 | 422 | Invalid params |
| -32603 | 500 | Internal error |
| 1001 | 401 | Unauthorized (invalid API key) |
| 1002 | 403 | Forbidden (rate limited) |
| 1003 | 404 | Resource not found |
| 1004 | 429 | Too many requests |
| 1005 | 503 | Service unavailable |

### Service Discovery API

#### GET /api/starships/{starshipId}/mcp-services
List all MCP service endpoints for a starship.

**Response:**
```json
{
  "services": [
    {
      "connectorId": "abc-123",
      "slug": "brave",
      "internalUrl": "http://mcp-starship-brave-http:8080",
      "status": "healthy",
      "lastHealthCheck": "2024-01-01T12:00:00Z",
      "availableTools": ["brave_search"],
      "availableResources": []
    }
  ]
}
```

## Migration Checklist

### Pre-Migration
- [ ] HTTP bridge Docker image built and available
- [ ] Feature flag enabled (`MCP_HTTP_BRIDGE_ENABLED=true`)
- [ ] Database connectivity verified
- [ ] Backup of existing connector configurations created
- [ ] Migration scripts tested in staging environment

### During Migration
- [ ] Migration service executed successfully
- [ ] HTTP bridge containers deployed and healthy
- [ ] API endpoints responding correctly
- [ ] Tools and resources accessible
- [ ] Performance benchmarks met
- [ ] Legacy containers removed

### Post-Migration
- [ ] Service discovery APIs updated
- [ ] Monitoring and alerting configured
- [ ] Performance optimizations enabled
- [ ] Documentation updated
- [ ] Team trained on new architecture

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Container Health**
   - HTTP bridge container status
   - Health check success rates
   - Response times

2. **API Performance**
   - Request latency (p50, p95, p99)
   - Throughput (requests per second)
   - Error rates

3. **Resource Usage**
   - CPU and memory consumption
   - Network I/O
   - Disk usage

4. **MCP Protocol Health**
   - JSON-RPC response times
   - Tool execution success rates
   - API key validation status

### Alerting Rules

```yaml
# Example Prometheus alerting rules
groups:
  - name: mcp-http-bridge
    rules:
      - alert: HTTPBridgeDown
        expr: up{job="mcp-http-bridge"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MCP HTTP Bridge is down"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on MCP HTTP Bridge"
          
      - alert: SlowResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response times on MCP HTTP Bridge"
```

## Security Considerations

1. **API Key Protection**
   - Never log API keys in plain text
   - Use secure environment variable handling
   - Implement API key rotation

2. **Network Security**
   - Container-to-container communication only
   - No external port exposure
   - Proper network isolation per starship

3. **Input Validation**
   - Strict JSON schema validation
   - Parameter sanitization
   - Rate limiting protection

4. **Error Handling**
   - Secure error messages (no sensitive data exposure)
   - Proper HTTP status code mapping
   - Request correlation IDs for debugging

## Next Steps

After successful migration:

1. **Enable Advanced Features**
   - Request caching for better performance
   - Circuit breaker for resilience
   - Advanced monitoring and alerting

2. **Expand Template Support**
   - Migrate GitHub connectors
   - Migrate PostgreSQL connectors
   - Add new HTTP bridge templates

3. **Performance Optimization**
   - Connection pooling tuning
   - Cache configuration optimization
   - Load testing with production traffic

4. **Documentation Updates**
   - Update API documentation
   - Create operational runbooks
   - Train development team

---

**Document Status**: Production Ready v1.0  
**Last Updated**: 2025-07-26  
**Next Review**: 2025-08-26