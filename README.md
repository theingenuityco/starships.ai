# starships.ai – Multi-Agent AI Mission Control Platform

A TypeScript monorepo for orchestrating multi-agent AI expeditions. Built with Next.js, Express, Neo4j, and LangChain/LangGraph for complex mission planning and execution.

> **Project status:** Active development with core features operational. Waitlist system live for early access.

## 📚 Key Documentation

- **[Deployment Guide](./docs/DEPLOYMENT_GUIDE.md)** - Production deployment instructions
- **[Production Status](./docs/PRODUCTION_DEPLOYMENT_STATUS.md)** - Current deployment status
- **[ER Diagram](./docs/er-diagram.md)** - Database schema and relationships
- **[Waitlist Implementation](./docs/waitlist-implementation-plan.md)** - Early access system

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- pnpm 8.10.5+
- Docker (for Neo4j database)
- Neo4j database

### Installation
```bash
git clone https://github.com/theingenuityco/starships.ai.git
cd starships.ai
pnpm install
```

### Configuration
1. Copy the environment template:
```bash
cp .env.example .env
```

2. Configure essential services:
- **Neo4j**: Run with Docker: `docker run -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/[NEO4J-PASSWORD] neo4j`
- **Kinde Auth**: Set up at [kinde.com](https://kinde.com)
- **OpenAI/Anthropic**: Add your API keys
- **Stripe**: Configure for payments (optional for development)

### Development
```bash
pnpm dev          # Start all packages in development mode
pnpm build        # Build all packages
pnpm type-check   # Run TypeScript checks
pnpm lint         # Run ESLint
```

---

## 📦 Packages

| Package | Description |
|---------|-------------|
| `@starships/client` | Next.js 14 frontend with mission control UI, real-time updates via Socket.IO |
| `@starships/server` | Express.js API server with authentication, missions, expeditions, and webhooks |
| `@starships/agent-engine` | LangChain/LangGraph AI orchestration, agent management, and tool execution |
| `@starships/models` | Neo4j database models, repositories, and migration system |
| `@starships/protocol` | Shared TypeScript types and interfaces |
| `@starships/core` | MCP HTTP bridge and shared utilities |
| `@starships/env-config` | Centralized environment configuration with validation |

---

## 🔧 Tech Stack

- **Monorepo:** pnpm Workspaces + Turborepo
- **Language:** TypeScript 5 (strict mode)
- **Frontend:** Next.js 14, Tailwind CSS, Socket.IO client
- **Backend:** Express.js, Socket.IO server
- **Database:** Neo4j graph database
- **AI/LLM:** LangChain, LangGraph, OpenAI/Anthropic APIs
- **Authentication:** Kinde Auth
- **Payments:** Stripe (subscriptions & webhooks)
- **Tools:** MCP (Model Context Protocol) integration

---

## 🌐 Core Features

### Current Implementation

**Authentication & Access:**
- Kinde OAuth integration
- JWT-based API authentication
- Waitlist system for early access

**Mission System:**
- Create and manage AI missions
- Real-time chat with mission orchestrator
- Multi-agent expedition execution

**Starship Management:**
- Create enhanced starships with AI vision
- Agent selection and configuration
- Tool integration via MCP

**Payments:**
- Stripe subscription management
- Multiple pricing tiers (Cruiser, Draught)
- Webhook handling for payment events

**Real-time Features:**
- Socket.IO for live updates
- Mission progress tracking
- Expedition status monitoring

### API Example
```bash
# Join waitlist
curl -X POST http://localhost:4000/api/waitlist/join \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}

# Create a mission (requires auth)
curl -X POST http://localhost:4000/missions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "starshipId": "ship-123",
    "title": "Research Mission",
    "objective": "Analyze market trends"
  }'
```

---

## 🐳 Docker Deployment

### Local Development with Docker
```bash
# Run Neo4j
docker run -d --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/[NEO4J-PASSWORD] \
  neo4j:latest

# Build and run the application
docker build -t starships.ai .
docker run -p 3000:3000 -p 4000:4000 --env-file .env starships.ai
```

### Production Deployment

The application is configured for deployment on various platforms. See [Deployment Guide](./docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

---

## 🛠️ CI/CD

GitHub Actions workflow builds and publishes Docker images to GitHub Container Registry (GHCR) on pushes to main branches.

## 🗺️ Project Status

### ✅ Implemented
- Core authentication with Kinde
- Waitlist system for early access
- Mission creation and chat interface
- Multi-agent expedition system
- Neo4j graph database integration
- Stripe payment processing
- Real-time Socket.IO communication
- Docker containerization

### 🚧 In Progress
- MCP tool integration enhancements
- Workflow DSL implementation
- Advanced agent marketplace
- Vision refinement features

### 📋 Planned
- Enterprise SSO integration
- Mobile application
- Advanced analytics dashboard
- Team collaboration features

## 🤝 Contributing

Contributions are welcome! Please check the issues tab for current tasks.

## 📄 License

Proprietary - All rights reserved
