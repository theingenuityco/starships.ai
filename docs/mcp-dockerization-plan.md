# MCP Server Dockerization Plan

## Overview

This plan outlines the implementation of a Docker Compose-based system for containerizing MCP servers selected by users. The system provides real-time deployment of MCP servers as Docker containers with proper isolation, networking, and monitoring.

## Key Features

- **Real-time Deployment**: Containers deploy immediately when users select MCP servers
- **Internal Networking**: No external ports needed - containers communicate via Docker DNS
- **Kubernetes-Ready**: Architecture designed for easy migration to K8s
- **Scoped File Access**: Starship-isolated volume mounts for secure file system access
- **Simplified Naming**: Clean container names using `mcp-{starshipId}-{templateSlug}`
- **Scalable Design**: No port limitations - supports unlimited containers

## Current System Analysis

### Existing Architecture
- **MCPServerOption**: Template definitions with commands, arguments, and environment variable patterns
- **MCPServerConnector**: Instance configurations referencing templates with actual environment values
- **ConnectorApiKeyManager**: Handles API key detection, validation, and environment variable substitution
- **Environment Management**: JSON-based storage with placeholder substitution (`${VARIABLE_NAME}`)

### Current MCP Server Templates
1. **GitHub** (Docker-based): `ghcr.io/github/github-mcp-server`
2. **Puppeteer** (NPX): `@modelcontextprotocol/server-puppeteer`
3. **Filesystem** (NPX): `@modelcontextprotocol/server-filesystem`
4. **Notion** (NPX): `@notionhq/notion-mcp-server`
5. **PostgreSQL** (NPX): `@modelcontextprotocol/server-postgres`
6. **Brave Search** (NPX): `@modelcontextprotocol/server-brave-search`
7. **Google Drive** (NPX): `@modelcontextprotocol/server-gdrive`
8. **Slack** (NPX): `@modelcontextprotocol/server-slack`
9. **Memory** (NPX): `@modelcontextprotocol/server-memory`
10. **Time** (UVX): `mcp-server-time`
11. **Stripe** (NPX): `@stripe/mcp`

## Proposed Docker Compose Architecture

### 1. Service Structure

Each active MCP server will be deployed as a separate Docker Compose service:

```yaml
version: '3.8'

services:
  mcp-ship456-github:
    image: ghcr.io/github/github-mcp-server
    container_name: mcp-ship456-github
    environment:
      - GITHUB_PERSONAL_ACCESS_TOKEN=ghp_actual_token
      - GITHUB_TOOLSETS=issues,pulls
      - GITHUB_READ_ONLY=false
    networks:
      - starship-ship456
    labels:
      - "starship.id=ship456"
      - "connector.id=conn789"
      - "template.slug=github"
    restart: unless-stopped

  mcp-ship456-filesystem:
    image: starships/mcp-node:latest
    container_name: mcp-ship456-filesystem
    command: npx -y @modelcontextprotocol/server-filesystem /workspace
    volumes:
      - /data/starships/ship456/filesystem:/workspace:rw
    networks:
      - starship-ship456
    labels:
      - "starship.id=ship456"
      - "connector.id=conn790"
      - "template.slug=filesystem"
    restart: unless-stopped

networks:
  starship-ship456:
    driver: bridge
    name: starship-ship456
```

### 2. Container Naming Convention

- **Pattern**: `mcp-{starshipId}-{templateSlug}`
- **Examples**: 
  - `mcp-ship456-github`
  - `mcp-ship456-puppeteer`
  - `mcp-ship012-postgresql`
- **Benefits**: Cleaner names, easier management, starship-scoped isolation

### 3. Environment Variable Injection

Environment variables will be injected based on the MCPServerConnector's `env` field:

```typescript
// Example environment resolution
const connector: MCPServerConnector = {
  env: JSON.stringify({
    "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_actual_token",
    "GITHUB_TOOLSETS": "issues,pulls",
    "GITHUB_READ_ONLY": "false"
  })
}

// Resolves to Docker Compose environment section:
environment:
  - GITHUB_PERSONAL_ACCESS_TOKEN=ghp_actual_token
  - GITHUB_TOOLSETS=issues,pulls
  - GITHUB_READ_ONLY=false
```

## Implementation Progress Tracker

### Overall Progress: 0% Complete
**Status**: In Progress  
**Start Date**: 2025-01-25  
**Target Completion**: 4 weeks  
**Current Phase**: Phase 1 - Foundation Setup  

---

## Implementation Phases

### Phase 1: Foundation Setup (Week 1) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 5 days  
**Dependencies**: None  
**Assignee**: TBD  
**Progress**: 0/3 tasks completed  

