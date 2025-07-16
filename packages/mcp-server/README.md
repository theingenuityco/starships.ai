# MCP Server

A comprehensive Model Context Protocol (MCP) server implementation for Starships.ai, providing secure, isolated tool execution environments for AI agents with granular permissions and agent-specific credentials.

## 🚀 Features

### Core Capabilities
- **Container-per-User**: Isolated Docker containers for each user's tools
- **Agent-Specific Permissions**: Granular control over which agents can use which tools
- **Agent-Specific Credentials**: Different credentials per agent for the same tool
- **Built-in Security**: Resource limits, network isolation, and capability dropping
- **Real-time Communication**: Socket.IO integration for live tool execution feedback
- **Comprehensive Monitoring**: Health checks, metrics, and audit logging

### Built-in Tools
- **Web Scraper**: Extract content from web pages
- **File Reader**: Read and process files
- **Data Analyzer**: Analyze structured data
- **Email Sender**: Send emails via SMTP

### Security Features
- **Encrypted Credentials**: AES encryption for sensitive data
- **Request Sanitization**: Input validation and dangerous content filtering
- **Rate Limiting**: Per-user and per-tool execution limits
- **Audit Logging**: Comprehensive logging of all operations
- **Container Isolation**: Sandboxed execution with resource limits

## 📋 Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

## 🛠 Installation

### Prerequisites

- **Node.js** 18+ with pnpm
- **Docker** 20.10+ with Docker Compose
- **Neo4j** 5.0+ (for metadata storage)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/your-org/starships.ai.git
cd starships.ai

# Install dependencies
pnpm install

# Build packages
pnpm -r build

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Start development services
docker-compose up -d neo4j
pnpm --filter @starships/mcp-server dev
```

### Production Setup

```bash
# Build for production
pnpm --filter @starships/mcp-server build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 🚀 Quick Start

### 1. Configure MCP for a User

```typescript
import { MCPService } from '@starships/mcp-server';

const config = {
  userId: 'user123',
  tools: [
    {
      name: 'web_scraper',
      description: 'Scrape web content',
      parameters: {
        url: { type: 'string', required: true }
      },
      permissions: ['web_access'],
      category: 'data'
    }
  ],
  agentPermissions: {
    'agent1': ['web_scraper'],
    'agent2': ['web_scraper']
  },
  agentToolCredentials: {
    'agent1': {
      'web_scraper': { apiKey: 'agent1_key' }
    },
    'agent2': {
      'web_scraper': { apiKey: 'agent2_key' }
    }
  },
  limits: {
    memory: '512m',
    cpu: '0.5',
    timeout: 30000
  }
};

const result = await MCPService.configureMCPForUser(config);
console.log('MCP configured:', result);
```

### 2. Execute a Tool

```typescript
const toolCall = {
  id: 'call-123',
  toolName: 'web_scraper',
  parameters: { url: 'https://example.com' },
  agentId: 'agent1',
  userId: 'user123',
  timestamp: new Date().toISOString()
};

const result = await MCPService.executeTool(toolCall);
console.log('Tool result:', result);
```

### 3. Real-time Tool Execution

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

// Execute tool with real-time feedback
socket.emit('mcp:tool-execute', toolCall);

socket.on('mcp:tool-stream', (chunk) => {
  console.log('Tool progress:', chunk);
});

socket.on('mcp:tool-result', (result) => {
  console.log('Tool completed:', result);
});
```

## ⚙️ Configuration

### Environment Variables

```bash
# Core Configuration
NODE_ENV=development
PORT=3001
MCP_SERVER_PORT=3002

# Database
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# Docker Configuration
MCP_DOCKER_SOCKET=/var/run/docker.sock
MCP_CONTAINER_REGISTRY=docker.io
MCP_NETWORK_MODE=mcp-tools-network

# Security
MCP_ENCRYPTION_KEY=your-32-character-encryption-key
MCP_ENABLE_RATE_LIMITING=true
MCP_RATE_LIMIT_MAX_REQUESTS=100

# Container Limits
MCP_DEFAULT_MEMORY_LIMIT=512m
MCP_DEFAULT_CPU_LIMIT=0.5
MCP_DEFAULT_TIMEOUT=30000
```

### Docker Configuration

```yaml
# docker-compose.yml
version: '3.8'

