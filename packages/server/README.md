# @starships/server

Express API server for **starships.ai** (the “Aether Core Server”). It owns authentication, starships (workspaces), agents, tools, connectors, billing/credits, schedules, and conversation execution. Conversation turns stream to clients over **Server‑Sent Events (SSE)**.

## Run (recommended)

From the repo root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

The API is then available at `http://localhost:8080/api/v1` (same-origin behind the dev reverse proxy).

To run only the server:

```bash
pnpm -w --filter @starships/server dev
```

## Environment variables (core)

Required for startup:

```env
SERVER_PORT=4000
JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters-long

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DATABASE=starships
POSTGRES_SSL=false
```

Commonly needed for full functionality:

```env
# LLM execution (agents + avatar generation)
OPENROUTER_API_KEY=...

# Remote runner (optional). If RUNNER_URL is unset, Autopilot falls back to a local child-process runner.
RUNNER_URL=http://localhost:50051
# RUNNER_AUTH_TOKEN=

# Scheduling (optional but required for schedules)
REDIS_HOST=localhost
REDIS_PORT=6379
```

## How execution works

- The server builds an **Autopilot engine config bundle** per turn (runtime env, connector sessions/templates, LLM config).
- Top-level execution uses:
  - **remote runner** when `RUNNER_URL` is set (ConnectRPC `Execute`/`ExecuteStream`)
  - otherwise a **local child-process runner** for isolation
- Live output is forwarded to clients via **SSE** on:
  - `GET /api/v1/conversations/:conversationId/messages?stream=true`

## API overview (prefix: `/api/v1`)

This is not a complete OpenAPI spec, but these are the endpoints most developers touch.

### Health

- `GET /health`

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/me`
- `GET /auth/:provider` and `GET /auth/:provider/callback` (Google/GitHub OAuth)
- `POST /auth/oauth/exchange` (exchange short-lived auth code for JWT)

### Starships (workspaces)

- `POST /starships`
- `GET /starships/:idOrSlug`
- `PUT /starships/:id`
- `DELETE /starships/:id`
- `GET /starships/:starshipId/conversations`

### Conversations + streaming

- `POST /conversations`
- `POST /conversations/:conversationId/messages` (starts a turn; streaming happens over SSE GET)
- `GET /conversations/:conversationId/messages` (JSON)  
  `GET /conversations/:conversationId/messages?stream=true` (SSE)
- `POST /conversations/:conversationId/stop` (stop current streaming turn)
- Tool-approval flow (used by agent blueprints):
  - `POST /conversations/:conversationId/tool-calls/authorize-and-maybe-execute` (always returns 200)
  - `POST /conversations/:conversationId/tool-approvals/:approvalId/approve`
  - `POST /conversations/:conversationId/tool-approvals/:approvalId/deny`

### Agents

- `POST /agents`
- `PUT /agents/:id`
- `DELETE /agents/:id`
- `GET /agents` / `GET /agents/public` / `GET /agents/search?q=...`
- `GET /agents/:slugOrId`
- `GET /starships/:starshipId/agents`

### Tools + templates

- `GET /tool-templates` (public; blueprints are not returned)
- `GET /tool-templates/:slug` (public)
- `POST /starships/:starshipId/tools`
- `POST /starships/:starshipId/tools/from-template`
- `GET /starships/:starshipId/tools`
- `GET /starships/:starshipId/tools/:slug`
- Tool publishing/admin:
  - `POST /tools/:id/publish-request`
  - `GET /admin/tools/pending` (instance admin)
  - `POST /admin/tools/:id/approve` / `POST /admin/tools/:id/reject`

### Connectors

- `GET /connectors/catalog` (public)
- `GET /starships/:id/connectors`
- `POST /starships/:id/connectors/:provider/start` (OAuth start)
- `GET /connectors/:provider/callback` (OAuth callback)
- `POST /starships/:id/connectors/:provider/api-key` / `.../basic` / `.../disconnect`
- `POST /starships/:id/connectors/:provider/test` / `.../refresh` (via blueprint when configured)

### Scheduling

- `POST /starships/:starshipId/schedules`
- `GET /starships/:starshipId/schedules`
- `PATCH /schedules/:scheduleId`
- `DELETE /schedules/:scheduleId`

Scheduler/worker processes (require Redis):
- `pnpm --filter @starships/server schedule:scheduler`
- `pnpm --filter @starships/server schedule:worker`

### Docs indexing (agent-consumable)

- `GET /docs` (search/index markdown in `public-docs/`)
- `GET /docs/<slug>` (fetch raw markdown by slug)

### Subscriptions (Stripe)

- `GET /subscriptions/plans` (prices with ship-class metadata)

## Quick cURL sanity checks

```bash
curl -s "http://localhost:8080/api/v1/health" | jq .
```

## Links

- Root: `../../README.md`
- Client: `../client/README.md`
- Autopilot engine: `../autopilot/README.md`
- Runner: `../autopilot-runner/README.md`
