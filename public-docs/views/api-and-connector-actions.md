---
title: Views API and Connector Actions
slug: views/api-and-connector-actions
category: views
---

# Views API and Connector Actions

This page documents the public HTTP API routes and the Starships connector actions related to Views.

## HTTP API (server)

### List/search views

`GET /api/v1/starships/:starshipId/views`

Query params (optional):
- `name` (ILIKE)
- `slug` (exact)
- `limit` (0–200)
- `offset` (0–10,000)

### Get view by id

`GET /api/v1/views/:id`

### Get view by slug

`GET /api/v1/views/slug/:slug?starshipId=...`

### Create view

`POST /api/v1/views`

Body (conceptual):

```json
{
  "starshipId": "starship_123",
  "name": "My View",
  "slug": "optional-slug",
  "description": "",
  "root": { "id": "root", "type": "Box", "props": {}, "children": [] },
  "runtimeConfig": {}
}
```

### Update view

`PUT /api/v1/views/:id`

Body supports partial updates (e.g. `name`, `description`, `root`, `runtimeConfig`, `version`).

### Delete view

`DELETE /api/v1/views/:id`

### Runtime actions

`POST /api/v1/views/:id/actions`

Action union includes: `set_state`, `patch_props`, `patch_root`, `run_workflow`.

### Stream runtime events (SSE)

`GET /api/v1/views/:id/stream`

Requires `Accept: text/event-stream` (or `?stream=true`). Sends an initial `snapshot` event then streams patches/toasts/errors.

## Starships connector actions

When using `connector_action` with the Starships connector (`connector: "starships"`), the following view-related actions exist:

- `search-views`
- `get-view`
- `get-view-by-slug`
- `create-view`
- `update-view`
- `delete-view`
- `attach-view-to-channel` (attach/detach a view to a channel)
- `get-view-widgets` (list persisted view widget nodes)
- `update-view-widget` (upsert/update a single view widget node; props are merged)
- `patch-view-root` (apply RFC6902 JSON Patch ops to the persisted structure-only root)

Notes:
- `create-view` / `update-view` use `{ root, runtimeConfig }` (not legacy `layout`).
- For large views, prefer per-node updates:
  - Use `patch-view-root` to add/move/remove node ids (structure)
  - Use `update-view-widget` to update a single node’s `type/props/bindings/handlers`
