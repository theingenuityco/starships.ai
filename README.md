# starships.ai

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **This project is archived.** starships.ai was an AI agent automation platform built in 2025–2026. The service is no longer running. The codebase is open-sourced as-is under the MIT license — use it as a reference implementation, fork it, or learn from it.
>
> See [POSTMORTEM.md](./POSTMORTEM.md) for context on what we built, what we learned, and why we shut down.

---

**starships.ai** was a workspace for running AI agents against real systems. You create a **starship** (workspace), deploy **agents** and **tools**, connect external services via **connectors**, and run work through **conversations** (chat) and **schedules** (cron). Under the hood, execution is driven by **Autopilot**: a JSON-defined workflow/DAG engine with streaming events.

This monorepo contains the product UI, API, workflow engine, remote runner, and docs — a full-stack production SaaS reference implementation.

## What this codebase demonstrates

- **Autopilot DAG engine** — a JSON-defined workflow engine with parallel execution, awaitable connector events, streaming SSE output, and a remote gRPC runner
- **Multi-agent orchestration** — configurable agents with model selection, prompt, tool permissions (allow/ask/deny), and blueprint execution
- **Connector/tool framework** — third-party integrations where auth is injected by the runtime so blueprints never see raw secrets; webhook event routing
- **Multi-tenant SaaS patterns** — workspace isolation, JWT auth, Stripe billing/credits, entitlements, usage ledger
- **Production monorepo** — pnpm + Turbo, TypeScript 5.8, Next.js 16 / React 19, Express 5, BullMQ, PostgreSQL, Docker, Kubernetes

## Architecture (high level)

```
Browser
  ↓ (same-origin /api + /docs via reverse proxy or ingress)
@starships/client  (Next.js UI)
  ↓ REST + SSE (/api/v1/*)
@starships/server  (Express API)
  ├─ PostgreSQL: users, starships, agents, tools, connectors, secrets, billing, schedules…
  ├─ Redis (optional): schedules queue (BullMQ)
  └─ Autopilot execution
       ├─ local child-process runner (default when RUNNER_URL is unset)
       └─ remote runner (@starships/autopilot-runner) when RUNNER_URL is set
```

Key packages:
- **Engine**: `@starships/autopilot` (blueprints, nodes, eval, events)
- **Runner**: `@starships/autopilot-runner` (ConnectRPC Execute/ExecuteStream)
- **Types**: `@starships/protocol`
- **DB layer**: `@starships/models`

## Self-hosting

### Prerequisites

- Node.js **20+**
- pnpm **10+** (Corepack is fine)
- Docker (recommended for local Postgres/Redis)

### Configure environment

```bash
cp .env.example .env
```

Minimum needed for a useful local dev loop:

- **Postgres**: `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`
- **Auth**: `JWT_SECRET` (32+ chars)
- **Secrets**: `ENCRYPTION_KEY` (32+ character random string, required for connector secret encryption)
- **LLM** (recommended): `OPENROUTER_API_KEY` (used by agent execution and avatar generation)
- **Runner** (optional): set `RUNNER_URL` to use the remote runner; unset it to use the local child-process runner

### Start local dependencies

```bash
pnpm postgres:install
pnpm redis:install
```

### Run the stack

```bash
pnpm install
pnpm dev
```

Default local URLs:
- App: `http://localhost:8080`
- API: `http://localhost:8080/api/v1`
- Docs: `http://localhost:8080/docs`

### Run schedulers/workers

Schedules require Redis and separate worker processes:

```bash
pnpm dev:with-workers
```

## Usage examples (API)

```bash
export API="http://localhost:8080/api/v1"
```

Register + login:

```bash
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123!","displayName":"Dev"}' | jq .

TOKEN="$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"Password123!"}' | jq -r '.data.token')"
```

Create a conversation and stream a response:

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

## Deployment

- **Docker**: the root `Dockerfile` builds a single image (client + server + docs; Postgres is external)
- **Kubernetes**: manifests in `k8s/` (dev/prod); infra config in `infra/`

## Package docs

- **Client**: `packages/client/README.md`
- **Server**: `packages/server/README.md`
- **Autopilot**: `packages/autopilot/README.md`
- **Runner**: `packages/autopilot-runner/README.md`
- **Docs site**: `packages/docs/README.md`
- **Public docs (agent-consumable)**: `public-docs/README.md`
- **ER diagram**: `docs/er-diagram.md`
