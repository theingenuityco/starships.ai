# @starships/core

HTTP bridge services and Docker orchestration for MCP (Model Context Protocol) integration in the Starships mission control platform. Enables seamless communication between the platform and containerized MCP tools with automated deployment and monitoring.

## 🚀 Features

- **MCP HTTP Bridge**: Protocol translation between HTTP REST and MCP's JSON-RPC protocol
- **Docker Orchestration**: Automated deployment and management of MCP connector containers
- **Service Discovery**: Dynamic discovery and registration of MCP tools and capabilities
- **Health Monitoring**: Real-time health checks and status monitoring for deployed connectors
- **Performance Optimization**: Connection pooling, request optimization, and resource management
- **Security Management**: Secure communication channels and access control for MCP tools
- **Kubernetes Integration**: Container orchestration and scaling in production environments

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Development mode
pnpm dev
```

## 🏗️ Architecture

### Service Structure

```
src/
├── index.ts                     # Main HTTP bridge server entry point
├── services/
│   ├── mcp/
│   │   ├── HttpBridge.ts              # Core HTTP-to-MCP protocol bridge
│   │   ├── MCPProtocolHandler.ts      # MCP JSON-RPC protocol implementation
│   │   ├── DockerComposeDeployer.ts   # Docker container deployment
│   │   ├── KubernetesDeployer.ts      # Kubernetes deployment orchestration
│   │   ├── ServiceRegistry.ts         # MCP service discovery and registration
│   │   ├── HealthMonitor.ts           # Health checking and monitoring
│   │   ├── PortAllocator.ts           # Dynamic port allocation
│   │   ├── NetworkManager.ts          # Container networking management
│   │   ├── SecurityManager.ts         # Access control and security
│   │   └── ResourceManager.ts         # Resource allocation and limits
│   ├── docker/
│   │   ├── ServiceDiscovery.ts        # Docker service discovery
│   │   └── NetworkManager.ts          # Docker network management
│   └── k8s/
│       ├── init.ts                    # Kubernetes initialization
│       └── utils/
│           └── cluster-setup.ts       # Cluster configuration utilities
└── docker/
    └── mcp-http-bridge/
        ├── Dockerfile                 # HTTP bridge container
        ├── server.js                  # Bridge server implementation
        └── package.json               # Bridge service dependencies
```

## 🔧 Usage

### HTTP Bridge Server

```typescript
import { HttpBridge, MCPProtocolHandler } from '@starships/core';

// Initialize HTTP bridge
const bridge = new HttpBridge({
  port: 3001,
  enableCors: true,
  corsOrigin: 'http://localhost:3000',
  enableLogging: true,
  maxConnections: 100
});

// Start bridge server
await bridge.start();

// Bridge automatically handles:
// - HTTP REST → MCP JSON-RPC protocol translation
// - Tool discovery and capability negotiation
// - Request/response marshaling
// - Error handling and recovery
```

### MCP Connector Deployment

```typescript
import { 
  DockerComposeDeployer, 
  KubernetesDeployer,
  ServiceRegistry 
} from '@starships/core';

// Docker deployment
const dockerDeployer = new DockerComposeDeployer({
  networkName: 'starships-mcp',
  enableHttpBridge: true,
  healthCheckInterval: 30000
});

// Deploy MCP connector
const deployment = await dockerDeployer.deploy({
  mcpServerId: 'github-connector',
  dockerImage: 'starships/mcp-github:latest',
  environmentVariables: {
    GITHUB_TOKEN: 'encrypted:token123',
    HTTP_BRIDGE_URL: 'http://bridge:3001'
  },
  ports: { 3002: 3002 },
  healthCheck: {
    endpoint: '/health',
    interval: '30s',
    timeout: '10s',
    retries: 3
  }
});

// Kubernetes deployment (production)
const k8sDeployer = new KubernetesDeployer({
  namespace: 'starships-mcp',
  enableAutoscaling: true,
  minReplicas: 1,
  maxReplicas: 5
});

await k8sDeployer.deploy({
  mcpServerId: 'github-connector',
  dockerImage: 'starships/mcp-github:latest',
  resources: {
    requests: { cpu: '100m', memory: '128Mi' },
    limits: { cpu: '500m', memory: '512Mi' }
  }
});
```

### Service Discovery and Health Monitoring

```typescript
import { ServiceRegistry, HealthMonitor } from '@starships/core';

// Service discovery
const registry = new ServiceRegistry({
  enableAutoDiscovery: true,
  discoveryInterval: 60000,
  enableCaching: true
});

// Discover available MCP tools
const mcpServices = await registry.discoverServices();
console.log('Available MCP tools:', mcpServices.map(s => s.tools).flat());

// Health monitoring
const monitor = new HealthMonitor({
  checkInterval: 30000,
  alertThreshold: 3,
  enableAutoRestart: true
});

