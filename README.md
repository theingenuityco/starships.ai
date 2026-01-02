# starships.ai

**starships.ai** is a workspace for running AI agents against real systems. You create a **starship** (workspace), deploy **agents** and **tools**, connect external services via **connectors**, and run work through **conversations** (chat) and **schedules** (cron). Under the hood, execution is driven by **Autopilot**: a JSON-defined workflow/DAG engine with streaming events.

This monorepo contains the product UI, API, workflow engine, remote runner, and docs.

## Core capabilities

- **Starships (workspaces)**: multi-agent, tool-enabled workspaces with entitlements (max agents / concurrent turns).
- **Agents**: configurable assistants (model, prompt, blueprint) that can call tools and connectors.
- **Tools + marketplace**:
  - Tool instances live on a starship and are executable Autopilot blueprints.
  - Tool templates can be browsed publicly; publishing uses an instance-admin approval flow.
  - Tool calls can be set to **allow / ask (approval) / deny** per agent.
- **Connectors**: third‑party integrations executed via the `connector_action` node; auth is injected by the HostRuntime so blueprints never see raw secrets.
- **Conversations with live streaming**: chat turns stream to the UI over **Server‑Sent Events (SSE)**; the server can stop a turn and resume/replay.
- **Scheduling**: cron-based scheduled prompts executed by worker processes (BullMQ + Redis).
- **Billing & credits**: Stripe subscriptions define ship classes/entitlements; wallets/ledger track usage and credits.
- **Docs for humans + agents**:
  - A docs site at `/docs` (Next.js + Fumadocs).
  - A server endpoint (`GET /api/v1/docs`) that indexes `public-docs/` markdown for in-product/agent consumption.

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

Related packages:
- **Engine**: `@starships/autopilot` (blueprints, nodes, eval, events)
- **Runner**: `@starships/autopilot-runner` (ConnectRPC Execute/ExecuteStream)
- **Types**: `@starships/protocol`
- **DB layer**: `@starships/models`

## Setup & installation

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
- **Secrets**: `ENCRYPTION_KEY` (Required for platform/connector secrets; must be a 32+ character random string)
- **LLM** (recommended): `OPENROUTER_API_KEY` (used by agent execution and avatar generation)
- **Runner** (optional): set `RUNNER_URL` to use the remote runner; unset it to use the local child-process runner.

### Start local dependencies (optional helpers)

```bash
pnpm postgres:install
pnpm redis:install
```

### Run the stack (development)

```bash
pnpm install
pnpm dev
```

Default local URLs (from `.env.example`):
- App: `http://localhost:8080`
- API: `http://localhost:8080/api/v1`
- Docs: `http://localhost:8080/docs`

### Run schedulers/workers (development)

Schedules require Redis and separate processes:

```bash
pnpm dev:with-schedule
```

## Usage examples (API)

The UI uses same-origin requests (`/api/v1/*`). For cURL, set an API base:

```bash
export API="http://localhost:8080/api/v1"
```

Register + login (password auth):

```bash
curl -s -X POST "$API/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123","displayName":"Dev"}' | jq .

TOKEN="$(curl -s -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@example.com","password":"password123"}' | jq -r '.data.token')"
```

Create a conversation, send a message, then stream SSE:

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

## Deployment notes

- **Docker**: the root `Dockerfile` builds a single image that runs client + server + docs (Postgres is external).
- **Kubernetes**: manifests in `k8s/` (dev/prod); infra config in `infra/`.

## Links

- **Client**: `packages/client/README.md`
- **Server**: `packages/server/README.md`
- **Autopilot**: `packages/autopilot/README.md`
- **Runner**: `packages/autopilot-runner/README.md`
- **Docs site**: `packages/docs/README.md`
- **Public docs (agent-consumable)**: `public-docs/README.md`
- **ER diagram**: `docs/er-diagram.md`

---

If something here doesn’t match behavior, please open an issue with repro steps and expected vs actual output.
