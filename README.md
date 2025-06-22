# starships.ai – Multi-Channel AI Agent Platform

starships.ai is a TypeScript monorepo that provides a flexible HTTP API for AI agents with persistent memory and Neo4j-backed storage. The platform supports multiple AI agents with customizable personalities and can be integrated with any chat platform through adapters.

> **Project status:** Core platform ready. Adapters for Discord, Slack, and other platforms are planned.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@starships/server` | `workspace:*` | Express.js server that provides HTTP API for AI agents, memory management, and administrative endpoints. |
| `@starships/agent-engine` | `workspace:*` | Core AI chat logic with memory management and LLM provider abstractions. |
| `@starships/neo4j-models` | `workspace:*` | Neo4j database models and repositories for agents, users, channels, and models. |
| `@starships/protocol` | `workspace:*` | Shared TypeScript interfaces and types for API contracts. |

## Tech Stack

* **Monorepo tooling:** [pnpm Workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build)
* **Language:** TypeScript 5 (strict) with project references
* **Runtime libs:** discord.js v14, express v5, axios, ioredis (TBD), dotenv
* **Quality:** ESLint + Prettier (enforced by `turbo run lint`)

---

## Quick-Start (local dev)

1. **Clone & install**

   ```bash
   git clone https://github.com/your-org/starships.ai.git
   cd starships.ai
   pnpm install
   ```

2. **Create `.env** (see Environment reference below)

3. **Run all packages in watch-mode**

   ```bash
   pnpm dev
   ```
   Turborepo will execute the `dev` script for each workspace concurrently (hot-reload via ts-node).

4. **Lint / Build**
   ```bash
   pnpm lint   # eslint
   pnpm build  # tsc ‑-build
   ```

---

## Environment Variables

The platform is configured via environment variables for flexible deployment.

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `NEO4J_URI` | Optional | `bolt://localhost:7687` | Neo4j connection URI (defaults to localhost) |
| `NEO4J_USERNAME` | Optional | `neo4j` | Neo4j database username |
| `NEO4J_PASSWORD` | Optional | `password` | Neo4j database password |
| `NEO4J_DATABASE` | Optional | `neo4j` | Neo4j database name |
| `PORT` | Optional | `4000` | Port for the Express server |
| `REDEPLOY_SECRET` | Optional | `super-secret-token` | Bearer token required by the `/redeploy` webhook |
| `OPENAI_API_KEY` | Optional | `sk-...` | OpenAI API key (when using OpenAI provider) |
| `PROVIDER` | Optional | `openai\|mock` | LLM provider to use (defaults to mock) |

The server will auto-seed with default agents if none exist in the database.

---

## HTTP API (server package)

### `GET /v1/agents`
List all available agents.

**Response:**
```json
[
  {
    "id": "agent-1",
    "name": "Assistant",
    "model": "gpt-4",
    "systemPrompt": "You are a helpful AI assistant."
  }
]
```

### `POST /v1/chat`
Send a message to an agent and get a response.

**Request:**
```json
{
  "agent_id": "agent-1",
  "user_id": "user-123",
  "channel_id": "channel-456",  // optional
  "message": "Hello, world!",
  "stream": false               // optional, enables SSE streaming
}
```

**Response:**
```json
{
  "reply": "Hello! How can I help you today?",
  "usage": {                    // optional, if provided by LLM
    "prompt_tokens": 10,
    "completion_tokens": 8
  }
}
```

### `POST /v1/memory/reset`
Clear conversation memory for a specific session.

**Request:**
```json
{
  "agent_id": "agent-1",
  "user_id": "user-123",
  "channel_id": "channel-456"  // optional
}
```

**Response:** `204 No Content`

### `POST /redeploy`
Administrative webhook endpoint. If `REDEPLOY_SECRET` is set it must be provided as a **Bearer** token in the `Authorization` header.

---

## Running with Docker

A multi-stage `Dockerfile` is provided for production deployments.

```bash
# Build image (includes dependency install & tsc build)
docker build -t starships.ai .

# Run container (mount .env or pass –e flags)
docker run -p 4000:4000 --env-file .env starships.ai
```

> Make sure the `PORT` inside `.env` matches the port you expose.

---

## Roadmap

* Vector-store backed `MemoryStore` (Redis or pgvector)
* Slash-command support for persona & memory management
* Automated tests (unit + integration)
* Helm chart / Terraform module for cloud-native deploys

Contributions are welcome 🛸

---

## CI/CD & Publishing

A GitHub Actions workflow (`Publish Docker Image to GHCR`) automatically builds and pushes the `starships.ai` image to **GitHub Container Registry (GHCR)** on every push to `master`.

Need to publish on-demand? You can now run the workflow **manually**:

1. Go to **Actions → Publish Docker Image to GHCR** in the repo sidebar.
2. Click **Run workflow** (top-right) and confirm. No inputs are required.

The exact same steps—build ➜ push ➜ optional RunPod redeploy—will be executed.
