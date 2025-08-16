# starships.ai – Multi-Channel AI Agent Platform

starships.ai is a TypeScript monorepo that provides a flexible HTTP API for AI agents with persistent memory and Neo4j-backed storage. The platform supports multiple AI agents with customizable personalities and can be integrated with any chat platform through adapters.

> **Project status:** Core platform ready. Adapters for Discord, Slack, and other platforms are planned.

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
Create a `.env` file with your configuration:
```bash
cp .env.example .env
# Edit .env with your settings
```

See [Environment Variables](./docs/environment.md) for complete configuration options.

### Development
```bash
pnpm dev    # Start all packages in watch mode
pnpm build  # Build all packages
pnpm lint   # Run ESLint
```

For detailed development workflow, see the [Development Guide](./docs/development-guide.md).

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@starships/server` | Express.js HTTP API server with routing and middleware |
| `@starships/agent-engine` | Core AI chat logic with memory management and LLM integration |
| `@starships/models` | Neo4j database models and repositories |
| `@starships/protocol` | Shared TypeScript interfaces and API contracts |

---

## 🔧 Tech Stack

- **Monorepo:** pnpm Workspaces + Turborepo
- **Language:** TypeScript 5 (strict) with project references
- **Database:** Neo4j graph database with Cypher queries
- **AI:** LangChain + OpenAI/Anthropic with FAISS vector storage
- **Server:** Express.js 5 with CORS and JSON middleware

---

## 🌐 API Overview

### Core Endpoints
- `GET /v1/agents` - List all available agents
- `POST /v1/chat` - Send message to agent and get response
- `POST /v1/memory/reset` - Clear conversation memory
- `POST /redeploy` - Administrative webhook (requires auth)

### Example Chat Request
```bash
curl -X POST http://localhost:4000/v1/chat \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agent-1",
    "user_id": "user-123",
    "message": "Hello!"
  }'
```

For complete API documentation with examples, see [API Design](./docs/api-design.md).

---

## 🐳 Docker Deployment

```bash
# Build image
docker build -t starships.ai .

# Run container
docker run -p 4000:4000 --env-file .env starships.ai
```

---

## 🛠️ CI/CD

GitHub Actions automatically builds and pushes Docker images to GHCR on every push to `master`. Manual workflow runs are also supported.

---

## 🗺️ Roadmap

- Slash-command support for persona & memory management
- Automated tests (unit + integration)
- Helm chart / Terraform module for cloud-native deploys
- Additional LLM provider integrations

Contributions are welcome 🛸
