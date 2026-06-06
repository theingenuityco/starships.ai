# Starship Agent (desktop)

A self-contained Tauri desktop app that runs local agent CLIs. No server, no
login: this app is the source of truth. Everything (runtimes, personas,
heartbeats, activity) lives in a local `store.json` (0600) in the app's config
dir.

1. **Detect** — the app scans your `PATH` for known agent CLIs (Claude Code,
   Codex, aider, …).
2. **Add a runtime** — register a detected CLI. The executor command is
   auto-derived from the agent kind (e.g. `claude --session-id {{sessionId}} -p
   {{prompt}}`) and editable before you add it.
3. **Create a persona** — an actor (name, model, system prompt) and assign it to
   a runtime.
4. **Run it** — run a persona on demand with a prompt, or schedule a
   **heartbeat** that runs it on an interval.

Execution is a direct, in-app call to the Rust `run_agent` command, which spawns
the CLI (argv array, no shell) and captures its output. Each run mints a session
id (`{{sessionId}}`) so the CLI's on-disk transcript is locatable afterwards and
viewable in the **Activity** tab.

> Heartbeat schedules advance only while the app is open (the scheduler runs in
> the app process).

## Run in development

```bash
pnpm --filter @starships/agent-desktop dev:tauri   # tauri dev
```

Detection and execution only work inside the Tauri shell. Plain `vite dev`
(`pnpm --filter @starships/agent-desktop dev`) renders the UI but cannot detect
or run CLIs.

## Build

```bash
pnpm --filter @starships/agent-desktop tauri build
```

Produces a native installer for the current platform.

> Frontend: Vite + React + Tailwind v4 under `src/`; Tauri shell under
> `src-tauri/`.
