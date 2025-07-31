# MCP Service Discovery System

This directory contains the Docker networking and service discovery infrastructure for MCP servers in the Starships platform.

## Overview

The service discovery system provides:
- **Network Isolation**: Each starship gets its own Docker network
- **DNS Resolution**: Services can find each other by name
- **Health Monitoring**: Automatic health checking of services
- **Network Testing**: Comprehensive testing utilities

## Architecture

```
Starship Network (starship-{starshipId})
├── mcp-{starshipId}-github     (GitHub MCP Server)
├── mcp-{starshipId}-filesystem (Filesystem MCP Server)  
└── mcp-{starshipId}-notion     (Notion MCP Server)
```

## Components

### 🌐 NetworkManager
Manages Docker networks for starship isolation.

**Key Features**:
- Creates isolated networks per starship
- Generates unique subnets (172.20.x.0/24)
- Handles network cleanup on starship deletion
- Provides service discovery within networks

**Usage**:
```typescript
import { NetworkManager } from './NetworkManager';

const networkManager = new NetworkManager();

// Create network for starship
await networkManager.createStarshipNetwork({
  starshipId: 'starship-123',
  networkName: 'starship-starship-123',
  driver: 'bridge',
  attachable: true
});

// Get services in network
const services = await networkManager.getServiceDiscovery('starship-123');

// Test DNS resolution
const dnsWorking = await networkManager.testServiceDiscovery('starship-123');
```

### 🔍 ServiceDiscovery
High-level service discovery and communication utilities.

**Key Features**:
- Discovers all MCP services in a starship
- Provides service URLs for internal communication
- Health checking and status monitoring
- Service availability waiting

**Usage**:
```typescript
import { ServiceDiscovery } from './ServiceDiscovery';

const discovery = new ServiceDiscovery({
  starshipId: 'starship-123',
  enableHealthChecks: true,
  healthCheckInterval: 30000 // 30 seconds
});

// Discover all services
const services = await discovery.discoverServices();

// Get specific service
const githubService = await discovery.getService('github');

// Test connectivity
const isAvailable = await discovery.testServiceConnectivity('github');

// Get service URL for API calls
const apiUrl = discovery.getServiceUrl('github', '/api/repos');
// Result: http://mcp-starship-123-github:3000/api/repos

// Wait for service to be ready
await discovery.waitForService('github', 30000);

// Cleanup
discovery.cleanup();
```

### 🧪 NetworkTester
Comprehensive testing utilities for network infrastructure.

**Key Features**:
- Full network test suites
- DNS resolution testing
- Health endpoint validation
- Cross-service communication testing
- Test report generation

**Usage**:
```typescript
import { NetworkTester } from './NetworkTester';

const tester = new NetworkTester();

// Run full test suite
const results = await tester.runFullNetworkTest('starship-123');

// Test network creation
const networkTests = await tester.testNetworkCreation('starship-123');

// Generate report
const report = tester.generateTestReport(results);
console.log(report);
```

## Network Naming Conventions

### Networks
- **Pattern**: `starship-{starshipId}`
- **Example**: `starship-abc123`
- **Subnet**: `172.20.{hash}.0/24` (deterministic based on starshipId)
- **Gateway**: `172.20.{hash}.1`

### Services
- **Container Name**: `mcp-{starshipId}-{templateSlug}`
- **DNS Name**: Same as container name
- **Internal URL**: `http://mcp-{starshipId}-{templateSlug}:3000`

### Examples
```yaml
starship-abc123:
  containers:
    - mcp-abc123-github      # GitHub MCP Server
    - mcp-abc123-filesystem  # Filesystem MCP Server
    - mcp-abc123-notion      # Notion MCP Server
```

## Service Discovery Patterns

### 1. Automatic Discovery
Services are automatically discovered based on:
- Container labels
- Network membership
- Naming conventions

### 2. DNS Resolution
Services can reach each other using container names:
```bash
# From github service to filesystem service
curl http://mcp-abc123-filesystem:3000/health

# From any service to notion service
curl http://mcp-abc123-notion:3000/api/pages
```

### 3. Health Checking
All services expose standard health endpoints:
- `GET /health` - Full health status
- `GET /ready` - Readiness check

Health response format:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-25T10:30:00Z",
  "uptime": 3600,
  "memory": {...},
  "starship_id": "abc123",
  "template_slug": "github"
}
```

## Integration with Docker Compose

The service discovery system works seamlessly with Docker Compose:

```yaml
version: '3.8'

networks:
  starship-abc123:
    external: true  # Created by NetworkManager

services:
  mcp-abc123-github:
    image: starships/mcp-node:latest
    container_name: mcp-abc123-github
    networks:
      - starship-abc123
    environment:
      - STARSHIP_ID=abc123
      - TEMPLATE_SLUG=github
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Network Security

### Isolation
- Each starship network is completely isolated
- Services cannot reach other starship networks
- No external port exposure (internal communication only)

### DNS Security
- DNS resolution limited to network scope
- No DNS leakage between networks
- Service names are predictable but scoped

### Traffic Control
- All inter-service communication is HTTP
- No raw TCP/UDP between services
- Health checks use standard HTTP endpoints

## Monitoring and Debugging

### Network Inspection
```bash
# List all starship networks
docker network ls --filter label=starship.id

# Inspect specific network
docker network inspect starship-abc123

# See connected containers
docker network inspect starship-abc123 --format "{{.Containers}}"
```

### Service Debugging
```bash
# Check container status
docker ps --filter name=mcp-abc123

# View logs
docker logs mcp-abc123-github

# Test connectivity from within network
docker exec mcp-abc123-github ping mcp-abc123-filesystem
```

### Health Monitoring
```bash
# Check health of all services
for container in $(docker ps --filter name=mcp-abc123 --format "{{.Names}}"); do
  echo "=== $container ==="
  docker exec $container curl -s http://localhost:3000/health | jq .
done
```

## Error Handling

### Network Creation Failures
- Subnet conflicts: Automatic retry with different subnet
- Docker daemon issues: Graceful degradation
- Permission issues: Clear error messages

### Service Discovery Failures
- Missing services: Continue with available services
- DNS resolution failures: Retry with exponential backoff
- Health check failures: Mark service as unhealthy, continue monitoring

### Connectivity Issues
- Service timeouts: Circuit breaker pattern
- Network partitions: Automatic reconnection attempts
- Container crashes: Health monitoring detects and reports

## Performance Considerations

### Network Performance
- Bridge networks provide good performance for local communication
- DNS lookups are cached by Docker
- No external routing overhead

### Memory Usage
- Service cache kept in memory for fast lookups
- Health check results cached for configured interval
- Network information cached to reduce Docker API calls

### Scalability
- Networks support hundreds of containers
- Service discovery scales linearly with service count
- Health checking is async and non-blocking

## Future Enhancements

### Kubernetes Migration
- Network policies can be mapped directly
- Service names remain consistent
- Health checks compatible with K8s probes

### Service Mesh Integration
- Compatible with Istio/Linkerd
- Can add sidecar proxies
- Observability integration ready

### Advanced Networking
- Multi-region networks
- VPN integration
- Custom DNS providers