#### Task 1.1: Template Slug System - 🟡 In Progress
**Status**: In Progress  
**Estimated Time**: 1 day  
**Assignee**: Claude (Backend Developer)  
**Due Date**: 2025-01-25  
**Progress**: 
- [ ] Update MCPServerOption schema with slug field
- [ ] Update seed data with slug values
- [ ] Create migration script for existing data
- [ ] Add validation for slug uniqueness
- [ ] Write unit tests for slug system

**Completion Criteria**:
- MCPServerOption has slug field
- All templates have valid slugs
- Database migration completed
Add slug field to MCPServerOption model:
```typescript
// Update MCPServerOption schema
interface MCPServerOption {
  id: string
  name: string        // "GitHub"
  slug: string        // "github" - Docker-compatible identifier  
  command: string
  args: string[]
  env?: string
}

// Update seed data
const mcpServerTemplates = [
  {
    name: 'GitHub',
    slug: 'github',
    command: 'docker',
    // ...
  },
  {
    name: 'Puppeteer', 
    slug: 'puppeteer',
    command: 'npx',
    // ...
  }
]
```

#### Task 1.2: Docker Base Images - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: DevOps Engineer  
**Due Date**: TBD  
**Dependencies**: None  
**Progress**: 
- [ ] Create Node.js base image Dockerfile
- [ ] Create Python base image Dockerfile
- [ ] Add MCP protocol handlers
- [ ] Build and test images locally
- [ ] Push to Docker registry
- [ ] Document image usage

**Completion Criteria**:
- Base images available in registry
- Images tested with sample MCP servers
- Documentation updated

**Docker Images to Create**:
**Node.js Base Image** (`starships/mcp-node:latest`):
```dockerfile
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache python3 make g++ chromium

# Set working directory
WORKDIR /app

# Install global packages
RUN npm install -g npx npm@latest

# Add MCP protocol handler
COPY mcp-handler.js /usr/local/bin/

# Default command will be overridden by compose
CMD ["npx", "--help"]
```

**Python Base Image** (`starships/mcp-python:latest`):
```dockerfile
FROM python:3.11-alpine

# Install uv and dependencies
RUN pip install uv

# Set working directory
WORKDIR /app

# Add MCP protocol handler
COPY mcp-handler.py /usr/local/bin/

# Default command will be overridden by compose
CMD ["uvx", "--help"]
```

#### Task 1.3: Service Discovery Setup - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 1.1  
**Progress**: 
- [ ] Design network naming strategy
- [ ] Implement network creation logic
- [ ] Create DNS resolution testing
- [ ] Document service discovery patterns
- [ ] Test cross-container communication

**Completion Criteria**:
- Network creation automated
- DNS resolution working
- Service discovery documented

**Technical Requirements**:
- Container DNS naming strategy
- Network isolation per starship
- Internal communication only (no external ports)

### Phase 2: Core Services Implementation (Week 1-2) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 7 days  
**Dependencies**: Phase 1 completion  
**Assignee**: Backend Team  
**Progress**: 0/3 tasks completed  

#### Task 2.1: Enhanced MCPServerConnector Model - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 1 day  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 1.1  
**Progress**: 
- [ ] Add Docker-specific fields to MCPServerConnector
- [ ] Update database schema
- [ ] Create migration scripts
- [ ] Update repository methods
- [ ] Add validation rules
- [ ] Write unit tests

**Completion Criteria**:
- Model updated with Docker fields
- Database migration successful
- All tests passing
```typescript
// Enhanced MCPServerOption with slug field
interface MCPServerOption {
  id: string
  name: string        // "GitHub"
  slug: string        // "github" - Docker-compatible identifier
  command: string
  args: string[]
  env?: string
  // ... existing fields
}

interface MCPServerConnector {
  // ... existing fields
  dockerServiceName?: string      // mcp-ship456-github
  dockerStatus?: 'pending' | 'building' | 'running' | 'stopped' | 'error'
  dockerContainerId?: string      // Container ID from Docker
  dockerHealthStatus?: 'healthy' | 'unhealthy' | 'starting'
  dockerLastHealthCheck?: string  // ISO timestamp
  dockerNetworkName?: string      // starship-ship456
}
```

#### Task 2.2: Docker Compose Generator Service - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 2.1  
**Progress**: 
- [ ] Implement MCPDeployer interface
- [ ] Create DockerComposeDeployer class
- [ ] Add network management logic
- [ ] Implement service generation
- [ ] Add error handling
- [ ] Create integration tests
- [ ] Add logging and monitoring

