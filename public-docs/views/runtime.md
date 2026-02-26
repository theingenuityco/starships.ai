---
title: Views Runtime (Bindings, Handlers, Streaming)
slug: views/runtime
category: views
---

# Views Runtime

Dynamic Views are rendered from a widget tree (`ViewModel.root`) plus a runtime layer that provides **data**, **state**, and **interactivity**.

## Key idea

Each widget node stores:

- `props`: persisted JSON props
- optional `bindings`: deterministic overrides that compute values at render time
- optional `handlers`: event handlers that dispatch actions (directly or via sandboxed JS)

## Bindings

Bindings live on a widget node at `node.bindings` and are keyed by a **dot-path into props** (e.g. `"title"`, `"data.rows"`). At render time, bindings deterministically override props.

Supported binding specs:

- `{ "kind": "state", "path": "some.path" }`
  - Reads from the view runtime state.
- `{ "kind": "query", "queryId": "myQuery", "path": "optional.subpath" }`
  - Reads from a query result. If `path` is omitted, binds the whole query `data`.
- `{ "kind": "expr", "expr": "..." }`
  - Reserved for a future safe-expression engine. (Not evaluated by the current client renderer.)

### Prop resolution order (important)

When the view runtime renders a node, the effective props are computed in this order:

1. Start from persisted `node.props`
2. Apply ephemeral per-instance prop patches from runtime state at `state._props.<nodeId>` (shallow merge)
3. Apply `node.bindings` as deterministic overrides (each binding writes into the props object at its binding key)

This means bindings *win* over `patch_props`, and `patch_props` wins over raw persisted props.

## Queries (`runtimeConfig.queries`)

Views can define queries under `view.runtimeConfig.queries`.

### HTTP queries (client-supported)

The current client runtime executes `kind: "http"` queries on mount (best-effort) if:

- `url` starts with `/` (same-origin)
- optional `method` is `"GET"` or `"POST"`
- optional `bodyTemplate` is provided for POST

Results are stored at `runtime.queries[queryId].data` and can be read by query bindings.

#### Parameterizing HTTP queries (v1.1)

HTTP query specs can include simple string templates that read from runtime state:

- `url`: `"/api/v1/things?owner={{state.user.id}}"`
- `bodyTemplate`: `{ "table": "{{state.selectedTable}}" }`

Templates are applied when a query is executed via the `run_query` runtime action (see below).

### Connector action queries (not client-executed yet)

The protocol supports `kind: "connector_action"` query specs, but the current client query runner only executes `kind: "http"` queries.

#### Running connector_action queries (v1.1)

The client can execute `connector_action` queries by emitting a `run_query` runtime action. The host will call:

- `POST /api/v1/views/:id/queries/:queryId/run`

and store the result into `runtime.queries[queryId].data`.

Note: connector_action execution requires the server to be configured with a remote runner (`RUNNER_URL`).

## Handlers (events)

Handlers live on a widget node at `node.handlers`, keyed by event name. Example: `handlers.click` on a `Button` node.

Handler spec options:

- `{ "kind": "actions", "actions": [ ... ] }`
- `{ "kind": "script", "scriptId": "main", "entrypoint": "optionalFnName" }`

Scripts are provided via `view.runtimeConfig.scripts` and are executed in a sandbox (client-side) with a short timeout.

### Which events are currently wired (v1)

The client runtime currently auto-wires only these events:

- `Button` node
  - event: `click`
  - only wired if `node.handlers.click` exists
  - payload: `undefined`
- `Input`, `Textarea`, `Select`
  - event: `change`
  - only wired if `node.handlers.change` exists
  - payload: `{ "value": "..." }`
- `Checkbox`, `Switch`
  - event: `change`
  - only wired if `node.handlers.change` exists
  - payload: `{ "checked": true }`
- `DataTable`
  - event: `row_click`
  - only wired if `node.handlers.row_click` exists
  - payload: `{ "row": { ... }, "rowIndex": 0 }`

If a widget type lists events in the widget catalog but the runtime renderer does not wire it, the handler will never fire until wiring is added to the runtime renderer.

### Script sandbox contract (important for agents)

`runtimeConfig.scripts` is a map of script id → source:

