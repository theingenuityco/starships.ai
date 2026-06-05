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

```bash
# Build the runner sidecar for your machine, then launch the app.
pnpm --filter @starships/agent-desktop build:sidecar
pnpm --filter @starships/agent-desktop tauri dev
```

`build:sidecar` compiles `../agent-runner` into
`src-tauri/binaries/starship-agent-<target-triple>` with `bun --compile`.

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
