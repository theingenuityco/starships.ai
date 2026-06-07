# Toolsets

How the in-house runtime's tools are structured, and how user-authored and MCP tools plug in.

## Model

- A **tool** is metadata (`ToolDescriptor`) plus behaviour owned by its **toolset provider**.
- Tools are namespaced `<toolset>.<tool>`, e.g. `system.bash`. The built-in tools are the
  `system` toolset.
- The runtime never special-cases a tool's origin. It talks to a `ToolRegistry`; the registry
  talks to providers. Adding a new source of tools = adding a provider, nothing else.

```
runtime ──> ToolRegistry ──> ToolsetProvider (system | mcp | bundle)
```

### Core types (`src/tools/types.ts`)

- `ToolDescriptor` — `fqn`, `name`, `toolset`, `description`, `schema`, `sensitive`,
  `capabilities`, `residency`. Pure metadata, no behaviour.
- `ToolSchema` — `{ kind: 'zod' }` (in-process TS tools) or `{ kind: 'json' }` (mcp / bundles).
  JSON Schema is canonical for non-TS sources; Zod is a convenience for built-ins.
- `ToolsetProvider` — `init()` (enumerate / connect), `execute()` (validate + run one tool),
  `dispose?()` (tear down long-lived resources like MCP connections).

### Registry (`src/tools/registry.ts`)

Owns namespacing, the **wire-name encoding**, the SDK tool map, search, catalog, and allowlist
matching.

- **Wire names.** Anthropic/OpenAI require tool names match `^[a-zA-Z0-9_-]+$`, so `.` is
  illegal on the wire. The dotted fqn `system.bash` is encoded to `system__bash` for the model
  (the same reason MCP uses `server__tool`). Config and the UI use the dotted form; the runtime
  decodes incoming calls back to the fqn before gating.
- **Allowlist matching** (`isAllowed`): `*` (all), exact fqn, `system.*` (whole toolset), and a
  legacy bare name (`bash`) for back-compat with pre-namespace allowlists.

## Deferred tools

Most tools (user bundles, MCP servers) can be numerous. Putting every schema in the model's tool
list would fill the context window. So:

- `resident` tools are always in the model's tool list. `system.*` is resident.
- `deferred` tools appear only in a cheap **catalog** (name + description) injected into the
  system prompt. Their schemas are loaded on demand when the model calls `system.tool_search`
  (keyword query, or `select:<fqn>,<fqn>`). Loaded tools become callable on the next step.
- Enforced by construction: the AI SDK only lets the model call tools in the current tool map,
  so "search before you can call" needs no reject-and-retry.

Tradeoff: changing the tool map mid-run invalidates the prompt cache from the tools block on.
Net positive once the catalog is large; keep the resident set stable and batch search results.

## Providers

| Provider | source | `init()` | `execute()` | lifecycle | file |
|----------|--------|----------|-------------|-----------|------|
| `system` | `system` | static list | in-process fn (Zod-validated) | none | `src/tools/system/` |
| `mcp` | `mcp` | connect + `tools/list` | `tools/call` (JSON-RPC) | long-lived; `dispose` closes | `src/tools/mcp/provider.ts` |
| `bundle` (process) | `user` | parse `toolset.json` | one-shot subprocess, JSON over stdio | none | `src/tools/bundle/provider.ts` |
| `bundle` (node) | `user` | import entry module | in-process call | none | `src/tools/bundle/provider.ts` |

`system` is the 5 built-ins (`bash`, `read_file`, `write_file`, `list_dir`, `http_fetch`) plus
the meta-tool `tool_search`. MCP servers and bundles are selected per run via
`RunRequest.mcpServers` / `RunRequest.bundles` (the desktop sets these per persona). A provider
that fails to load is skipped with a warning, not fatal to the run.

### Authoring a bundle

A bundle is a local directory with a `toolset.json`:

```jsonc
{
  "name": "acme",
  "version": "0.1.0",
  "runtime": "process",            // "process" (default) | "node"
  "tools": [
    {
      "name": "shout",
      "description": "Uppercase a message.",
      "input": { "type": "object", "properties": { "msg": { "type": "string" } } },
      "sensitive": false,
      "capabilities": ["exec"],
      "run": { "command": ["./tools/shout.sh"] }   // process runtime
    }
  ]
}
```

Process tools get the validated input as JSON on **stdin**, `STARSHIP_WORKSPACE` in env, and run
as a subprocess scoped to the workspace (provider keys scrubbed). stdout is the result; nonzero
exit is an error. For `"runtime": "node"`, set `"entry": "index.js"` (a compiled module exporting
handlers by tool name, or a `tools` map) and drop `run.command`; handlers run in-process with
`(input, ctx)`.

### Exposing toolsets via MCP (the inverse direction)

`createToolsetMcpServer(registry, getCtx)` serves the registry as an MCP server. The
`starship-toolsets` bin runs it over stdio so any MCP client can consume Starship's tools:

```jsonc
{ "command": "starship-toolsets", "args": ["--workspace", "/path/to/repo"] }
```

Set `STARSHIP_BUNDLES='{"acme":"/abs/bundle/dir"}'` to also expose user bundles. Deferral does
not apply on this side (the consuming runtime owns its own context budget); `tool_search` is
omitted.

## Roadmap

- **Phase 0 (done).** Registry + provider seam, `system` toolset, deferred model + catalog +
  `tool_search`, wire-name encoding, allowlist back-compat.
- **Phase 1 (done).** `mcp` provider (stdio + Streamable HTTP / SSE) and user `bundle` process
  provider, both deferred by default. `RunRequest.mcpServers` / `RunRequest.bundles` select them;
  the desktop forwards them per persona. MCP `readOnlyHint` maps to `sensitive`.
- **Phase 2 (partial).** `bundle` node in-process adapter (done). Still open: HTTP MCP auth
  (OAuth), cached-catalog lazy connect, MCP resources/prompts, semantic search.
- **Phase 3 (done).** `createToolsetMcpServer` + the `starship-toolsets` stdio bin expose the
  registry as an MCP server for external runtimes.

## Notes / not-yet

- Capabilities are **declared, not enforced.** They surface at approval time; real sandboxing
  (the engineering-room sandbox is the natural host) is later. User bundles run as a subprocess
  scoped to the workspace with provider keys scrubbed, gated by approvals — not a sandbox.
