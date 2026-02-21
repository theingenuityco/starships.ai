# @starships/client (shared UI + API client)

Shared UI code + API client used by:

- `@starships/landing` (public landing + marketplace)
- `@starships/app` (authenticated app)

## How it talks to the backend

All API requests are made to the backend origin configured via `SERVER_URL` (exposed to the browser as `NEXT_PUBLIC_SERVER_URL`).

## Run (recommended)

From the repo root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Then open:
- Landing: `http://localhost:3002`
- App: `http://localhost:3003`
- API health: `http://localhost:4000/api/v1/health`

## Run this package alone

`@starships/client` is no longer a runnable Next.js app. Use `@starships/landing` and/or `@starships/app`.

## App routes (high-level)

- **Auth & account**
  - `/login`
  - `/profile`
  - `/forgot-password`, `/reset-password`
- **Starship workspace**
  - `/ship/[slug]/conversations` (SSE streaming turn output)
  - `/ship/[slug]/agents`
  - `/ship/[slug]/tools`
  - `/ship/[slug]/connectors`
  - `/ship/[slug]/schedules`
  - `/ship/[slug]/billing/*`
  - `/ship/[slug]/settings/*`
- **Marketplace**
  - `/marketplace` (tool templates and other catalog content)
- **Instance admin (guarded by `isInstanceAdmin`)**
  - `/admin/platform-secrets`
  - `/admin/connector-templates/*`
  - `/admin/agents/pending`

## Troubleshooting

- **API requests failing in the browser**: verify `SERVER_URL` (and therefore `NEXT_PUBLIC_SERVER_URL`) is correctly set to your API origin (e.g. `http://localhost:4000`).
- **Streaming not updating**: verify the SSE endpoint works:

```bash
curl -N -H "Accept: text/event-stream" "http://localhost:4000/api/v1/conversations/<id>/messages?stream=true"
```

## Links

- Root: `../../README.md`
- Server: `../server/README.md`
- Autopilot engine: `../autopilot/README.md`
