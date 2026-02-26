---
title: Views Runtime (Bindings, Handlers, Streaming)
slug: views/runtime
category: views
---

# Views Runtime

Dynamic Views are rendered from a widget tree (`ViewModel.root`) plus a runtime layer that provides **data**, **state**, and **interactivity**.

## Bindings

Bindings live on a widget node at `node.bindings` and are keyed by a **dot-path into props** (e.g. `"title"`, `"data.rows"`). At render time, bindings deterministically override props.

Supported binding specs:

- `{ "kind": "state", "path": "some.path" }`
  - Reads from the view runtime state.
- `{ "kind": "query", "queryId": "myQuery", "path": "optional.subpath" }`
  - Reads from a query result. If `path` is omitted, binds the whole query `data`.
- `{ "kind": "expr", "expr": "..." }`
  - Reserved for a future safe-expression engine. (Not evaluated by the current client renderer.)

## Queries (`runtimeConfig.queries`)

Views can define queries under `view.runtimeConfig.queries`.

### HTTP queries (client-supported)

The current client runtime executes `kind: "http"` queries on mount (best-effort) if:

- `url` starts with `/` (same-origin)
- optional `method` is `"GET"` or `"POST"`
- optional `bodyTemplate` is provided for POST

### Connector action queries (not client-executed yet)

The protocol supports `kind: "connector_action"` query specs, but the current client query runner only executes `kind: "http"` queries.

## Handlers (events)

Handlers live on a widget node at `node.handlers`, keyed by event name. Example: `handlers.click` on a `Button` node.

Handler spec options:

- `{ "kind": "actions", "actions": [ ... ] }`
- `{ "kind": "script", "scriptId": "main", "entrypoint": "optionalFnName" }`

Scripts are provided via `view.runtimeConfig.scripts` and are executed in a sandbox (client-side) with a short timeout.

## Runtime actions (`POST /api/v1/views/:id/actions`)

Views can dispatch actions locally (state/props) and/or via the server:

- `set_state`: updates runtime state at a path
- `patch_props`: merges a patch object into `_props.<instanceId>` (ephemeral per-instance prop overrides)
- `patch_root`: server-published JSON patch ops applied to the view root tree
- `run_workflow`: runs an Autopilot workflow/tool and streams `ui_action` side-effects into the view stream

## Streaming (`GET /api/v1/views/:id/stream`)

The server streams SSE events:

- `snapshot`: initial snapshot (includes `root`)
- `patch`: root patch operations
- `state`: state patch operations
- `toast`: user-facing toasts
- `error`: runtime errors
