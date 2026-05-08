<p align="center">
  <img src="packages/client/public/starships-logo.svg" alt="starships.ai" width="180" />
</p>

<p align="center">
  <strong>Open-source AI agent automation platform</strong><br/>
  <em>Archived May 2026 &mdash; open-sourced as a production reference implementation</em>
</p>

<p align="center">
  <a href="./POSTMORTEM.md"><strong>Postmortem</strong></a> &middot;
  <a href="./public-docs/README.md"><strong>Docs</strong></a> &middot;
  <a href="./packages/autopilot/README.md"><strong>Autopilot Engine</strong></a> &middot;
  <a href="https://github.com/brayn003"><strong>Author</strong></a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/status-archived-red" alt="Archived" />
  <img src="https://img.shields.io/badge/TypeScript-5.8-3178c6" alt="TypeScript 5.8" />
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js 16" />
</p>

---

> **This project is archived.** starships.ai was an AI agent automation platform built in 2025–2026. The service is no longer running. The codebase is open-sourced as-is under the MIT license — use it as a reference implementation, fork it, or learn from it.
>
> Read the [POSTMORTEM.md](./POSTMORTEM.md) for the full story on what was built, what was tried, and why we shut down.

---

## What was starships.ai?

starships.ai was a **team workspace for running AI agents against real systems**. You create a **starship** (workspace), deploy **agents** and **tools**, connect external services via **connectors**, and run work through **conversations** (chat) or **schedules** (cron).

The execution engine — **Autopilot** — is a JSON-defined DAG runner with parallel execution, event-driven resumption (agents can pause and wait for a webhook), streaming SSE output, and an optional remote gRPC runner. **Blueprints** are the unit of logic: a graph of typed nodes wired by edges, executed by the engine with auth and secrets injected at runtime.

---

## What this codebase gives you

This is a production-quality reference for several non-trivial engineering problems:

| Piece | What you get |
|---|---|
| **Autopilot DAG engine** | JSON-defined workflow engine — parallel branches, event-driven resumption, streaming SSE, remote gRPC execution |
| **Multi-agent orchestration** | Agents with model selection, system prompt, per-tool permissions (allow / ask / deny), and blueprint-driven execution loops |
| **Connector & tool framework** | Auth injection via `HostRuntime` — blueprints never see raw secrets; webhook event routing and normalization across providers |
| **Multi-tenant SaaS backend** | Workspace isolation, JWT auth, invite flows, usage ledger and wallet, admin entitlements |
| **Production Next.js + Express monorepo** | pnpm + Turbo, TypeScript 5.8, React 19, BullMQ job queues, PostgreSQL, Docker, Kubernetes |

---

## Repo structure

| Package | Role |
|---|---|
| [`@starships/autopilot`](packages/autopilot/README.md) | Core DAG engine — blueprints, all 15 node types, eval expressions, streaming events |
| [`@starships/autopilot-runner`](packages/autopilot-runner/README.md) | Optional remote gRPC runner (ConnectRPC) for lower-latency execution via a dedicated worker pool |
| [`@starships/server`](packages/server/README.md) | Express 5 API — auth, workspaces, agents, tools, connectors, schedules, usage ledger, autopilot orchestration |
| [`@starships/client`](packages/client/README.md) | Next.js 16 / React 19 frontend — conversations, agent/tool/connector management, views, datasets, task boards |
| [`@starships/models`](packages/models/) | PostgreSQL data layer — entities, migrations, repositories |
| [`@starships/protocol`](packages/protocol/) | Shared TypeScript types across server, client, and autopilot |
| [`@starships/env`](packages/env/) | Centralized environment variable parsing and validation |
| [`@starships/errors`](packages/errors/) | Shared error class hierarchy |
| [`@starships/reverse-proxy`](packages/reverse-proxy/README.md) | Local dev reverse proxy — client (:3000), server (:4000), docs (:3001) unified at :8080 |
| [`@starships/docs`](packages/docs/) | Next.js + Fumadocs documentation site at `/docs` |
| [`public-docs/`](public-docs/README.md) | Agent-consumable markdown reference — blueprints, connectors, conversations, widgets, views, datasets |

---

## Architecture

```
Browser
  ↓  same-origin /api + /docs  (reverse proxy in dev; ingress in prod)
┌─────────────────────────────────────────────────────────┐
│  @starships/client  (Next.js 16, React 19)              │
│  Tailwind + Radix UI · Three.js · ReactFlow · Tiptap   │
└───────────────────┬─────────────────────────────────────┘
                    │  REST + SSE  /api/v1/*
┌───────────────────▼─────────────────────────────────────┐
│  @starships/server  (Express 5)                         │
│                                                         │
│  @starships/models → PostgreSQL                         │
│    users · starships · agents · tools · connectors      │
│    conversations · messages · rooms · schedules         │
│    datasets · views · tasks · usage ledger              │
│                                                         │
│  Redis (optional) → BullMQ                              │
│    schedule:worker · autopilot:worker · heartbeat       │
│                                                         │
│  Autopilot execution                                    │
│    ├─ local child-process  (default; RUNNER_URL unset)  │
│    └─ @starships/autopilot-runner  (ConnectRPC gRPC)    │
└─────────────────────────────────────────────────────────┘

External: AWS S3 (storage) · AWS SES (email)
LLMs:     OpenRouter · OpenAI · Anthropic · AWS Bedrock
Auth:     Google OAuth · GitHub OAuth
```