**Completion Criteria**:
- MCPDeployer interface fully implemented
- Container deployment working
- Network creation automated
- Error handling robust
```typescript
interface MCPDeployer {
  deploy(starshipId: string, connector: MCPServerConnector): Promise<string>
  remove(starshipId: string, connectorId: string): Promise<void>
  removeAll(starshipId: string): Promise<void>  // Cleanup entire starship
  getStatus(connectorId: string): Promise<DeploymentStatus>
}

class DockerComposeDeployer implements MCPDeployer {
  async deploy(starshipId: string, connector: MCPServerConnector): Promise<string> {
    // Get template info
    const template = await this.getTemplate(connector.templateId)
    const dockerTemplate = dockerTemplates[template.slug]
    
    if (!dockerTemplate) {
      throw new Error(`No Docker template found for ${template.slug}`)
    }
    
    const serviceName = `mcp-${starshipId}-${template.slug}`
    const networkName = `starship-${starshipId}`
    
    // Ensure network exists
    await this.ensureNetwork(networkName, starshipId)
    
    // Build service configuration
    const service = {
      image: dockerTemplate.image,
      container_name: serviceName,
      command: dockerTemplate.command,
      environment: JSON.parse(connector.env || '{}'),
      networks: [networkName],
      volumes: this.buildVolumes(dockerTemplate, starshipId),
      restart: 'unless-stopped',
      labels: {
        'starship.id': starshipId,
        'connector.id': connector.id,
        'template.slug': template.slug,
        'managed-by': 'starships'
      }
    }
    
    // Update compose file and deploy
    await this.updateComposeFile(starshipId, serviceName, service)
    await exec(`docker-compose -f /data/docker/compose-files/starship-${starshipId}.yml up -d --no-recreate ${serviceName}`)
    
    return serviceName  // This is the DNS endpoint
  }
  
  private async ensureNetwork(networkName: string, starshipId: string): Promise<void> {
    try {
      await docker.createNetwork({
        Name: networkName,
        Driver: 'bridge',
        Labels: {
          'starship.id': starshipId,
          'managed-by': 'starships'
        }
      })
    } catch (err) {
      if (!err.message.includes('already exists')) throw err
    }
  }
}
```

#### Task 2.3: Template-to-Docker Mapping - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 1.2  
**Progress**: 
- [ ] Define DockerServiceTemplate interface
- [ ] Create template mappings for all MCP servers
- [ ] Implement health check configurations
- [ ] Add volume mapping logic
- [ ] Create template validation
- [ ] Write comprehensive tests
- [ ] Document template system

**Completion Criteria**:
- All MCP templates have Docker configs
- Volume mappings working
- Health checks functional
- Documentation complete
```typescript
interface DockerServiceTemplate {
  slug: string
  image: string
  command?: string[]
  volumes?: VolumeMapping[]
  ports?: string[]
  envPrefix?: string              // Environment variable prefix
  requiresFileAccess?: boolean    // Needs volume mounts
  healthcheck?: HealthCheck
}

const dockerTemplates: Record<string, DockerServiceTemplate> = {
  'github': {
    slug: 'github',
    image: 'ghcr.io/github/github-mcp-server',
    envPrefix: 'GITHUB_',
    healthcheck: {
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3000/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '40s'
    }
  },
  'filesystem': {
    slug: 'filesystem',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-filesystem'],
    requiresFileAccess: true,
    volumes: [
      { source: '/data/starships/{starshipId}/filesystem', target: '/workspace', mode: 'rw' }
    ]
  },
  'puppeteer': {
    slug: 'puppeteer',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-puppeteer'],
    // Puppeteer needs special Chrome settings
    environment: {
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium'
    }
  },
  'postgresql': {
    slug: 'postgresql',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-postgres'],
    envPrefix: 'POSTGRES_'
  },
  'gdrive': {
    slug: 'gdrive',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-gdrive'],
    requiresFileAccess: true,
    volumes: [
      { source: '/data/starships/{starshipId}/credentials', target: '/credentials', mode: 'ro' }
    ]
  }
  // ... more templates
}
```

### Phase 3: Real-time Deployment System (Week 2) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 5 days  
**Dependencies**: Phase 2 completion  
**Assignee**: Full-stack Team  
**Progress**: 0/2 tasks completed  

#### Task 3.1: Deployment Workflow - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 2.2  
**Progress**: 
- [ ] Implement handleMCPServerSelection function
- [ ] Add real-time deployment trigger
- [ ] Create deployment status tracking
- [ ] Add health monitoring integration
- [ ] Implement rollback mechanisms
- [ ] Add deployment notifications
- [ ] Create deployment logs

**Completion Criteria**:
- Real-time deployment working
- Status tracking accurate
- Health monitoring active
- Rollback procedures tested
```typescript
// When user selects MCP server in UI
async function handleMCPServerSelection(starshipId: string, templateId: string, apiKeys: Record<string, string>) {
  // 1. Create connector instance
  const connector = await createMCPServerConnector({
    starshipId,
    templateId,
    env: JSON.stringify(apiKeys),
    dockerStatus: 'pending'
  })
  
  // 2. Get template and generate service names
  const template = await getTemplate(templateId)
  const serviceName = `mcp-${starshipId}-${template.slug}`
  const networkName = `starship-${starshipId}`
  
  // 3. Update connector with Docker info
  await updateConnector(connector.id, {
    dockerServiceName: serviceName,
    dockerNetworkName: networkName,
    dockerStatus: 'building'
  })
  
  // 4. Deploy immediately using MCPDeployer
  const deployer = new DockerComposeDeployer()
  await deployer.deploy(starshipId, connector)
  
  // 5. Start health monitoring
  await healthMonitor.startMonitoring(connector.id)
}
```