services:
  mcp-server:
    build: .
    ports:
      - "3001:3001"
      - "3002:3002"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - NODE_ENV=development
    depends_on:
      - neo4j

  neo4j:
    image: neo4j:5.15-community
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/password
```

## 📚 API Reference

### REST Endpoints

#### Configure MCP Server
```http
POST /api/mcp/configure
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "userId": "user123",
  "tools": [...],
  "agentPermissions": {...},
  "agentToolCredentials": {...},
  "limits": {...}
}
```

#### Execute Tool
```http
POST /api/mcp/tools/execute
Content-Type: application/json
Authorization: Bearer <jwt-token>

{
  "id": "call-123",
  "toolName": "web_scraper",
  "parameters": {"url": "https://example.com"},
  "agentId": "agent1",
  "userId": "user123"
}
```

#### Get MCP Status
```http
GET /api/mcp/status/:userId
Authorization: Bearer <jwt-token>
```

### Socket.IO Events

#### Client to Server
- `mcp:configure` - Configure MCP server
- `mcp:tool-execute` - Execute tool with real-time feedback
- `mcp:health-check` - Check server health

#### Server to Client
- `mcp:configuration-result` - Configuration result
- `mcp:tool-result` - Tool execution result
- `mcp:tool-stream` - Real-time execution progress
- `mcp:status-update` - Server status updates

For complete API documentation, see [docs/API.md](docs/API.md).

## 🏗 Architecture

### System Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────────┐
│   User A        │───▶│   Backend API    │───▶│    User A MCP Container         │
│                 │    │                  │    │  ┌─────────────────────────────┐│
│ Agent 1 (Support)   │   - Validates    │    │  │ Tools + Agent Credentials:  ││
│   ✅ email_sender│    │   - Creates      │    │  │ • email_sender              ││
│     📧 support@ │    │     Container    │    │  │   - support@company.com     ││
│   ✅ crm_connector    │   - Sets Agent   │    │  │   - sales@company.com       ││
│     🔑 support_key    │     Permissions  │    │  │   - marketing@company.com   ││
│                 │    │   - Injects      │    │  │ • crm_connector             ││
│ Agent 2 (Sales) │    │     Credentials  │    │  │   - support_crm_key_123     ││
│   ✅ email_sender│    │                  │    │  │   - sales_crm_key_456       ││
│     📧 sales@   │    │                  │    │  │ • web_scraper               ││
│   ✅ crm_connector    │                  │    │  └─────────────────────────────┘│
│     🔑 sales_key│    │                  │    │                                 │
└─────────────────┘    └──────────────────┘    └─────────────────────────────────┘
```

### Core Components

1. **UserContainerManager**: Manages Docker containers for users
2. **ToolRegistry**: Handles tool definitions and executors
3. **SecurityManager**: Encryption, validation, and security policies
4. **MCPService**: Main service orchestrating MCP operations

### Data Flow

1. User configures MCP server with tools and permissions
2. System creates isolated Docker container for user
3. Agent requests tool execution with specific parameters
4. System validates permissions and injects agent credentials
5. Tool executes in isolated container environment
6. Results returned with audit logging

## 🔒 Security

### Container Security
- **Resource Limits**: Memory, CPU, and process constraints
- **Capability Dropping**: Remove all Linux capabilities by default
- **Network Isolation**: Containers run with no network access by default
- **Read-only Root**: Filesystem protection
- **Tmpfs Mounts**: Temporary storage with size limits

### Credential Security
- **AES Encryption**: All credentials encrypted at rest
- **Agent-specific**: Different credentials per agent for same tool
- **Secure Storage**: Encrypted credentials in Neo4j database
- **Audit Logging**: All credential operations logged

### Request Security
- **Input Validation**: Comprehensive parameter validation
- **Rate Limiting**: Per-user and per-tool execution limits
- **Content Filtering**: Dangerous content detection and blocking
- **Authentication**: JWT-based authentication for all endpoints

### Example Security Configuration