**Autopilot node types:**
`start` · `end` · `llm` · `agent` · `tool` · `connector_action` · `http_request` · `code` · `transform` · `mutate` · `conditional` · `await` · `user_prompt` · `ui_action` · `workflow`

---

## Self-hosting

### Prerequisites

- Node.js **20+**
- pnpm **10+** (`corepack enable` or install directly)
- Docker (recommended — used for local Postgres and Redis)

### 1. Configure environment

```bash
cp .env.example .env
```

Minimum vars for a working local loop:

| Variable | Notes |
|---|---|
| `POSTGRES_HOST/PORT/USER/PASSWORD/DATABASE` | Database connection |
| `JWT_SECRET` | 32+ chars |
| `ENCRYPTION_KEY` | 32+ random chars — required for connector secret encryption |
| `PUBLIC_URL` / `CLIENT_URL` / `SERVER_URL` / `DOCS_URL` | e.g. `http://localhost:8080`, `:3000`, `:4000`, `:3001` |
| `OPENROUTER_API_KEY` | Needed for agent/LLM execution and avatar generation |
| `RUNNER_URL` | Optional — leave unset to use the local child-process runner |

### 2. Start infrastructure

```bash
pnpm postgres:install   # Docker PostgreSQL
pnpm redis:install      # Docker Redis (required for schedules and workers)
```

### 3. Run

```bash
pnpm install
pnpm dev                # app at http://localhost:8080
```

To also run schedulers and job workers:

```bash
pnpm dev:with-workers
```

Default local URLs:
- App: `http://localhost:8080`
- API: `http://localhost:8080/api/v1`
- Docs: `http://localhost:8080/docs`

---

## API quick-start

```bash
export API="http://localhost:8080/api/v1"
```

Register and log in:

```bash
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123!","displayName":"Dev"}' | jq .

TOKEN="$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123!"}' | jq -r '.data.token')"
```

Create a conversation and stream a live response (SSE):

```bash
STARSHIP_ID="<your-starship-id>"

CONV_ID="$(curl -s -X POST "$API/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"starshipId\":\"$STARSHIP_ID\"}" | jq -r '.data.id')"

curl -s -X POST "$API/conversations/$CONV_ID/messages" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Draft a weekly competitive brief."}' | jq .

curl -N \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: text/event-stream" \
  "$API/conversations/$CONV_ID/messages?stream=true"
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.8 — all packages |
| Frontend | Next.js 16, React 19, Tailwind CSS, Radix UI, TanStack Query, Zustand |
| UI extras | Three.js (3D), Monaco Editor, Tiptap (rich text), ReactFlow (diagram builder), Recharts |
| Backend | Express 5, Node.js 20+ |
| Database | PostgreSQL 18 |
| Queue | Redis 7 + BullMQ 5 |
| LLM | OpenRouter (primary), OpenAI SDK, Anthropic SDK, AWS Bedrock |
| Auth | JWT (jose), OAuth 2.0 (Google, GitHub) |
| Storage | AWS S3 |
| Email | AWS SES |
| Monorepo | pnpm 10 + Turbo 2 |
| Linting | ESLint 9 (flat config) + Prettier |
| Testing | Jest 30 + ts-jest |
| Deployment | Docker (single image) + Kubernetes |

---

## Deployment

- **Docker** — the root `Dockerfile` builds a single image (client + server + docs); Postgres and Redis are external. Exposes ports 3000 (client), 3001 (docs), 4000 (API).
- **Kubernetes** — manifests in `k8s/` (dev and prod). Ingress routes `/api/*` to the server and `/docs/*` to the docs site.

---

## Documentation

| Doc | What's inside |
|---|---|
| [POSTMORTEM.md](./POSTMORTEM.md) | What was built, what was tried, why we shut down |
| [public-docs/](./public-docs/README.md) | Full reference — blueprints/nodes, connectors, conversations, datasets, views, widgets |
| [packages/autopilot/README.md](./packages/autopilot/README.md) | Engine quick-start, node reference, BlueprintBuilder, hostRuntime guide |
| [packages/server/README.md](./packages/server/README.md) | API overview, environment variables, execution flow |
| [packages/client/README.md](./packages/client/README.md) | Frontend routes, run instructions, troubleshooting |
| [packages/autopilot-runner/README.md](./packages/autopilot-runner/README.md) | Remote runner setup, gRPC API, curl examples |
| [packages/reverse-proxy/README.md](./packages/reverse-proxy/README.md) | Local dev proxy — routing rules, local domain setup |
| [docs/er-diagram.md](./docs/er-diagram.md) | Full PostgreSQL entity-relationship diagram |

---

## License

MIT © Rudraprasad Das ([@brayn003](https://github.com/brayn003))