#### Task 3.2: API Endpoints - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 3.1  
**Progress**: 
- [ ] Create connector creation endpoint
- [ ] Add Docker status endpoints
- [ ] Implement restart functionality
- [ ] Add deletion with cleanup
- [ ] Create log streaming endpoints
- [ ] Add health check endpoints
- [ ] Write API documentation
- [ ] Create integration tests

**Completion Criteria**:
- All API endpoints functional
- Documentation complete
- Integration tests passing
- Error handling robust
```typescript
// Connector creation triggers deployment automatically
POST   /api/starships/{starshipId}/connectors
       → Creates connector AND deploys container

// Docker-specific management
GET    /api/starships/{starshipId}/mcp/docker/status
       → Returns all container statuses with health info

POST   /api/starships/{starshipId}/mcp/docker/{connectorId}/restart
       → Restart specific MCP server

DELETE /api/starships/{starshipId}/connectors/{connectorId}
       → Removes connector AND stops container

DELETE /api/starships/{starshipId}
       → Removes starship AND cleans up all containers/networks

// Health and logs
GET    /api/starships/{starshipId}/mcp/docker/{connectorId}/logs
       → Stream container logs

GET    /api/starships/{starshipId}/mcp/docker/{connectorId}/health
       → Detailed health check results
```

### Phase 4: Volume Management & Security (Week 2-3) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 6 days  
**Dependencies**: Phase 3 completion  
**Assignee**: DevOps + Backend Team  
**Progress**: 0/2 tasks completed  

#### Task 4.1: Volume Structure - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: DevOps Engineer  
**Due Date**: TBD  
**Dependencies**: None  
**Progress**: 
- [ ] Create volume directory structure
- [ ] Set up proper permissions
- [ ] Implement volume mounting logic
- [ ] Add volume validation
- [ ] Create backup procedures
- [ ] Test volume isolation
- [ ] Document volume management

**Completion Criteria**:
- Volume structure implemented
- Permissions configured correctly
- Isolation tested and verified
- Backup system operational
```
/data/
├── starships/
│   ├── {starshipId}/
│   │   ├── filesystem/        # For filesystem MCP server
│   │   ├── credentials/       # For credential files (read-only)
│   │   ├── workspace/         # General workspace
│   │   └── logs/              # Container logs
│   └── ...
└── docker/
    ├── compose-files/
    │   ├── starship-{id}.yml  # Generated compose files
    │   └── ...
    └── images/
        ├── node/
        │   ├── Dockerfile
        │   └── mcp-handler.js
        └── python/
            ├── Dockerfile
            └── mcp-handler.py
```

#### Task 4.2: Security & Cleanup Implementation - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 4 days  
**Assignee**: Backend + DevOps  
**Due Date**: TBD  
**Dependencies**: Task 4.1  
**Progress**: 
- [ ] Implement starship-scoped isolation
- [ ] Create read-only credential mounts
- [ ] Add network segmentation
- [ ] Set container resource limits
- [ ] Implement NetworkCleanupService
- [ ] Add volume cleanup logic
- [ ] Create security audit tools
- [ ] Write security documentation

**Completion Criteria**:
- Security measures implemented
- Cleanup automation working
- Resource limits enforced
- Security audit passing
**Security:**
- Starship-scoped volume isolation
- Read-only credential mounts
- Network segmentation per starship
- Container resource limits

**Cleanup Strategy:**
```typescript
class NetworkCleanupService {
  async cleanupStarship(starshipId: string): Promise<void> {
    const networkName = `starship-${starshipId}`
    
    // 1. Stop and remove all containers in the network
    const containers = await this.getNetworkContainers(networkName)
    for (const container of containers) {
      await docker.removeContainer(container.id, { force: true })
    }
    
    // 2. Remove compose file
    await fs.unlink(`/data/docker/compose-files/starship-${starshipId}.yml`)
    
    // 3. Remove network
    await docker.removeNetwork(networkName)
    
    // 4. Clean up volumes
    await this.cleanupVolumes(starshipId)
  }
  
  private async cleanupVolumes(starshipId: string): Promise<void> {
    const volumePath = `/data/starships/${starshipId}`
    if (await fs.exists(volumePath)) {
      await fs.remove(volumePath)
    }
  }
}
```

### Phase 5: Service Generation & Orchestration (Week 3) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 5 days  
**Dependencies**: Phase 4 completion  
**Assignee**: Backend Team  
**Progress**: 0/2 tasks completed  

