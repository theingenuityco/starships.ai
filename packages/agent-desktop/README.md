# Starship Agent (desktop)

A small Tauri desktop app — a live dashboard over the
[agent-runner](../agent-runner) control API: connection status, recent
dispatches, a log stream, and pause/resume.

The app bundles the runner as a Tauri **sidecar**: on launch the Rust shell
spawns `starship-agent run` on a random loopback port + token, the UI connects
automatically, and the runner is stopped when the window closes. (If you open
the frontend outside Tauri — e.g. plain `vite dev` — it falls back to a manual
"connect to a running runner" screen.)

## Run in development

From the repo root, with the platform stack already running (`pnpm dev`, which
starts the MCP server on :4100):

```bash
pnpm dev:agent
```

That builds the runner sidecar and launches the Tauri app, pointing the spawned
runner at the local MCP server with the seeded dev token. Override any of these
to use a real agent:

```bash
STARSHIP_AGENT_TOKEN=sk-ship-… STARSHIP_EXECUTOR="claude -p {{prompt}}" pnpm dev:agent
```

Equivalent package-level commands:

```bash
pnpm --filter @starships/agent-desktop build:sidecar   # compile ../agent-runner → src-tauri/binaries/
pnpm --filter @starships/agent-desktop dev:tauri        # build:sidecar + tauri dev
```

## Build

```bash
pnpm --filter @starships/agent-desktop build:sidecar
pnpm --filter @starships/agent-desktop tauri build
```

Produces a native installer for the current platform. CI builds all platforms
on tag — see `.github/workflows/agent-release.yml`.

> Requires Rust ≥ 1.88 for a fresh dependency tree (this repo's `Cargo.lock`
> pins a set compatible with 1.86). Frontend: Vite + React + Tailwind v4 under
> `src/`; Tauri shell under `src-tauri/`.
