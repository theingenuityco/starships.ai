# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start full dev stack (app on http://localhost:8080)
pnpm dev:with-workers       # Dev + scheduler/worker/heartbeat processes

# Code quality
pnpm lint                   # ESLint across all packages (via Turbo)
pnpm type-check             # TypeScript check across all packages (via Turbo)
pnpm build                  # Build all packages (via Turbo)

# Tests — DO NOT RUN (crashes the machine due to resource exhaustion)
# pnpm test
# pnpm --filter @starships/autopilot test
# pnpm --filter @starships/server test
# pnpm --filter @starships/autopilot test -- --testPathPattern="src/__tests__/workflow.test.ts"

# Single package (run from root with --filter)
pnpm --filter @starships/client lint

# Infrastructure
pnpm postgres:install       # Spin up Docker PostgreSQL
pnpm redis:install          # Spin up Docker Redis
pnpm postgres:reset         # Wipe and recreate DB
pnpm postgres:shell         # Interactive psql
```

## Architecture

This is a pnpm monorepo with Turbo managing build/test/lint task graphs. Key packages under `packages/`:

- **`@starships/client`** — Next.js 16 / React 19 frontend. Serves the main UI at `/`. Uses TanStack Query for data fetching, Radix UI + Tailwind for components, Three.js for 3D elements.
- **`@starships/server`** — Express 5 API backend. All routes under `/api/v1`. Handles auth (JWT), billing (Stripe), storage (AWS S3), email (AWS SES), and orchestrates autopilot execution.
- **`@starships/autopilot`** — The core workflow/DAG execution engine. Agents, tools, and connectors are defined here. Runs either in-process (local child process) or delegated to the remote runner.
- **`@starships/autopilot-runner`** — Remote gRPC service (ConnectRPC + Protocol Buffers) that can execute autopilot workflows. Optional; controlled by `RUNNER_URL` env var.
- **`@starships/models`** — Database layer. All PostgreSQL schema, migrations, seeds, and query helpers live here.
- **`@starships/protocol`** — Shared TypeScript types used across server/client/autopilot.
- **`@starships/env`** — Centralised environment variable parsing and validation.
- **`@starships/errors`** — Shared error class hierarchy.
- **`@starships/reverse-proxy`** — Local dev reverse proxy that unifies client (`:3000`), server (`:3001`), and docs (`:3002`) behind `localhost:8080`.
- **`packages/docs`** — Next.js + Fumadocs documentation site at `/docs`.

### Data Flow

```
Browser → reverse-proxy (:8080)
           ├── /api/v1  → server (Express)
           │              └── autopilot engine (child process OR remote runner via gRPC)
           ├── /docs    → docs (Next.js)
           └── /        → client (Next.js)
```

### Queue System

BullMQ + Redis backs all async work: scheduled jobs, autopilot workers, heartbeats. The `dev:with-workers` command starts the additional processes needed for this.

## Tech Stack Highlights

- **TypeScript 5.8** everywhere; all packages share `tsconfig.nodejs.json` / `tsconfig.nextjs.json` base configs
- **ESLint 9** flat config (`eslint.config.mjs`) + **Prettier** (`singleQuote`, `semi`, `trailingComma: "es5"`, `printWidth: 140`)
- **Jest 30** with `ts-jest` (`isolatedModules: true`); test files at `src/**/__tests__/**/*.test.ts`
- **Turbo 2**: `turbo.json` defines exact task dependencies and caching rules — consult it before adding new build tasks
- LLM calls go through **OpenRouter** (`OPENROUTER_API_KEY`); direct Anthropic/OpenAI SDKs are also present for specific integrations

## Local Setup

```bash
cp .env.example .env        # Fill in required vars (see .env.example)
pnpm postgres:install
pnpm redis:install
pnpm install
pnpm dev
```

Critical env vars: `POSTGRES_*`, `REDIS_*`, `JWT_SECRET` (32+ chars), `ENCRYPTION_KEY` (32+ hex chars), `OPENROUTER_API_KEY`.

## Conventions

- Path aliases: `@starships/*` for cross-package imports; `@/` inside the autopilot package
- The autopilot package has `cache: false` in Turbo — its outputs are intentionally never cached
- Protocol Buffer definitions live in `packages/autopilot-runner/proto/`; regenerate with `pnpm --filter @starships/autopilot-runner gen`