#### Task 5.1: Enhanced Service Generation - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 4.2  
**Progress**: 
- [ ] Implement DockerComposeGenerator class
- [ ] Add service configuration builder
- [ ] Create volume mounting logic
- [ ] Add resource limit configuration
- [ ] Implement health check setup
- [ ] Add label management
- [ ] Create service validation
- [ ] Write comprehensive tests

**Completion Criteria**:
- Service generation automated
- All configurations working
- Resource limits applied
- Health checks functional
```typescript
class DockerComposeGenerator {
  async generateService(starshipId: string, connector: MCPServerConnector): Promise<DockerService> {
    const template = await this.getDockerTemplate(connector.templateId)
    const serviceName = `mcp-${starshipId}-${template.slug}`
    const networkName = `starship-${starshipId}`
    
    // Parse environment variables
    const envVars = JSON.parse(connector.env || '{}')
    
    // Build service configuration
    const service: DockerService = {
      image: template.image,
      container_name: serviceName,
      command: template.command,
      environment: envVars,
      restart: 'unless-stopped',
      networks: [networkName],
      labels: {
        'starship.id': starshipId,
        'connector.id': connector.id,
        'template.slug': template.slug,
        'managed-by': 'starships'
      },
      healthcheck: template.healthcheck || this.defaultHealthcheck(),
      volumes: this.buildVolumes(template, starshipId),
      deploy: {
        resources: {
          limits: {
            cpus: '0.5',
            memory: '512M'
          }
        }
      }
    }
    
    return service
  }
  
  private buildVolumes(template: DockerServiceTemplate, starshipId: string): string[] {
    if (!template.requiresFileAccess) return []
    
    return template.volumes?.map(vol => {
      const source = vol.source.replace('{starshipId}', starshipId)
      return `${source}:${vol.target}:${vol.mode}`
    }) || []
  }
}
```

#### Task 5.2: Incremental Compose Updates - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 5.1  
**Progress**: 
- [ ] Implement ComposeFileManager class
- [ ] Add incremental service updates
- [ ] Create network management
- [ ] Add compose file versioning
- [ ] Implement atomic updates
- [ ] Add rollback capabilities
- [ ] Create update validation
- [ ] Write integration tests

**Completion Criteria**:
- Incremental updates working
- No service disruption
- Rollback procedures tested
- File management robust
```typescript
class ComposeFileManager {
  async addService(starshipId: string, serviceName: string, service: DockerService): Promise<void> {
    const composePath = `/data/docker/compose-files/starship-${starshipId}.yml`
    
    // Load existing compose or create new
    let compose = await this.loadCompose(composePath) || this.createEmptyCompose(starshipId)
    
    // Add new service
    compose.services[serviceName] = service
    
    // Save updated compose
    await this.saveCompose(composePath, compose)
    
    // Apply changes without affecting other services
    await this.applyServiceOnly(starshipId, serviceName)
  }
  
  private async applyServiceOnly(starshipId: string, serviceName: string): Promise<void> {
    // Use docker-compose up with specific service name
    // This starts only the new service without touching others
    await exec(`docker-compose -f /data/docker/compose-files/starship-${starshipId}.yml up -d --no-recreate ${serviceName}`)
  }
}

### Phase 6: Health Monitoring & Communication (Week 3-4) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 6 days  
**Dependencies**: Phase 5 completion  
**Assignee**: Backend Team  
**Progress**: 0/2 tasks completed  

#### Task 6.1: MCP Protocol Handler - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 5.2  
**Progress**: 
- [ ] Implement MCPProtocolHandler class
- [ ] Add connection management
- [ ] Create request routing
- [ ] Add connection pooling
- [ ] Implement timeout handling
- [ ] Add error recovery
- [ ] Create connection monitoring
- [ ] Write protocol tests

**Completion Criteria**:
- MCP communication working
- Connection management robust
- Error handling comprehensive
- Performance optimized
```typescript
class MCPProtocolHandler {
  private connections: Map<string, MCPConnection> = new Map()
  
  async connect(connector: MCPServerConnector): Promise<MCPConnection> {
    // Connect using container DNS name
    const url = `tcp://${connector.dockerServiceName}:3000`
    
    const connection = await MCPClient.connect({
      transport: 'tcp',
      url,
      timeout: 30000
    })
    
    this.connections.set(connector.id, connection)
    return connection
  }
  
