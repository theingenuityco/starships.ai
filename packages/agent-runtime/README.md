# @starships/agent-runtime

An in-house, programmatic agent runtime for the desktop app. It runs the tool-calling loop
itself (Anthropic + OpenAI, via the Vercel AI SDK) instead of shelling out to an external
CLI, and exposes it as a small local HTTP+SSE service.

It emits **Claude-compatible `stream-json`** lines, so the agent-desktop UI renders runs with
its existing parser (`packages/agent-desktop/src/transcript.ts`) unchanged. The same binary
runs locally today and is deployable to the cloud later — it only ever reads API keys from
its environment.

## Layout

| File | Role |
|------|------|
| `src/server.ts` | HTTP+SSE service (Hono). The sidecar entry point. |
| `src/runtime.ts` | The manual agent loop: stream text, gate tool calls on approval, run them, repeat. |
| `src/translate.ts` | Pure builders that produce Claude-compatible `stream-json` lines. |
| `src/tools.ts` | Native tool surface: `bash`, `read_file`, `write_file`, `list_dir`, `http_fetch` (workspace-scoped). |
| `src/provider.ts` | `{provider, model, apiKey}` → a Vercel AI SDK model. |
| `src/sessions.ts` | In-memory thread history keyed by `sessionId` (resume). |
| `src/validate.ts` | Cheap authenticated key check (`/validate`, `/validate-stored`). |

## HTTP API

- `GET  /health` → `{ ok: true }`
- `POST /runs` → SSE stream. Body: `{ provider, model, prompt, sessionId, systemPrompt?, mode?, allow?, workspace?, runId? }`.
  SSE events: `meta` (runId), `line` (a stream-json object), `permission` (a gated tool call), `error`, `done`.
- `POST /runs/:id/approve` → body `{ toolUseId, decision: 'allow'|'allow-session'|'deny' }`.
- `POST /runs/:id/abort`
- `POST /validate` → body `{ provider, apiKey }` → `{ ok, error? }`.
- `GET  /validate-stored?provider=` → validates the key already in the service env.

On boot it prints `RUNTIME_LISTENING {"port":<n>}` to stdout (the parent reads the port).
API keys come from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in the environment.

## Run it standalone

```bash
pnpm --filter @starships/agent-runtime build
PORT=0 ANTHROPIC_API_KEY=sk-ant-... node dist/server.js
curl -N -X POST http://127.0.0.1:<port>/runs -H 'content-type: application/json' \
  -d '{"provider":"anthropic","model":"claude-haiku-4-5-20251001","prompt":"hi","sessionId":"s1"}'
```

## How the desktop uses it

- **Dev:** the Tauri shell (debug build) spawns `node packages/agent-runtime/dist/server.js`,
  injecting the keychain keys as env. Just run the runtime build once (`pnpm --filter
  @starships/agent-runtime build`) and the desktop starts the sidecar lazily on first run.
- The webview talks to the sidecar over `fetch`/SSE; keys never reach the webview.
- API keys live in the OS keychain (managed by the Rust side: `set_secret` / `secret_status`).

## Release packaging (sidecar binary)

`pnpm --filter @starships/agent-runtime bundle` produces:

1. `dist/server.cjs` — a single bundled file runnable with `node dist/server.cjs`.
2. `../agent-desktop/src-tauri/binaries/starship-runtime-<target-triple>` — a standalone
   binary (compiled with [Bun](https://bun.com), if installed).

To ship the binary inside the app, enable Tauri's `externalBin` (it appends the target
triple automatically) and regenerate it as part of the build:

```jsonc
// packages/agent-desktop/src-tauri/tauri.conf.json
"bundle": {
  "externalBin": ["binaries/starship-runtime"]
}
// and set beforeBuildCommand to:
//   "pnpm --filter @starships/agent-runtime build && pnpm --filter @starships/agent-runtime bundle && pnpm build"
```

The Rust side resolves the binary next to the app executable in release builds (and falls
back to `node dist/server.js` in dev). `externalBin` is left disabled by default so dev and
existing builds don't require the binary to be present; flip it on when cutting a release.
Bun is the build-time requirement for the standalone binary.
```
