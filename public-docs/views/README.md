## Views Reference

A **View** is a persisted, starship-scoped UI page defined as a **widget tree** plus optional runtime configuration.

Views are rendered in the product via:

- `DynamicViewRenderer` (client) → renders the view root (initial snapshot, then streamed patches) using `WidgetTreeRenderer`
- `GET /api/v1/views/:id/stream` (server) → streams runtime events over SSE (snapshot + patches/toasts/errors)

## Data model (conceptual)

At a high level, a view is:

- `id`, `name`, `slug`, `description`
- `root`: a `WidgetInstanceNode` tree
- `runtimeConfig`: runtime scripts/queries/permissions
- `version`, `starshipId`, timestamps

### Widget tree nodes

Each node in `root` has:

- `id`: string
- `type`: widget type key (must exist in the client widget registry)
- `props`: raw props (JSON)
- Optional: `children[]`, `bindings`, `handlers`, `permissions`

Minimal example:

```json
{
  "id": "root",
  "type": "Box",
  "props": { "className": "p-6" },
  "children": [
    { "id": "title", "type": "Text", "props": { "as": "h2", "text": "Revenue", "className": "text-xl font-semibold" } },
    { "id": "chart", "type": "BarChart", "props": { "title": "Revenue by month", "indexKey": "month", "series": [], "data": [] } }
  ]
}
```

## Runtime features

Views support:

- **Bindings**: deterministic prop overrides (e.g. bind `props.title` to `state.title` or a query result)
- **Handlers**: event handlers (e.g. `Button` `click`) that can run scripts or action lists
- **Runtime actions**: state/props/root patching and workflow execution
- **Streaming**: server publishes patches/toasts/errors that the client applies live

See:
- Runtime + bindings + handlers: `./runtime.md`
- HTTP API + connector actions: `./api-and-connector-actions.md`

## Breaking changes (historical)

- Legacy view `layout` was replaced by the tree-based `root` model.
- Legacy view widget-attachment actions were removed in favor of editing the `root` tree directly.