  async sendRequest(connectorId: string, method: string, params: any): Promise<any> {
    const connection = this.connections.get(connectorId)
    if (!connection) throw new Error('Not connected')
    
    return connection.request(method, params)
  }
}
```

#### Task 6.2: Health Monitoring Service - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 3 days  
**Assignee**: Backend Developer  
**Due Date**: TBD  
**Dependencies**: Task 6.1  
**Progress**: 
- [ ] Implement HealthMonitorService class
- [ ] Add container health checks
- [ ] Create MCP protocol monitoring
- [ ] Add health status tracking
- [ ] Implement alerting system
- [ ] Add health metrics collection
- [ ] Create health dashboard
- [ ] Write monitoring tests

**Completion Criteria**:
- Health monitoring active
- Metrics collection working
- Alerting system functional
- Dashboard displaying status
```typescript
class HealthMonitorService {
  async checkHealth(connector: MCPServerConnector): Promise<HealthStatus> {
    try {
      // 1. Check container status
      const containerStatus = await docker.getContainer(connector.dockerContainerId).inspect()
      
      // 2. Check MCP protocol connectivity
      const mcpHealth = await this.checkMCPHealth(connector)
      
      // 3. Update connector status
      await this.updateConnectorHealth(connector.id, {
        dockerHealthStatus: mcpHealth.healthy ? 'healthy' : 'unhealthy',
        dockerLastHealthCheck: new Date().toISOString()
      })
      
      return {
        container: containerStatus.State.Status,
        mcp: mcpHealth,
        timestamp: new Date()
      }
    } catch (error) {
      await this.handleHealthCheckFailure(connector, error)
    }
  }
}

### Phase 7: Production Readiness (Week 4) - 🔴 Not Started (0%)
**Phase Status**: Pending  
**Estimated Duration**: 5 days  
**Dependencies**: Phase 6 completion  
**Assignee**: DevOps + Backend Team  
**Progress**: 0/3 tasks completed  

#### Task 7.1: Logging & Monitoring - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: DevOps Engineer  
**Due Date**: TBD  
**Dependencies**: Task 6.2  
**Progress**: 
- [ ] Configure centralized logging
- [ ] Set up log rotation
- [ ] Implement LogAggregator class
- [ ] Add log streaming API
- [ ] Create monitoring dashboards
- [ ] Set up alerting rules
- [ ] Add performance metrics
- [ ] Document monitoring setup

**Completion Criteria**:
- Centralized logging working
- Monitoring dashboards active
- Alerting system configured
- Performance metrics tracked
```typescript
interface LoggingConfig {
  driver: 'json-file'
  options: {
    'max-size': '10m'
    'max-file': '3'
    'labels': 'starship.id,connector.id,template.slug'
  }
}

// Centralized log aggregation
class LogAggregator {
  streamLogs(connectorId: string): ReadableStream {
    return docker.getContainer(containerId).logs({
      stdout: true,
      stderr: true,
      follow: true,
      timestamps: true
    })
  }
}
```

#### Task 7.2: Resource Management - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 2 days  
**Assignee**: DevOps Engineer  
**Due Date**: TBD  
**Dependencies**: Task 7.1  
**Progress**: 
- [ ] Implement CPU limits (0.5 cores per container)
- [ ] Set memory limits (512MB default, configurable)
- [ ] Add disk quotas (1GB per starship workspace)
- [ ] Configure network bandwidth limiting
- [ ] Create resource monitoring
- [ ] Add resource alerting
- [ ] Implement quota enforcement
- [ ] Test resource constraints

**Completion Criteria**:
- Resource limits enforced
- Monitoring active
- Quotas working correctly
- Performance impact minimal

#### Task 7.3: Backup & Recovery - ⚪ Not Started
**Status**: Pending  
**Estimated Time**: 1 day  
**Assignee**: DevOps Engineer  
**Due Date**: TBD  
**Dependencies**: Task 7.2  
**Progress**: 
- [ ] Implement automated workspace backups
- [ ] Create container state snapshots
- [ ] Develop disaster recovery procedures
- [ ] Set up backup scheduling
- [ ] Test recovery procedures
- [ ] Document backup processes
- [ ] Create recovery playbooks
- [ ] Validate backup integrity

**Completion Criteria**:
- Automated backups running
- Recovery procedures tested
- Documentation complete
- Backup integrity verified

## Live Implementation Dashboard

### 📊 Progress Overview
| Phase | Status | Progress | Duration | Team | Start Date | End Date |
|-------|--------|----------|----------|------|------------|----------|
| Phase 1: Foundation | 🔴 Not Started | 0% (0/3) | 5 days | Backend+DevOps | TBD | TBD |
| Phase 2: Core Services | 🔴 Not Started | 0% (0/3) | 7 days | Backend | TBD | TBD |
| Phase 3: Deployment | 🔴 Not Started | 0% (0/2) | 5 days | Full-stack | TBD | TBD |
| Phase 4: Security | 🔴 Not Started | 0% (0/2) | 6 days | Backend+DevOps | TBD | TBD |
| Phase 5: Orchestration | 🔴 Not Started | 0% (0/2) | 5 days | Backend | TBD | TBD |
| Phase 6: Monitoring | 🔴 Not Started | 0% (0/2) | 6 days | Backend | TBD | TBD |
| Phase 7: Production | 🔴 Not Started | 0% (0/3) | 5 days | DevOps+Backend | TBD | TBD |