```json
{
  "runtimeConfig": {
    "scripts": {
      "sync_input": { "language": "javascript", "source": "/* see below */" }
    }
  }
}
```

The script `source` is executed as **CommonJS-like** module code that receives an `exports` object. Your script should attach functions to `exports`, for example:

```js
exports.onChange = function (ctx, event) {
  // ctx methods push ops; ops are returned to the host and then dispatched.
};
```

At runtime, the sandbox calls:

- `handler(ctx, event)` where:
  - `ctx` has methods:
    - `getState(path)` → reads the current runtime state (dot-path)
    - `setState(path, value, persist?)` → emits a `set_state` action
    - `runWorkflow(workflowSlug, args?)` → emits a `run_workflow` action
        - `runQuery(queryId)` → emits a `run_query` action (executes HTTP or connector_action queries)
    - `patchProps(instanceId, patch)` → emits a `patch_props` action
    - `patchRoot(patchOps)` → emits a `patch_root` action (RFC6902 JSON Patch ops)
    - `log(...)` → currently a no-op
  - `event` is:
    - `{ name, payload, instanceId }`
- script selection:
  - `entrypoint` selects `exports[entrypoint]`
  - if missing, uses `exports.default`
- timeout:
  - the host enforces a short timeout (currently ~1500ms)

Scripts should be **pure and fast**: emit actions via `ctx.*` and do not block.

## Runtime actions (`POST /api/v1/views/:id/actions`)

Views can dispatch actions locally (state/props) and/or via the server:

- `set_state`: updates runtime state at a path
- `patch_props`: merges a patch object into `_props.<instanceId>` (ephemeral per-instance prop overrides)
- `patch_root`: server-published JSON patch ops applied to the view root tree
- `run_workflow`: runs an Autopilot workflow/tool and streams `ui_action` side-effects into the view stream
- `run_query`: executes a query and stores results into `runtime.queries[queryId].data` (host-handled)

### Local vs server actions (current client behavior)

In the current client runtime:

- `set_state` is applied locally to the runtime store.
  - Note: the `persist` flag is accepted by the protocol but is not persisted by the current client implementation.
- `patch_props` is applied locally by merging into `state._props.<instanceId>`.
- `run_query` is handled by the host:
  - `http` queries run on the client (same-origin only)
  - `connector_action` queries run on the server via `POST /api/v1/views/:id/queries/:queryId/run`
- `run_workflow` and `patch_root` are forwarded to `POST /api/v1/views/:id/actions` (server-handled).

## Streaming (`GET /api/v1/views/:id/stream`)

The server streams SSE events:

- `snapshot`: initial snapshot (includes `root`)
- `patch`: root patch operations
- `state`: state patch operations
- `toast`: user-facing toasts
- `error`: runtime errors

## Examples

### Binding a prop to state

```json
{
  "id": "title",
  "type": "Text",
  "props": { "as": "h2", "text": "Loading..." },
  "bindings": {
    "text": { "kind": "state", "path": "ui.title" }
  }
}
```

### Button click → run a workflow (actions handler)

```json
{
  "id": "cta",
  "type": "Button",
  "props": { "label": "Run" },
  "handlers": {
    "click": {
      "kind": "actions",
      "actions": [
        { "type": "run_workflow", "workflowSlug": "my-workflow", "args": { "source": "view" } }
      ]
    }
  }
}
```

### Input change → keep it controlled (script handler + patch_props)

Views can keep form widgets controlled by patching the instance’s props at runtime.

Widget node:

```json
{
  "id": "name",
  "type": "Input",
  "props": { "label": "Name", "value": "" },
  "handlers": {
    "change": { "kind": "script", "scriptId": "sync_input", "entrypoint": "onChange" }
  }
}
```

Script source (`runtimeConfig.scripts.sync_input.source`):

```js
exports.onChange = function (ctx, event) {
  // event.payload is { value: "..." } for Input/Textarea/Select
  var v = event && event.payload ? event.payload.value : '';
  ctx.patchProps(event.instanceId, { value: String(v || '') });

  // Optionally mirror into runtime state for bindings elsewhere
  ctx.setState('form.name', String(v || ''));
};
```
