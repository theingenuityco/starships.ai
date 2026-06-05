# Starship Agent (desktop)

A small Tauri desktop app — a live dashboard over the
[agent-runner](../agent-runner) control API: connection status, recent
dispatches, a log stream, and pause/resume.

## Run in development

```bash
# 1. start a runner with its control API exposed
starship-agent run --control-port 7777 --control-token dev-token

# 2. launch the app (Vite + Tauri)
pnpm --filter @starships/agent-desktop tauri dev
```

In the app, enter the control URL (`http://127.0.0.1:7777`) and the token, then
**Connect**. The dashboard streams live state over SSE.

## Build

```bash
pnpm --filter @starships/agent-desktop tauri build
```

Produces a native installer for the current platform.

> Requires Rust ≥ 1.88 for a fresh dependency tree (this repo's `Cargo.lock`
> pins a set compatible with 1.86). The frontend is plain Vite + React +
> Tailwind v4 under `src/`; the Tauri shell is under `src-tauri/`.

## Roadmap

- Bundle the runner as a Tauri **sidecar** so the app starts/stops it itself
  (today it connects to a runner you start). This pairs with the cross-platform
  binary build in the release pipeline.
