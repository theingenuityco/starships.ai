# @starships/client

Next.js (App Router) frontend for **starships.ai**. This package renders the product UI for managing starships (workspaces), agents, tools, connectors, conversations, schedules, and billing.

## How it talks to the backend

The client uses **same-origin** requests to the API (e.g. `fetch('/api/v1/auth/me')`). In development and production, `/api/*` is expected to be routed to `@starships/server` by a reverse proxy / ingress (see `@starships/reverse-proxy`).

## Run (recommended)

From the repo root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Then open:
- App: `http://localhost:8080`
- Docs: `http://localhost:8080/docs`
- API health: `http://localhost:8080/api/v1/health`

## Run this package alone (advanced)

If you start only the client (`pnpm --filter @starships/client dev`), you must still ensure that:
- `/api/*` routes to the server (e.g. via `@starships/reverse-proxy`, or your own proxy)
- the server can reach Postgres (and Redis if using schedules)

## App routes (high-level)

- **Auth & account**
  - `/login`
  - `/forgot-password`, `/reset-password`
  - `/account`
  - `/accept-invite`
  - `/onboarding`
  - `/upgrade`
- **Starship workspace**
  - `/ship/[slug]/dashboard` (and `/dashboard/preview`)
  - `/ship/[slug]/conversations`, `/ship/[slug]/conversations/[conversationId]`
  - `/ship/[slug]/rooms`, `/ship/[slug]/rooms/[roomSlug]/*` (room conversations + threads)
  - `/ship/[slug]/agent/[agentSlug]`
  - `/ship/[slug]/tool/[toolSlug]`
  - `/ship/[slug]/tools`
  - `/ship/[slug]/connectors`
  - `/ship/[slug]/schedules`
  - `/ship/[slug]/automations`
  - `/ship/[slug]/tables`, `/ship/[slug]/tables/[tableId]`
  - `/ship/[slug]/views`, `/ship/[slug]/views/[viewId]`, `/ship/[slug]/views/[viewId]/edit`
  - `/ship/[slug]/tasks`
  - `/ship/[slug]/members`
  - `/ship/[slug]/notifications`
  - `/ship/[slug]/installed`
  - `/ship/[slug]/management`
  - `/ship/[slug]/settings`, `/ship/[slug]/settings/[tab]`
- **Instance admin (guarded by `isInstanceAdmin`)**
  - `/admin/platform-secrets`
  - `/admin/connector-templates`
  - `/admin/llm-models`

## Troubleshooting

- **API requests 404 in the browser**: you’re likely hitting the client directly (port 3000) without a proxy/ingress mapping `/api/*` to the server.
- **Streaming not updating**: verify the SSE endpoint works:

```bash
curl -N -H "Accept: text/event-stream" "http://localhost:8080/api/v1/conversations/<id>/messages?stream=true"
```

## Links

- Root: `../../README.md`
- Server: `../server/README.md`
- Reverse proxy: `../reverse-proxy/README.md`
- Autopilot engine: `../autopilot/README.md`
