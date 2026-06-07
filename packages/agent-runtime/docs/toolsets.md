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

| Provider | source | `init()` | `execute()` | lifecycle |
|----------|--------|----------|-------------|-----------|
| `system` | `system` | static list | in-process fn (Zod-validated) | none |
| `mcp` *(Phase 1)* | `mcp` | connect + `tools/list` | `tools/call` (JSON-RPC) | long-lived; `dispose` closes |
| `bundle:process` *(Phase 1)* | `user` | parse `toolset.json` | one-shot subprocess, JSON over stdio | none |
| `bundle:node` *(Phase 2)* | `user` | import module | in-process call | none |

`system` is implemented in `src/tools/system/`. The 5 built-ins (`bash`, `read_file`,
`write_file`, `list_dir`, `http_fetch`) plus the meta-tool `tool_search`.

## Roadmap

- **Phase 0 (done).** Registry + provider seam, `system` toolset, deferred model + catalog +
  `tool_search`, wire-name encoding, allowlist back-compat. Behaviour-equivalent to the old
  flat tool list, with namespaced names.
- **Phase 1.** `mcp` provider (stdio + http) and user `bundle:process` provider, both deferred
  by default. `RunRequest.toolsets` selects them (field already accepted). MCP servers
  configured via the standard `mcpServers` map in local config. MCP tool annotations
  (`readOnlyHint`/`destructiveHint`) map to `sensitive` / `capabilities`.
- **Phase 2.** `bundle:node` in-process adapter + author DX, HTTP MCP auth, cached-catalog lazy
  connect, MCP resources/prompts, semantic search.
- **Phase 3.** Expose the registry *as* an MCP server so external CLI runtimes (claude-code,
  codex) can consume Starship's toolsets.

## Notes / not-yet

- Capabilities are **declared, not enforced.** They surface at approval time; real sandboxing
  (the engineering-room sandbox is the natural host) is later. User bundles run as a subprocess
  scoped to the workspace with provider keys scrubbed, gated by approvals — not a sandbox.
