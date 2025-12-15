# starships.ai

Turn goals into shipped work with AI agents. Starships plans the steps, builds a workflow, and executes with live visibility you can control.

This monorepo powers the product UI, API, and the Autopilot workflow engine. It targets product, ops, and engineering teams.

## How it works (3 steps)

1. Capture your goal in plain language
2. Starships proposes a plan and builds a DAG workflow (Autopilot)
3. Agents execute with streaming updates

## Quick start

- Requirements: Node 20+, pnpm 10+, Docker (optional for DB)
- Install: `pnpm install`
- Dev: `pnpm dev` (runs packages via Turborepo)

Common scripts:

```bash
pnpm dev        # all services in dev
pnpm build      # build all packages
pnpm type-check # TypeScript checks
pnpm lint       # ESLint
```

Database (optional local Postgres helpers):

```bash
pnpm run postgres:install  # start Postgres 18 container
pnpm run postgres:shell    # psql shell
pnpm run postgres:reset    # remove container
```

## Key concepts

- Planning UI (Vision Chamber): turns vague goals into a concrete plan (UI concept)
- Autopilot: executes DAG workflows (LLM/HTTP/conditional/tool nodes)
- Starship: your workspace for agents, workflows, and conversations
- Agent: an AI worker with tools and memory
- Conversation: structured chat and streaming outputs
- Workflow: a directed graph of steps with state and events

## Architecture at a glance

- Client: Next.js 15, React 19, shadcn/ui, streaming via SSE
- Server: Express 5, PostgreSQL 18, JWT auth, SSE channels
- Engine: `@starships/autopilot` for DAG execution and events
- Ops: Docker, Kubernetes manifests in `k8s/`, infra IaC in `infra/`

See `docs/architecture/` and `k8s/prod/*` for production layout.

## Common tasks (API)

Base URL: `http://localhost:4000/api/v1` (see SERVER_URL)

Create a starship:

```bash
curl -X POST $API/starships \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Enterprise"}'
```

Create a conversation and send a message:

```bash
CONV_ID=$(curl -s -X POST $API/conversations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"starshipId":"<starshipId>"}' | jq -r '.data.id')

curl -X POST $API/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Run the weekly competitive brief"}'
```

Stream conversation updates (SSE):

```bash
curl -N -H "Accept: text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  "$API/conversations/$CONV_ID/messages?stream=true"
```

## Deployment overview

- Kubernetes: manifests in `k8s/prod/`, IAM and cluster config in `infra/prod/`

## Security & observability

- JWT auth, rate limiting, CORS, encrypted API keys
- Health: `GET /api/v1/health`
- Metrics and structured logs available; see package READMEs

## Links

- Client: `packages/client/README.md`
- Server: `packages/server/README.md`
- Autopilot: `packages/autopilot/README.md`
- ER diagram: `docs/er-diagram.md`

---

Out-of-date? Please open an issue with context and expected behavior.
