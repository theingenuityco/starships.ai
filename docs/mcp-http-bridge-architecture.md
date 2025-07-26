# MCP HTTP Bridge Architecture Documentation

## Overview

The MCP HTTP Bridge transforms our stdio-based MCP Docker deployment into a robust HTTP-wrapped architecture. This eliminates stdio workarounds while maintaining full compatibility with existing systems and providing enhanced reliability, monitoring, and multi-client support.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Architecture](#component-architecture)
3. [HTTP Bridge Service](#http-bridge-service)
4. [Docker Integration](#docker-integration)
5. [Service Discovery](#service-discovery)
6. [Performance Optimizations](#performance-optimizations)
7. [Security Model](#security-model)
8. [Monitoring & Observability](#monitoring--observability)
9. [Deployment Patterns](#deployment-patterns)
10. [API Specifications](#api-specifications)

## Architecture Overview

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                     Starship Application                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   LangChain │  │   AgentOps  │  │  Custom API │              │
│  │   Agents    │  │   Service   │  │   Clients   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────┼───────────────────┼───────────────────────┘
                      │                   │
                      ▼                   ▼
              ┌─────────────────────────────────────┐
              │        Service Discovery API         │
              │   /api/starships/{id}/mcp-services  │
              └─────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Docker Network: starship-{id}                  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ MCP HTTP Bridge │  │ MCP HTTP Bridge │  │ MCP HTTP Bridge │  │
│  │   (Brave)       │  │   (GitHub)      │  │  (PostgreSQL)   │  │
│  │                 │  │                 │  │                 │  │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │
│  │ │ HTTP Server │ │  │ │ HTTP Server │ │  │ │ HTTP Server │ │  │
│  │ │   :8080     │ │  │ │   :8080     │ │  │ │   :8080     │ │  │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │  │
│  │        │        │  │        │        │  │        │        │  │
│  │        ▼        │  │        ▼        │  │        ▼        │  │
│  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │
│  │ │ MCP Server  │ │  │ │ MCP Server  │ │  │ │ MCP Server  │ │  │
│  │ │   Process   │ │  │ │   Process   │ │  │ │   Process   │ │  │
│  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

1. **Container Isolation**: Each MCP service runs in its own HTTP bridge container
2. **Network Isolation**: Docker networks prevent cross-starship communication
3. **Port Standardization**: All bridges use port 8080 internally (no conflicts due to isolation)
4. **Protocol Translation**: HTTP ↔ JSON-RPC translation with proper error mapping
5. **Service Discovery**: Centralized registry for container endpoint management

## Component Architecture

### 1. HTTP Bridge Service

The core component that translates HTTP requests to MCP JSON-RPC protocol.

```typescript
interface MCPHttpBridge {
  // Core functionality
  startMCPServer(env: Record<string, string>): Promise<void>
  stopMCPServer(): Promise<void>
  restartMCPServer(): Promise<void>
  
  // HTTP endpoint handlers
  listTools(req: Request, res: Response): Promise<void>
  callTool(req: Request, res: Response): Promise<void>
  listResources(req: Request, res: Response): Promise<void>
  getResource(req: Request, res: Response): Promise<void>
  healthCheck(req: Request, res: Response): Promise<void>
  
  // Protocol handling
  sendMCPRequest(method: string, params: any): Promise<any>
  handleMCPResponse(response: MCPResponse): void
  handleMCPError(error: MCPError): void
}
```

**Key Features:**
- Process lifecycle management with auto-restart
- Request queue for concurrency control
- HTTP error mapping from MCP error codes
- Health validation with functional testing
- Performance monitoring and metrics

### 2. Service Registry

Centralized registry for tracking and discovering MCP service endpoints.

```typescript
interface ServiceRegistry {
  // Service registration
  registerService(starshipId: string, endpoint: MCPServiceEndpoint): Promise<void>
  updateServiceHealth(connectorId: string, status: HealthStatus): Promise<void>
  
  // Service discovery
  getServices(starshipId: string): Promise<MCPServiceEndpoint[]>
  getService(starshipId: string, connectorId: string): Promise<MCPServiceEndpoint | null>
  
  // Health monitoring
  startHealthMonitoring(connectorId: string): Promise<void>
  stopHealthMonitoring(connectorId: string): void
}
```

### 3. Docker Template System

Dual template system supporting both legacy stdio and new HTTP bridge deployments.

```typescript
// HTTP Bridge Templates
const HTTP_BRIDGE_TEMPLATES = {
  'brave': {
    slug: 'brave',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    environment: {
      MCP_SERVER_CMD: 'npx -y @modelcontextprotocol/server-brave-search',
      MCP_SERVER_ARGS: '',
      HTTP_PORT: '8080',
      BRAVE_API_KEY: '${BRAVE_API_KEY}'
    },
    ports: ['8080'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3
    },
    bridgeConfig: {
      requiresFileAccess: false,
      apiKeyRequired: true,
      healthCheckMethod: 'tools_list'
    }
  }
};
```

### 4. Migration Service

Handles migration from stdio to HTTP bridge deployments.

```typescript
interface ConnectorMigrationService {
  // Migration operations
  migrateToHttpBridge(options: MigrationOptions): Promise<MigrationResult>
  migrateToStdio(options: MigrationOptions): Promise<MigrationResult>
  migrateAllConnectorsByTemplate(templateSlug: string): Promise<MigrationResult[]>
  
  // Status tracking
  getMigrationStatus(connectorId: string): MigrationStatus | null
  
  // Testing and validation
  testHttpBridgeContainer(starshipId: string, connectorId: string): Promise<TestResult>
}
```

## HTTP Bridge Service

### Request Processing Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HTTP Request  │───▶│  Rate Limiting  │───▶│  Input Validation│
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────▼─────────┐
│  Cache Response │◄───│  Circuit Breaker│◄───│  Cache Lookup     │
└─────────────────┘    └─────────────────┘    └───────────────────┘
          │                       │                       │
          │              ┌─────────▼─────────┐           │ (cache miss)
          │              │  MCP Server       │           │
          │              │  Process Manager  │           │
          │              └─────────┬─────────┘           │
          │                        │                     │
          ▼                        ▼                     ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  HTTP Response  │◄───│  JSON-RPC Call  │◄───│  Request Queue  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Process Lifecycle Management

```typescript
class MCPProcessManager {
  private mcpProcess: ChildProcess | null = null;
  private restartCount: number = 0;
  private maxRestarts: number = 5;
  private backoffMs: number = 1000;

  async startProcess(config: MCPServerConfig): Promise<void> {
    // Start MCP server process with proper stdio handling
    this.mcpProcess = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...config.environment }
    });

    // Handle process lifecycle events
    this.mcpProcess.on('exit', this.handleProcessExit.bind(this));
    this.mcpProcess.on('error', this.handleProcessError.bind(this));
  }

  private async handleProcessExit(code: number): Promise<void> {
    if (this.restartCount < this.maxRestarts) {
      await this.restartWithBackoff();
    } else {
      this.markAsUnhealthy("Max restart attempts exceeded");
    }
  }

  private async restartWithBackoff(): Promise<void> {
    const delay = this.backoffMs * Math.pow(2, this.restartCount);
    await new Promise(resolve => setTimeout(resolve, delay));
    this.restartCount++;
    await this.startProcess(this.config);
  }
}
```

### Error Handling and Status Mapping

```typescript
// MCP Error Code → HTTP Status Code mapping
const MCP_TO_HTTP_STATUS = {
  // JSON-RPC Standard Errors
  -32700: 400, // Parse error
  -32600: 400, // Invalid Request
  -32601: 404, // Method not found
  -32602: 422, // Invalid params
  -32603: 500, // Internal error
  
  // MCP Application Errors
  1001: 401,   // Unauthorized (invalid API key)
  1002: 403,   // Forbidden (rate limited)
  1003: 404,   // Resource not found
  1004: 429,   // Too many requests
  1005: 503,   // Service unavailable
  
  // Default fallback
  DEFAULT: 500
};

function mapMCPErrorToHTTP(mcpError: MCPError): HTTPError {
  const statusCode = MCP_TO_HTTP_STATUS[mcpError.code] || MCP_TO_HTTP_STATUS.DEFAULT;
  
  return {
    status: statusCode,
    error: {
      code: mcpError.code,
      message: mcpError.message,
      type: getErrorType(mcpError.code)
    },
    mcp_error: mcpError
  };
}
```

## Docker Integration

### Container Naming Convention

```
Pattern: mcp-{starshipId}-{templateSlug}-http

Examples:
- mcp-starship-123-brave-http
- mcp-starship-456-github-http
- mcp-starship-789-postgres-http
```

### Docker Compose Template

```yaml
version: '3.8'
services:
  mcp-brave-http:
    image: starships/mcp-http-bridge:latest
    container_name: mcp-${STARSHIP_ID}-brave-http
    environment:
      # Bridge Configuration
      MCP_SERVER_CMD: npx -y @modelcontextprotocol/server-brave-search
      MCP_SERVER_ARGS: ""
      HTTP_PORT: "8080"
      HEALTH_CHECK_TIMEOUT: "10000"
      LOG_LEVEL: info
      MAX_CONCURRENT_REQUESTS: "10"
      
      # Service-Specific Configuration
      BRAVE_API_KEY: ${BRAVE_API_KEY}
      
    networks:
      - starship-${STARSHIP_ID}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    labels:
      starship.id: ${STARSHIP_ID}
      connector.id: ${CONNECTOR_ID}
      template.slug: brave
      managed-by: starships
      service.type: mcp-http-bridge

networks:
  starship-${STARSHIP_ID}:
    external: true
    name: starship-${STARSHIP_ID}
```

### Multi-Runtime Docker Image

```dockerfile
FROM node:18-alpine

# Install runtime dependencies for both Node.js and Python MCP servers
RUN apk add --no-cache curl python3 py3-pip

# Install package managers
RUN npm install -g npm@latest
RUN pip3 install uv

# Copy HTTP bridge application
COPY mcp-http-bridge/ /app
WORKDIR /app
RUN npm install --production

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "server.js"]
```

## Service Discovery

### API Endpoints

```typescript
// Service Discovery APIs
GET /api/starships/{starshipId}/mcp-services
GET /api/starships/{starshipId}/mcp-services/{slug}/health
POST /api/starships/{starshipId}/connectors/{connectorId}/test
GET /api/starships/{starshipId}/connectors/{connectorId}/status
GET /api/starships/{starshipId}/connectors/{connectorId}/tools
POST /api/starships/{starshipId}/connectors/{connectorId}/tools/{toolName}
```

### Service Registry Data Model

```typescript
interface MCPServiceEndpoint {
  connectorId: string;
  starshipId: string;
  containerName: string;
  internalUrl: string;
  templateSlug: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  lastHealthCheck: string;
  availableTools: string[];
  availableResources: string[];
  metadata: {
    bridgeVersion: string;
    mcpServerType: string;
    apiKeyRequired: boolean;
    requiresFileAccess: boolean;
  };
}
```

### Database Schema

```sql
-- HTTP Bridge Support Fields
ALTER TABLE MCPServerConnector ADD COLUMN httpBridgeEnabled BOOLEAN DEFAULT false;
ALTER TABLE MCPServerConnector ADD COLUMN internalUrl VARCHAR(255);
ALTER TABLE MCPServerConnector ADD COLUMN bridgeVersion VARCHAR(50);
ALTER TABLE MCPServerConnector ADD COLUMN lastToolsSync TIMESTAMP;
ALTER TABLE MCPServerConnector ADD COLUMN availableTools JSON;
ALTER TABLE MCPServerConnector ADD COLUMN availableResources JSON;

-- Service Registry Table
CREATE TABLE MCPServiceRegistry (
  id VARCHAR(36) PRIMARY KEY,
  starshipId VARCHAR(36) NOT NULL,
  connectorId VARCHAR(36) NOT NULL,
  containerName VARCHAR(255) NOT NULL,
  internalUrl VARCHAR(255) NOT NULL,
  templateSlug VARCHAR(100) NOT NULL,
  status ENUM('healthy', 'unhealthy', 'starting', 'stopping') DEFAULT 'starting',
  lastHealthCheck TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (starshipId) REFERENCES Starship(id) ON DELETE CASCADE,
  FOREIGN KEY (connectorId) REFERENCES MCPServerConnector(id) ON DELETE CASCADE,
  UNIQUE KEY unique_connector (connectorId),
  INDEX idx_starship_status (starshipId, status)
);
```

## Performance Optimizations

### Request Caching

```typescript
class HTTPBridgeCache {
  private cache: SimpleLRUCache<string, CacheEntry>;
  
  // Cache frequently accessed endpoints
  private cacheableEndpoints = [
    'tools/list',
    'resources/list', 
    'capabilities/get'
  ];

  get(method: string, params: any): any | null {
    if (!this.isCacheable(method)) return null;
    
    const key = this.generateCacheKey(method, params);
    const entry = this.cache.get(key);
    
    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry.response;
    }
    
    return null;
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private threshold = 5;
  private timeout = 60000; // 1 minute

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

### Rate Limiting

```typescript
class RateLimiter {
  private requests = new Map<string, number[]>();
  
  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const clientRequests = this.requests.get(clientId) || [];
    
    // Remove old requests outside the window
    const validRequests = clientRequests.filter(
      timestamp => now - timestamp < this.windowSize
    );

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(clientId, validRequests);
    return true;
  }
}
```

### Connection Pooling

```typescript
class MCPConnectionPool {
  private activeConnections = new Map<string, MCPConnection>();
  private maxConnections = 10;

  async getConnection(serverId: string): Promise<MCPConnection> {
    if (this.activeConnections.has(serverId)) {
      return this.activeConnections.get(serverId);
    }

    if (this.activeConnections.size >= this.maxConnections) {
      // Remove oldest connection
      const oldestKey = this.activeConnections.keys().next().value;
      this.releaseConnection(oldestKey);
    }

    const connection = await this.createConnection(serverId);
    this.activeConnections.set(serverId, connection);
    return connection;
  }
}
```

## Security Model

### Network Security

1. **Container Isolation**: Each MCP service runs in isolated containers
2. **Network Segmentation**: Docker networks prevent cross-starship communication
3. **No External Exposure**: HTTP bridges only accessible within starship networks
4. **Internal-only Communication**: Port 8080 never exposed to host network

### API Key Security

```typescript
class APIKeyManager {
  // Never log API keys
  private sanitizeForLogging(data: any): any {
    const sanitized = { ...data };
    for (const key in sanitized) {
      if (key.toLowerCase().includes('api_key') || 
          key.toLowerCase().includes('token') ||
          key.toLowerCase().includes('secret')) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  // Validate API keys without exposing them
  async validateKey(keyName: string, keyValue: string): Promise<boolean> {
    try {
      const testResult = await this.performTestCall(keyName, keyValue);
      return testResult.success;
    } catch (error) {
      console.error(`API key validation failed for ${keyName}:`, 
                   this.sanitizeForLogging(error));
      return false;
    }
  }
}
```

### Input Validation

```typescript
// Strict JSON schema validation
const TOOL_EXECUTION_SCHEMA = {
  type: 'object',
  required: ['arguments'],
  properties: {
    arguments: {
      type: 'object',
      additionalProperties: true
    }
  },
  additionalProperties: false
};

function validateToolRequest(req: Request): ValidationResult {
  const validation = ajv.validate(TOOL_EXECUTION_SCHEMA, req.body);
  if (!validation) {
    return {
      valid: false,
      errors: ajv.errors?.map(err => ({
        field: err.instancePath,
        message: err.message
      })) || []
    };
  }
  return { valid: true };
}
```

## Monitoring & Observability

### Metrics Collection

```typescript
interface BridgeMetrics {
  // Request metrics
  http_requests_total: Counter;
  http_request_duration_seconds: Histogram;
  http_request_size_bytes: Histogram;
  http_response_size_bytes: Histogram;
  
  // MCP protocol metrics
  mcp_requests_total: Counter;
  mcp_request_duration_seconds: Histogram;
  mcp_errors_total: Counter;
  
  // Resource metrics
  bridge_memory_usage_bytes: Gauge;
  bridge_cpu_usage_percent: Gauge;
  active_connections: Gauge;
  
  // Health metrics
  health_check_success_rate: Gauge;
  api_key_validation_success_rate: Gauge;
}
```

### Health Check Implementation

```typescript
async function performHealthCheck(): Promise<HealthCheckResult> {
  const checks: HealthCheck[] = [];
  
  // 1. MCP Process Check
  checks.push({
    name: 'mcp_process',
    status: this.mcpProcess?.pid ? 'running' : 'stopped'
  });
  
  // 2. MCP Protocol Check
  try {
    const start = performance.now();
    await this.sendMCPRequest('tools/list', {});
    const responseTime = performance.now() - start;
    
    checks.push({
      name: 'mcp_protocol',
      status: 'responsive',
      responseTime
    });
  } catch (error) {
    checks.push({
      name: 'mcp_protocol',
      status: 'unresponsive',
      error: error.message
    });
  }
  
  // 3. API Key Validation (if required)
  if (this.config.apiKeyRequired) {
    try {
      const isValid = await this.validateAPIKey();
      checks.push({
        name: 'api_validation',
        status: isValid ? 'valid' : 'invalid'
      });
    } catch (error) {
      checks.push({
        name: 'api_validation',
        status: 'error',
        error: error.message
      });
    }
  }
  
  const overallStatus = checks.every(c => 
    ['running', 'responsive', 'valid'].includes(c.status)
  ) ? 'healthy' : 'unhealthy';
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks: checks.reduce((acc, check) => {
      acc[check.name] = check.status;
      return acc;
    }, {}),
    responseTime: checks.find(c => c.responseTime)?.responseTime
  };
}
```

### Alerting Rules

```yaml
# Prometheus alerting rules
groups:
  - name: mcp-http-bridge
    rules:
      - alert: MCPBridgeDown
        expr: up{job="mcp-http-bridge"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MCP HTTP Bridge {{ $labels.instance }} is down"
          
      - alert: MCPBridgeHighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on MCP HTTP Bridge {{ $labels.instance }}"
          
      - alert: MCPBridgeSlowResponse
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow response times on MCP HTTP Bridge {{ $labels.instance }}"
          
      - alert: MCPServerUnresponsive
        expr: mcp_protocol_health{status="unresponsive"} == 1
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "MCP server unresponsive on bridge {{ $labels.instance }}"
```

## Deployment Patterns

### Blue-Green Deployment

```typescript
// Blue-Green deployment for HTTP bridge updates
class BlueGreenDeployment {
  async deployNewVersion(connectorId: string, newVersion: string): Promise<void> {
    // 1. Deploy green version alongside blue
    const greenContainerName = `${containerName}-green`;
    await this.deployContainer(greenContainerName, newVersion);
    
    // 2. Wait for green to become healthy
    await this.waitForHealthy(greenContainerName);
    
    // 3. Update service registry to point to green
    await this.updateServiceRegistry(connectorId, greenContainerName);
    
    // 4. Remove blue version
    await this.removeContainer(containerName);
    
    // 5. Rename green to blue
    await this.renameContainer(greenContainerName, containerName);
  }
}
```

### Rolling Updates

```typescript
// Rolling updates for multiple connectors
class RollingUpdate {
  async updateAllConnectors(templateSlug: string, newVersion: string): Promise<void> {
    const connectors = await this.getConnectorsByTemplate(templateSlug);
    const batchSize = 3; // Update 3 at a time
    
    for (let i = 0; i < connectors.length; i += batchSize) {
      const batch = connectors.slice(i, i + batchSize);
      
      // Update batch in parallel
      await Promise.all(batch.map(connector => 
        this.updateConnector(connector.id, newVersion)
      ));
      
      // Wait between batches
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }
}
```

### Canary Deployment

```typescript
// Canary deployment for testing new features
class CanaryDeployment {
  async deployCanary(templateSlug: string, percentage: number): Promise<void> {
    const connectors = await this.getConnectorsByTemplate(templateSlug);
    const canaryCount = Math.ceil(connectors.length * (percentage / 100));
    const canaryConnectors = connectors.slice(0, canaryCount);
    
    // Deploy canary version to subset
    for (const connector of canaryConnectors) {
      await this.deployCanaryVersion(connector.id);
    }
    
    // Monitor metrics
    await this.monitorCanaryMetrics(canaryConnectors);
  }
}
```

## API Specifications

### HTTP Bridge API

#### OpenAPI Specification

```yaml
openapi: 3.0.0
info:
  title: MCP HTTP Bridge API
  version: 1.0.0
  description: HTTP wrapper for Model Context Protocol (MCP) servers

paths:
  /health:
    get:
      summary: Health check with functional validation
      responses:
        '200':
          description: Service is healthy
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/HealthResponse'
                
  /tools:
    get:
      summary: List available MCP tools
      responses:
        '200':
          description: List of available tools
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ToolsResponse'
                
  /tools/{toolName}:
    post:
      summary: Execute specific tool
      parameters:
        - name: toolName
          in: path
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ToolExecutionRequest'
      responses:
        '200':
          description: Tool execution result
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ToolExecutionResponse'

components:
  schemas:
    HealthResponse:
      type: object
      properties:
        status:
          type: string
          enum: [healthy, unhealthy]
        timestamp:
          type: string
          format: date-time
        checks:
          type: object
          properties:
            mcp_process:
              type: string
              enum: [running, stopped]
            mcp_protocol:
              type: string  
              enum: [responsive, unresponsive]
            api_validation:
              type: string
              enum: [valid, invalid, skipped]
            response_time_ms:
              type: number
        tools:
          type: array
          items:
            type: string
        last_error:
          type: string
          nullable: true
          
    ToolsResponse:
      type: object
      properties:
        tools:
          type: array
          items:
            $ref: '#/components/schemas/Tool'
            
    Tool:
      type: object
      properties:
        name:
          type: string
        description:
          type: string
        inputSchema:
          type: object
          
    ToolExecutionRequest:
      type: object
      required:
        - arguments
      properties:
        arguments:
          type: object
          
    ToolExecutionResponse:
      type: object
      properties:
        result:
          type: object
        execution_time_ms:
          type: number
```

### Service Discovery API

```typescript
// Service Discovery API Types
interface MCPServicesResponse {
  services: MCPServiceEndpoint[];
  metadata: {
    starshipId: string;
    totalServices: number;
    healthyServices: number;
    lastUpdated: string;
  };
}

interface ConnectorStatusResponse {
  connectorId: string;
  status: 'healthy' | 'unhealthy' | 'starting' | 'stopping';
  httpBridge: {
    enabled: boolean;
    version: string;
    internalUrl: string;
    lastHealthCheck: string;
  };
  capabilities: {
    tools: string[];
    resources: string[];
    lastSync: string;
  };
  performance: {
    averageResponseTime: number;
    successRate: number;
    requestsPerMinute: number;
  };
}
```

## Scalability Considerations

### Container Limits

- **Per Starship**: Unlimited MCP containers (network isolation prevents conflicts)
- **Per Container**: 100+ concurrent requests with optimization
- **Platform-wide**: 10,000+ containers across all starships
- **Resource Limits**: 0.1 CPU cores + 128MB RAM per bridge

### Performance Targets

- **Container Startup**: < 10 seconds
- **HTTP Response Time**: < 200ms overhead
- **Tool Execution**: < 500ms (excluding external API time)
- **Health Check**: < 50ms
- **Concurrent Requests**: 100+ per container

### Horizontal Scaling

```typescript
// Auto-scaling based on load
class AutoScaler {
  async scaleBasedOnLoad(connectorId: string): Promise<void> {
    const metrics = await this.getConnectorMetrics(connectorId);
    
    if (metrics.averageResponseTime > 500 || metrics.cpuUsage > 80) {
      // Scale up: Add additional bridge instance
      await this.addBridgeInstance(connectorId);
    } else if (metrics.averageResponseTime < 100 && metrics.cpuUsage < 20) {
      // Scale down: Remove excess instances
      await this.removeBridgeInstance(connectorId);
    }
  }
}
```

---

**Document Status**: Production Ready v1.0  
**Author**: Claude Code Assistant  
**Last Updated**: 2025-07-26  
**Next Review**: 2025-08-26