**Overall Timeline**: 39 days (7.8 weeks)  
**Total Tasks**: 17 tasks  
**Completed**: 0 tasks  
**In Progress**: 0 tasks  
**Remaining**: 17 tasks  

### 🎯 Current Sprint Focus
**Sprint**: Pre-planning  
**Focus**: Team assignment and timeline planning  
**Next Milestone**: Phase 1 kickoff  

### 📈 Weekly Progress Tracker
```
Week 1: Foundation Setup
├── 🔴 Template Slug System (0%)
├── 🔴 Docker Base Images (0%)  
└── 🔴 Service Discovery (0%)

Week 2: Core Services + Security Start
├── 🔴 MCPServerConnector Model (0%)
├── 🔴 Docker Compose Generator (0%)
├── 🔴 Template-Docker Mapping (0%)
└── 🔴 Volume Structure (0%)

Week 3: Deployment + Monitoring
├── 🔴 Deployment Workflow (0%)
├── 🔴 API Endpoints (0%)
├── 🔴 Security & Cleanup (0%)
└── 🔴 Service Generation (0%)

Week 4: Production Readiness
├── 🔴 Health Monitoring (0%)
├── 🔴 Logging & Monitoring (0%)
├── 🔴 Resource Management (0%)
└── 🔴 Backup & Recovery (0%)
```

### 🚀 Quick Status Legend
- 🔴 **Not Started** - Task not yet begun
- 🟡 **In Progress** - Task actively being worked on  
- 🟢 **Completed** - Task finished and verified
- ⚪ **Blocked** - Task waiting on dependencies
- 🔵 **Under Review** - Task completed, pending review

### 📅 Implementation Checklist (Live Updates)

#### Week 1: Foundation (0% Complete)
- [ ] **Task 1.1** - Template Slug System (0 days remaining) - 🔴 Not Started
- [ ] **Task 1.2** - Docker Base Images (0 days remaining) - 🔴 Not Started  
- [ ] **Task 1.3** - Service Discovery Setup (0 days remaining) - 🔴 Not Started

#### Week 2: Core Services (0% Complete)
- [ ] **Task 2.1** - Enhanced MCPServerConnector Model - 🔴 Not Started
- [ ] **Task 2.2** - Docker Compose Generator Service - 🔴 Not Started
- [ ] **Task 2.3** - Template-to-Docker Mapping - 🔴 Not Started
- [ ] **Task 4.1** - Volume Structure - 🔴 Not Started

#### Week 3: Integration (0% Complete)
- [ ] **Task 3.1** - Deployment Workflow - 🔴 Not Started
- [ ] **Task 3.2** - API Endpoints - 🔴 Not Started  
- [ ] **Task 4.2** - Security & Cleanup Implementation - 🔴 Not Started
- [ ] **Task 5.1** - Enhanced Service Generation - 🔴 Not Started
- [ ] **Task 5.2** - Incremental Compose Updates - 🔴 Not Started

#### Week 4: Production (0% Complete)
- [ ] **Task 6.1** - MCP Protocol Handler - 🔴 Not Started
- [ ] **Task 6.2** - Health Monitoring Service - 🔴 Not Started
- [ ] **Task 7.1** - Logging & Monitoring - 🔴 Not Started
- [ ] **Task 7.2** - Resource Management - 🔴 Not Started
- [ ] **Task 7.3** - Backup & Recovery - 🔴 Not Started

### 🔄 How to Update Progress
1. **Update task status** by changing the emoji (🔴→🟡→🟢)
2. **Update progress percentages** in the Progress Tracker section
3. **Update completion dates** when tasks finish
4. **Add notes/blockers** in the individual task sections
5. **Update sprint focus** weekly

## Key Technical Decisions

### 1. Real-time Deployment
- Containers deploy immediately on MCP selection
- No batch deployment or manual triggers
- Better UX with instant feedback

### 2. Internal Networking (K8s-Ready)
- No external port mapping needed
- Containers communicate via Docker DNS
- Each starship has isolated network
- Scales to unlimited containers

### 3. Simplified Naming
- Pattern: `mcp-{starshipId}-{templateSlug}`
- DNS-friendly names for service discovery
- Consistent with Kubernetes naming

### 4. Scoped Volumes
- `/data/starships/{starshipId}/` for isolation
- Read-only credential mounts
- Workspace directories for file access

### 5. Incremental Updates
- Add services without restarting others
- Use `docker-compose up -d --no-recreate`
- Maintain service availability

## Testing Strategy

### Unit Tests
- Template slug validation
- Network creation and cleanup
- Docker service configuration
- Volume path generation

### Integration Tests
- Connector creation → Container deployment
- Multiple MCP server deployments
- Container restart/removal
- Health check workflows

