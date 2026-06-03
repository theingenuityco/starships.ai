---
title: UI + Views Integration
slug: data/databases/ui-and-views
category: data
---

## Product UI

In the starships.ai web app, a starship's Database and its Tables are shown under the **Database** section:

- **List + create Tables**: `/ship/:slug/database`
- **Table viewer**: `/ship/:slug/database/:tableId`

The viewer renders a `DataTable` using the server response shape:

- `columns`: the Table schema
- `data`: the rows array
- `pagination`: paging info

## Editing schema in the UI

The UI allows editing:

- `columns` (including `enum` and `reference` configs)
- `primaryKey` (must match an existing column name)

Constraints notes:

- The UI disables `constraints.unique` for non-primaryKey columns because the server currently only supports uniqueness on the `primaryKey` column.
- Destructive schema changes (changing a column's logical type, toggling autoincrement) are rejected by the server. The UI surfaces these as errors. To make such a change, add a new column or create a new Table and migrate the data.

## Pinning a Table in a room

Tables are one of the resource kinds a room can pin (alongside `view`, `task_board`, and `doc`). Use the room pin connector actions (`pin-room-table`, `unpin-room-table`, `get-room-pins-tables`, `reorder-room-pins-tables`) or the room pins API to surface a Table inside a room.

## Views integration (showing a Table in a View)

If you want to show a Table inside a View, the most straightforward approach is:

- Create a view query of kind `http` that calls the Table rows endpoint:
  - `GET /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows?limit=...&offset=...`
- Bind a `DataTable` widget's `columns` and `data` to the query result.

For richer, computed, or joined reads, use the read-only [SQL surface](./sql.md) (`POST .../database/sql`) instead of paging the rows endpoint.

Because these endpoints are starship-scoped and require auth, prefer the platform's connector/query mechanisms that can inject auth rather than hardcoding JWTs in a view.

See also:

- `public-docs/views/runtime.md`
- `public-docs/widgets/data/data-table.md`
