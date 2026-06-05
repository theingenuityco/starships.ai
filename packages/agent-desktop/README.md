# Starship Agent (desktop)

A Tauri desktop app that onboards local agents into a Starship:

1. **Sign in** to your Starship (enter the server URL + email/password).
2. **Pick a starship** (auto-selected if you only have one).
3. **Detect** — the app scans your `PATH` for known agent CLIs (Claude Code,
   Codex, aider, …).
4. **Connect** — one click registers (or reuses) the agent in the starship,
   mints a token, and starts a runner bound to that agent's local command.

The app supervises a **pool of runners** — one per connected agent — each a
bundled `starship-agent` sidecar on its own loopback control port. Connected
agents persist and auto-restart on next launch (no re-login needed; login is
only required to connect new agents). Connected cards show live status and
recent dispatches; **Stop** kills a runner.

The executor command is auto-derived from the agent kind (e.g. `claude -p
{{prompt}}`) and editable before you click Connect.

## Run in development

From the repo root, with the platform stack running (`pnpm dev` — starts the
server on :4000 and the MCP server on :4100):

```bash
pnpm dev:agent     # build:sidecar + tauri dev
```

Then in the app: sign in (Server URL `http://localhost:4000`), pick your
starship, and Connect a detected agent. Create a heartbeat for that agent in
the cloud UI and watch it flow picked-up → completed on the Connected card.

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
