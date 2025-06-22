# starships.ai – Discord × Autonomous Agents Bridge

starships.ai is a TypeScript monorepo that turns a fleet of **Discord bots** into fully-fledged **Open WebUI** agents (or any ChatGPT-compatible backend). Each "persona" runs in its own Discord client and responds to @mentions, while an optional HTTP endpoint lets external services dispatch autonomous messages.

> **Project status:** Early technical foundation (Phase 1). Expect rapid changes and breaking refactors.

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| `@starships/bridge-core` | `workspace:*` | Library that handles all Discord ↔ LLM plumbing: persona registry, in-memory conversation memory, message routing and Discord client lifecycle. |
| `@starships/server` | `workspace:*` | Express.js web-server that boots all personas via `BotManager` and exposes HTTP endpoints such as `/dispatch` & `/redeploy`. |

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

The bridge is configured purely via environment variables so it can run anywhere (Docker, serverless, bare-metal).

| Variable | Required | Example | Purpose |
|----------|----------|---------|---------|
| `AGENTS_JSON` | One of | `[{"id":"agent-1","name":"R2-D2","model":"gpt-4o","botToken":"…"}]` | Inline JSON array describing active personas (see `AgentConfig` type) |
| `PERSONA_REGISTRY_URL` | One of | `https://registry.your-domain.com/agents` | Remote endpoint that returns the same JSON array as above |
| `OPEN_WEBUI_BASE_URL` | Optional | `http://localhost:3000` | Base URL of Open WebUI (defaults to `http://localhost:3000`) |
| `OPEN_WEBUI_API_KEY` | Optional | `sk-…` | API key forwarded as `Authorization: Bearer …` header when talking to Open WebUI |
| `PORT` | Optional | `4000` | Port for the Express server (`@starships/server`) |
| `REDEPLOY_SECRET` | Optional | `super-secret‐token` | Bearer token required by the `/redeploy` webhook |

If both `AGENTS_JSON` *and* `PERSONA_REGISTRY_URL` are missing the server will refuse to start.

---

## HTTP API (server package)

### `POST /dispatch`
Send an autonomous message **from** an agent **to** a Discord channel.

```jsonc
// request body
{
  "agent_id": "agent-1",      // must match an id from the persona registry
  "channel_id": "1234567890", // Discord channel ID
  "message": "Hello, world!"   // raw text
}
```
Responses:
* `200 OK { ok: true }` — message forwarded
* `404` — unknown agent or channel
* `400` — missing fields

### `POST /redeploy`
An optional health / ping endpoint for CI-CD pipelines. If `REDEPLOY_SECRET` is set it must be provided as a **Bearer** token in the `Authorization` header.

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