### E2E Tests
- User selects MCP → Container running
- API key updates → Container restart
- Starship deletion → Container cleanup
- Network connectivity tests

## Rollback Strategy

### Immediate Rollback
```typescript
if (deploymentFails) {
  // 1. Mark connector as error state
  await updateConnector(connectorId, { dockerStatus: 'error' })
  
  // 2. Stop and remove failed container
  await docker.removeContainer(containerId, { force: true })
  
  // 3. Fallback to legacy execution (if available)
  await legacyExecutor.start(connector)
}
```

### Feature Flag Control
```typescript
const DOCKER_DEPLOYMENT_ENABLED = process.env.FEATURE_DOCKER_MCP === 'true'

if (DOCKER_DEPLOYMENT_ENABLED) {
  await deployToDocker(connector)
} else {
  await legacyDeploy(connector)
}
```

## Performance Optimizations

### 1. Container Startup
- Pre-pulled base images on all nodes
- Cached NPM packages in base images
- Minimal container initialization

### 2. Network Performance
- Local TCP connections (no external routing)
- Connection pooling for MCP protocol
- Keep-alive for persistent connections

### 3. Resource Efficiency
- Shared base image layers
- Deduplicated volume storage
- Automatic idle container suspension

## Local Development Setup

### Prerequisites
- Docker Desktop (includes Docker Engine + Compose)
- Node.js 18+ for the app
- 8GB RAM recommended

### Development Workflow

#### 1. Start Development Environment
```bash
# Option A: App runs on host (easier debugging)
cd packages/server
npm run dev

# Option B: Everything in Docker
docker-compose -f docker-compose.dev.yml up
```

#### 2. Development Compose File
```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DOCKER_HOST=unix:///var/run/docker.sock
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./:/app
    networks:
      - dev-network

  neo4j:
    image: neo4j:5
    ports:
      - "7474:7474"  # Neo4j browser
      - "7687:7687"
    networks:
      - dev-network

networks:
  dev-network:
    driver: bridge
```

#### 3. Local Testing
```bash
# Watch containers
watch docker ps

# View logs
docker logs -f mcp-ship789-github

# Test MCP connection (from app container or with network access)
docker exec -it starships-app curl http://mcp-ship789-github:3000/health
```

### Development Features
- Hot reload for app code
- Container logs via API
- Mock mode for testing without API keys
- Resource limits to prevent local machine overload
- Network inspection tools for debugging connectivity

## Kubernetes Migration Path

### Architecture Designed for K8s

1. **No External Ports** → K8s Services work identically
2. **DNS Names** → K8s DNS works the same way
3. **MCPDeployer Interface** → Swap implementation for K8s
4. **Environment Variables** → Become ConfigMaps/Secrets
5. **Networks** → Map to K8s Namespaces

### Future K8s Implementation
```typescript
class K8sDeployer implements MCPDeployer {
  async deploy(starshipId: string, connector: MCPServerConnector): Promise<string> {
    // Create Deployment
    await k8sClient.createDeployment({
      metadata: { name: connector.dockerServiceName },
      spec: { /* ... */ }
    })
    
    // Create Service
    await k8sClient.createService({
      metadata: { name: connector.dockerServiceName },
      spec: { /* ... */ }
    })
    
    return connector.dockerServiceName  // Same DNS name!
  }
}
```

## Multi-User Scalability

### Container Isolation
- Each starship has dedicated network
- No cross-starship communication  
- Resource limits per container
- Complete cleanup when starship deleted

### Network Management
```typescript
class NetworkManager {
  async createStarshipNetwork(starshipId: string): Promise<void> {
    await docker.createNetwork({
      Name: `starship-${starshipId}`,
      Driver: 'bridge',
      Labels: {
        'starship.id': starshipId,
        'managed-by': 'starships',
        'created-at': new Date().toISOString()
      }
    })
  }
  
  async getActiveNetworks(): Promise<string[]> {
    const networks = await docker.listNetworks({
      filters: { label: ['managed-by=starships'] }
    })
    return networks.map(n => n.Name)
  }
}
```

### Scaling Strategy
1. **Vertical**: Increase Docker host resources
2. **Horizontal**: Add Docker hosts (Swarm/K8s)
3. **Logical**: One network per starship with automatic cleanup

### Example at Scale
```
100 users × 3 starships × 5 MCP servers = 1,500 containers

Solution: Internal networking (no port limits)
- 300 isolated networks (auto-cleanup when unused)
- DNS-based service discovery
- No port exhaustion
- Efficient resource cleanup
```

## Summary

This plan provides a simple, scalable approach to dockerizing MCP servers:
- **Simple**: Internal networking, no port management
- **Scalable**: No port limitations, supports thousands of containers
- **K8s-Ready**: Minimal changes needed for Kubernetes migration
- **Developer-Friendly**: Easy local testing with Docker Desktop

The implementation maintains the exact same user experience while providing a robust, production-ready architecture.