// Monitor connector health
monitor.monitorConnector('github-connector', {
  endpoint: 'http://localhost:3002/health',
  expectedResponse: { status: 'healthy' },
  onFailure: async (connectorId, error) => {
    console.error(`Connector ${connectorId} health check failed:`, error);
    // Automatic restart logic
    await dockerDeployer.restart(connectorId);
  }
});
```

## 🌉 HTTP Bridge API

### Tool Discovery
```http
GET /mcp-tools
Authorization: Bearer <token>
```

**Response:**
```json
{
  "tools": [
    {
      "name": "list_repositories",
      "description": "List GitHub repositories for an organization",
      "connector": "github-connector",
      "inputSchema": {
        "type": "object",
        "properties": {
          "organization": { "type": "string" },
          "maxResults": { "type": "number", "default": 10 }
        }
      }
    }
  ]
}
```

### Tool Execution
```http
POST /mcp-tools/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "tool": "list_repositories",
  "connector": "github-connector",
  "parameters": {
    "organization": "starships-ai",
    "maxResults": 20
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "repositories": [
      {
        "name": "starships.ai",
        "description": "AI-powered starship mission control platform",
        "url": "https://github.com/starships-ai/starships.ai"
      }
    ]
  },
  "metadata": {
    "executionTime": 234,
    "connector": "github-connector",
    "toolVersion": "1.2.0"
  }
}
```

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "httpBridge": {
      "status": "healthy",
      "uptime": 3600,
      "requestCount": 1250
    },
    "connectors": {
      "github-connector": {
        "status": "healthy",
        "lastCheck": "2024-01-15T10:30:00Z",
        "responseTime": 45
      }
    }
  },
  "metrics": {
    "totalRequests": 1250,
    "activeConnections": 8,
    "averageResponseTime": 67
  }
}
```

## 🐳 Docker Integration

### MCP Connector Template

```dockerfile
# Example MCP connector Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install MCP protocol dependencies
COPY package*.json ./
RUN npm install

# Copy connector implementation
COPY src/ ./src/
COPY mcp-tools/ ./mcp-tools/

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Expose MCP and HTTP bridge ports
EXPOSE 3002 3003

# Start connector with HTTP bridge
CMD ["node", "src/index.js"]
```

### Docker Compose Deployment

```yaml
# Generated by DockerComposeDeployer
version: '3.8'

services:
  mcp-http-bridge:
    image: starships/mcp-http-bridge:latest
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - CORS_ORIGIN=http://localhost:3000
      - MAX_CONNECTIONS=100
    networks:
      - starships-mcp
    restart: unless-stopped

  github-connector:
    image: starships/mcp-github:latest
    ports:
      - "3002:3002"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - HTTP_BRIDGE_URL=http://mcp-http-bridge:3001
      - MCP_CONNECTOR_ID=github-connector
    depends_on:
      - mcp-http-bridge
    networks:
      - starships-mcp
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  starships-mcp:
    driver: bridge
```

## ☸️ Kubernetes Deployment

### MCP Connector Kubernetes Manifest

```yaml
# Generated by KubernetesDeployer
apiVersion: apps/v1
kind: Deployment
metadata:
  name: github-connector
  namespace: starships-mcp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: github-connector
  template:
    metadata:
      labels:
        app: github-connector
    spec:
      containers:
      - name: github-connector
        image: starships/mcp-github:latest
        ports:
        - containerPort: 3002
        env:
        - name: GITHUB_TOKEN
          valueFrom:
            secretKeyRef:
              name: github-secrets
              key: token
        - name: HTTP_BRIDGE_URL
          value: "http://mcp-http-bridge-service:3001"
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "512Mi"
        livenessProbe:
          httpGet:
            path: /health
            port: 3002
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /ready
            port: 3002
          initialDelaySeconds: 5
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: github-connector-service
  namespace: starships-mcp
spec:
  selector:
    app: github-connector
  ports:
  - port: 3002
    targetPort: 3002
  type: ClusterIP

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: github-connector-hpa
  namespace: starships-mcp
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: github-connector
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## 🔧 Configuration

### Environment Variables

```env
# HTTP Bridge Configuration
HTTP_BRIDGE_PORT=3001
HTTP_BRIDGE_CORS_ORIGIN=http://localhost:3000
HTTP_BRIDGE_MAX_CONNECTIONS=100
HTTP_BRIDGE_REQUEST_TIMEOUT=30000

# Docker Configuration
DOCKER_NETWORK=starships-mcp
DOCKER_REGISTRY=starships
DOCKER_COMPOSE_FILE_PATH=/tmp/starships-mcp

# Kubernetes Configuration
K8S_NAMESPACE=starships-mcp
K8S_ENABLE_AUTOSCALING=true
K8S_MIN_REPLICAS=1
K8S_MAX_REPLICAS=5

# Service Discovery
SERVICE_DISCOVERY_INTERVAL=60000
SERVICE_DISCOVERY_ENABLE_CACHE=true
SERVICE_DISCOVERY_CACHE_TTL=300000

