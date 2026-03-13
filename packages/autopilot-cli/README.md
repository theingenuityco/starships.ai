# `@starships/autopilot-cli`

Run Starships Autopilot **export bundles** locally in your terminal.

This package is intentionally **standalone**: it depends on `@starships/autopilot` and `@starships/protocol` only (no Starships client/server code).

## What it runs

The CLI consumes Starships export `.zip`s produced by the API server:

- **Agent bundle**: `GET /agents/:id/export-bundle` (zip: `manifest.json`, `agents/*.json`, `tools/*.json`)
- **Room bundle**: `GET /rooms/:roomId/export-bundle` (zip adds `rooms/`, `views/`, `datasets/`, `task-boards/`)

The zip entries are `ImportExportContainerV1` JSON containers (schemaVersion `1`).

## Install / build (monorepo)

From repo root:

```bash
pnpm --filter @starships/autopilot-cli run build
```

## Usage

### Inspect a bundle

```bash
node packages/autopilot-cli/dist/cli.js inspect path/to/bundle.zip
```

### Run an agent from a bundle

```bash
OPENROUTER_API_KEY=... node packages/autopilot-cli/dist/cli.js run path/to/bundle.zip --agent my-agent-slug
```

If the bundle contains only one agent, `--agent` is optional.

### One-shot input

```bash
OPENROUTER_API_KEY=... node packages/autopilot-cli/dist/cli.js run path/to/bundle.zip --agent my-agent-slug --input "Hello"
```

## Environment variables

- `OPENROUTER_API_KEY`: required to execute `llm` nodes (OpenRouter-compatible OpenAI API).
- `OPENROUTER_BASE_URL`: optional (default `https://openrouter.ai/api/v1`).

## Tool permissions

- `allow`: tool executes automatically
- `ask`: CLI prompts in the terminal per tool call (approve/deny)
- `deny`: tool calls are rejected and a tool-result error message is appended

Room bundle `toolAssignments` override the agent’s default tool allowlist.

## Limitations (local mode)

- `connector_action` is **not supported** (no connector templates/sessions are present in exports). Those nodes will fail with a clear error.
- Tool exports intentionally omit tool configuration (which may contain secrets). Tools requiring secrets may not function locally.