```typescript
const securityConfig = {
  containerLimits: {
    memory: '512m',
    cpu: '0.5',
    processes: 100,
    fileDescriptors: 1024
  },
  networkIsolation: true,
  capabilityDropping: ['ALL'],
  rateLimiting: {
    windowMs: 60000,
    maxRequests: 100
  },
  encryption: {
    algorithm: 'aes-256-cbc',
    keyRotation: '30d'
  }
};
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test --coverage

# Run specific test suite
pnpm test UserContainerManager

# Watch mode
pnpm test --watch
```

### Test Coverage

Current test coverage:
- **UserContainerManager**: 80.46%
- **ToolRegistry**: 90.38%
- **Overall**: 60.72%

### Writing Tests

```typescript
import { UserContainerManager } from '../src/docker/UserContainerManager';
import { MCPConfiguration } from '@starships/protocol';

describe('UserContainerManager', () => {
  let containerManager: UserContainerManager;

  beforeEach(() => {
    containerManager = new UserContainerManager();
  });

  it('should create container with proper configuration', async () => {
    const config: MCPConfiguration = {
      // ... configuration
    };

    const containerId = await containerManager.createUserContainer('user1', config);
    expect(containerId).toBeDefined();
  });
});
```

## 🚀 Deployment

### Development Deployment

```bash
# Start development environment
docker-compose up -d
pnpm dev
```

### Production Deployment

```bash
# Build for production
pnpm build

# Start production services
docker-compose -f docker-compose.prod.yml up -d
```

### Health Checks

```bash
# Check service health
curl -f http://localhost:3001/health
curl -f http://localhost:3002/health

# Check container status
docker ps --filter "name=starships"
```

For detailed deployment instructions, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 🔧 Troubleshooting

### Common Issues

#### Container Creation Failures
```bash
# Check Docker daemon
sudo systemctl status docker

# Check permissions
ls -la /var/run/docker.sock

# Clean up resources
docker system prune -f
```

#### Database Connection Issues
```bash
# Test Neo4j connectivity
docker exec neo4j cypher-shell -u neo4j -p password "RETURN 1"

# Check logs
docker logs neo4j
```

#### Tool Execution Failures
```bash
# Check user containers
docker ps --filter "label=starships.type=mcp-tools"

# Check container logs
docker logs starships-user-{userId}-mcp-tools
```

For comprehensive troubleshooting, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

## 📊 Monitoring

### Metrics

The MCP server exposes Prometheus metrics:

```bash
# View metrics
curl http://localhost:9090/metrics
```

Key metrics:
- `mcp_tool_executions_total` - Total tool executions
- `mcp_containers_active` - Active container count
- `http_request_duration_seconds` - Request duration

### Logging

Structured logging with multiple levels:

```typescript
import { logger } from './logger';

logger.info('Tool execution started', {
  userId: 'user123',
  toolName: 'web_scraper',
  agentId: 'agent1'
});

logger.error('Container creation failed', {
  userId: 'user123',
  error: error.message
});
```

### Health Monitoring

```bash
#!/bin/bash
# Monitor script
while true; do
  if ! curl -f http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ MCP Server is down"
    # Send alert
  fi
  sleep 30
done
```

## 🤝 Contributing

### Development Setup

```bash
# Fork and clone repository
git clone https://github.com/your-username/starships.ai.git
cd starships.ai

# Install dependencies
pnpm install

# Create feature branch
git checkout -b feature/your-feature

# Make changes and test
pnpm test
pnpm lint

# Commit and push
git commit -m "feat: add your feature"
git push origin feature/your-feature
```

### Code Standards

- **TypeScript**: Strict mode enabled
- **ESLint**: Follow existing configuration
- **Testing**: Maintain >80% coverage
- **Documentation**: Update docs for new features

### Pull Request Process

1. Ensure tests pass and coverage is maintained
2. Update documentation if needed
3. Follow conventional commit format
4. Request review from maintainers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🙏 Acknowledgments

- **Docker** for containerization technology
- **Neo4j** for graph database capabilities
- **Socket.IO** for real-time communication
- **Jest** for testing framework

## 📞 Support

- **Documentation**: Check [docs/](docs/) directory
- **Issues**: Create GitHub issue with details
- **Discussions**: Use GitHub Discussions for questions

---

**Built with ❤️ by the Starships.ai team**