# starships.ai – AI-Powered Starship Mission Control Platform

starships.ai is a sophisticated TypeScript monorepo that orchestrates multi-agent AI expeditions through an advanced mission control platform. Built for complex mission planning and execution, it features workflow DSL, MCP tool integration, real-time communication, vision refinement, and enterprise-grade billing.

> **Project status:** Production-ready platform with advanced mission orchestration, workflow execution, and payment processing. Continuous development of expedition features.

## 📚 Documentation

For comprehensive documentation, see the [`docs/`](./docs/) directory:

- **[Architecture Overview](./docs/architecture.md)** - System design and component structure
- **[Development Guide](./docs/development-guide.md)** - Setup, workflow, and coding standards
- **[API Design](./docs/api-design.md)** - Complete API reference and examples
- **[Environment Variables](./docs/environment.md)** - Configuration reference
- **[Memory System](./docs/memory-system.md)** - Dual-memory architecture details
- **[Data Layer](./docs/data-layer.md)** - Neo4j integration and repositories
- **[AI Integration](./docs/ai-integration.md)** - LLM providers and chat processing

---

## 🚀 Quick Start

### Automated Setup (Recommended)

For new developers, we provide an automated setup script that handles all dependencies:

```bash
git clone https://github.com/your-org/starships.ai.git
cd starships.ai
pnpm install
pnpm run setup  # Installs Docker, Kubernetes tools, and configures everything
```

See [Developer Setup Guide](./docs/DEVELOPER_SETUP.md) for detailed instructions.

### Prerequisites
- Node.js 20+
- pnpm 8.10.5+
- Docker Desktop (automatically installed by setup script)
- Neo4j database (local or cloud)

### Manual Installation
```bash
git clone https://github.com/your-org/starships.ai.git
cd starships.ai
pnpm install
```

### Configuration

#### Option 1: Using Infisical (Recommended)
Pull secrets automatically from Infisical:
```bash
pnpm sync:secrets  # Pulls development secrets from Infisical
```

For first-time setup:
1. Install Infisical CLI: `npm install -g @infisical/cli`
2. Login: `infisical login`
3. Run: `pnpm sync:secrets`

#### Option 2: Manual Configuration
Create a `.env` file with your configuration:
```bash
cp .env.example .env
# Edit .env with your settings
```

See [Environment Variables](./docs/environment.md) for complete configuration options.

### Development
```bash
pnpm dev       # Start all packages in watch mode
pnpm dev:sync  # Sync secrets from Infisical and start dev server
pnpm build     # Build all packages
pnpm lint      # Run ESLint
```

For detailed development workflow, see the [Development Guide](./docs/development-guide.md).

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@starships/server` | Express.js HTTP API server with mission orchestration, expeditions, workflows, and real-time communication |
| `@starships/agent-engine` | Advanced AI orchestration with MCP tool integration, First Officer system, and workflow execution |
| `@starships/models` | Neo4j graph database with mission system, MCP connectors, vision management, and Stripe integration |
| `@starships/protocol` | TypeScript interfaces for missions, workflows, Socket.IO events, and MCP protocols |
| `@starships/client` | Next.js frontend for mission control, expeditions, vision chambers, and starship management |
| `@starships/core` | HTTP bridge services for MCP integration and Docker deployment orchestration |
| `@starships/env-config` | Centralized environment configuration with validation for all services |

---

## 🔧 Tech Stack

- **Monorepo:** pnpm Workspaces + Turborepo
- **Language:** TypeScript 5 (strict) with project references
- **Database:** Neo4j graph database with Cypher queries and migration system
- **AI & LLM:** LangChain + LangGraph, OpenAI/Anthropic with FAISS vector storage
- **Server:** Express.js 5 with Socket.IO real-time communication
- **Orchestration:** Kubernetes + Docker with automated MCP connector deployment
- **Payments:** Stripe integration with subscription management and webhook handling
- **Tools:** MCP (Model Context Protocol) with HTTP bridge and tool discovery
- **Frontend:** Next.js with real-time UI and mission control interfaces

---

## 🌐 API Overview

### Core Feature APIs

**Mission & Expedition Management:**
- `POST /missions` - Create and manage mission orchestration
- `POST /starships/:id/expeditions` - Multi-agent expedition execution
- `GET /missions/:id/chat` - Mission chat and orchestrator communication

**Agent & Starship Operations:**
- `GET /agents` - List agents with marketplace filtering
- `POST /starships/enhanced` - Create starships with vision integration
- `PUT /starships/:id/vision` - AI-powered vision refinement

**MCP Tool Integration:**
- `GET /mcp-servers` - Available MCP server templates
- `PUT /starships/:id/native-api-keys` - Encrypted tool API key management

**Real-time Communication:**
- Socket.IO endpoints for expeditions, missions, and chat
- WebSocket-based progress tracking and status updates

**Workflow Execution:**
- Workflow DSL execution with approval workflows
- Real-time workflow visualization and monitoring

**Payment & Billing:**
- `POST /webhooks/stripe` - Stripe subscription management
- Automated billing for different starship classes

### Example Chat Request
```bash
# Create a mission
curl -X POST http://localhost:4000/missions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "starshipId": "starship-123",
    "title": "Market Research Mission",
    "objective": "Research competitive landscape for AI tools"
  }'

# Start an expedition
curl -X POST http://localhost:4000/starships/starship-123/expeditions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{
    "title": "Competitive Analysis",
    "objective": "Analyze top 10 AI productivity tools",
    "selectedAgents": ["research-agent", "analysis-agent"]
  }'
```

For complete API documentation with examples, see [API Design](./docs/api-design.md).

---

## 🐳 Docker Deployment

### Docker Deployment

```bash
# Build and run the platform
docker build -t starships.ai .
docker run -p 4000:4000 --env-file .env starships.ai
```

### Kubernetes Deployment

```bash
# Setup development cluster
pnpm k8s:setup

# Deploy to staging/production
pnpm deploy:staging
pnpm deploy:production

# Monitor deployments
pnpm deployment:health-check
pnpm k8s:status
```

For complete deployment guide, see [Deployment Documentation](./docs/deployment-guide.md).

---

## 🛠️ CI/CD

GitHub Actions automatically builds and pushes Docker images to GHCR on every push to `master`. Manual workflow runs are also supported.

---

## 🗺️ Roadmap

**Current Platform Features:**
- ✅ Mission orchestration with AI-powered planning
- ✅ Multi-agent expedition execution with real-time coordination
- ✅ Workflow DSL with approval workflows and quality validation
- ✅ MCP tool integration with Docker deployment
- ✅ Vision refinement with AI-powered improvement suggestions
- ✅ Stripe billing with subscription management
- ✅ Real-time Socket.IO communication
- ✅ Enterprise-grade backup and disaster recovery

**Roadmap:**
- Enhanced expedition orchestration with advanced agent coordination
- Advanced workflow templates and marketplace
- Additional MCP connectors and tool integrations
- Mobile applications for mission monitoring
- Enterprise SSO and advanced security features

Contributions are welcome 🛸