# Health Monitoring
HEALTH_CHECK_INTERVAL=30000
HEALTH_CHECK_TIMEOUT=10000
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_ENABLE_AUTO_RESTART=true

# Security
MCP_BRIDGE_AUTH_TOKEN=your_bridge_auth_token
MCP_CONNECTOR_AUTH_REQUIRED=true
MCP_ENABLE_RATE_LIMITING=true
MCP_RATE_LIMIT_REQUESTS_PER_MINUTE=100

# Performance
MCP_CONNECTION_POOL_SIZE=50
MCP_REQUEST_QUEUE_SIZE=1000
MCP_ENABLE_REQUEST_COMPRESSION=true
```

### Bridge Configuration

```typescript
interface HttpBridgeConfig {
  port: number;
  host?: string;
  enableCors: boolean;
  corsOrigin: string | string[];
  maxConnections: number;
  requestTimeout: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enableMetrics: boolean;
  metricsPort?: number;
}

interface MCPConnectorConfig {
  id: string;
  dockerImage: string;
  environmentVariables: Record<string, string>;
  ports: Record<number, number>;
  healthCheck: {
    endpoint: string;
    interval: string;
    timeout: string;
    retries: number;
  };
  resources?: {
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  };
}
```

## 📊 Monitoring and Metrics

### Prometheus Metrics

```typescript
// Exposed metrics for monitoring
interface MCPBridgeMetrics {
  http_requests_total: Counter;
  http_request_duration_seconds: Histogram;
  mcp_tool_executions_total: Counter;
  mcp_tool_execution_duration_seconds: Histogram;
  mcp_connector_health_status: Gauge;
  mcp_active_connections: Gauge;
  mcp_bridge_uptime_seconds: Gauge;
}

// Metrics endpoint
// GET /metrics - Prometheus-formatted metrics
```

### Performance Benchmarks

- **HTTP Bridge Latency**: < 50ms for tool discovery
- **Tool Execution**: < 2s average for most MCP tools
- **Container Startup**: < 30s for new connector deployment
- **Health Check Response**: < 100ms for connector status
- **Service Discovery**: < 5s for full tool catalog refresh
- **Resource Usage**: < 100MB RAM per HTTP bridge instance
- **Concurrent Connections**: 100+ simultaneous tool executions

## 🧪 Testing

### Integration Tests

```bash
# Run all tests
pnpm test

# Run integration tests
pnpm test:integration

# Test Docker deployment
pnpm test:docker

# Test Kubernetes deployment
pnpm test:k8s

# Performance testing
pnpm test:performance
```

### Test Utilities

```typescript
import { 
  MockMCPConnector, 
  TestHttpBridge, 
  MockDockerDeployer 
} from '@starships/core/testing';

// Mock MCP connector for testing
const mockConnector = new MockMCPConnector({
  id: 'test-connector',
  tools: ['list_files', 'read_file', 'write_file'],
  responses: {
    list_files: { files: ['test.txt', 'example.md'] },
    read_file: { content: 'Test file content' }
  }
});

// Test HTTP bridge
const testBridge = new TestHttpBridge({
  port: 3001,
  mockConnectors: [mockConnector]
});

await testBridge.start();

// Test tool execution
const response = await fetch('http://localhost:3001/mcp-tools/execute', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tool: 'list_files',
    connector: 'test-connector',
    parameters: { path: '/test' }
  })
});

expect(response.status).toBe(200);
```

## 🔍 Troubleshooting

### Common Issues

1. **Bridge Connection Failures**
   ```bash
   # Check bridge service status
   curl http://localhost:3001/health
   
   # Check Docker network
   docker network ls | grep starships-mcp
   
   # Restart bridge service
   docker-compose restart mcp-http-bridge
   ```

2. **Connector Deployment Issues**
   ```bash
   # Check connector logs
   docker logs github-connector
   
   # Verify environment variables
   docker exec github-connector env | grep GITHUB
   
   # Test connector health
   curl http://localhost:3002/health
   ```

3. **Tool Execution Errors**
   ```bash
   # Check MCP protocol logs
   docker logs github-connector | grep MCP
   
   # Verify tool parameters
   curl -X POST http://localhost:3001/mcp-tools/execute \
     -H "Content-Type: application/json" \
     -d '{"tool": "list_repositories", "connector": "github-connector", "parameters": {}}'
   ```

## 📚 Dependencies

### Core Dependencies
- **express**: HTTP server framework for bridge service
- **ws**: WebSocket support for MCP protocol
- **dockerode**: Docker API client for container management
- **@kubernetes/client-node**: Kubernetes API client
- **pino**: High-performance JSON logging
- **prometheus-client**: Metrics collection and exposure

### Development Dependencies
- **jest**: Testing framework
- **supertest**: HTTP testing utilities
- **testcontainers**: Integration testing with real containers
- **@types/dockerode**: TypeScript definitions

## 📄 License

Private package - Part of the Starships AI platform.