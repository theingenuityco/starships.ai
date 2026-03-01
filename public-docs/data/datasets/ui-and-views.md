---
title: UI + Views Integration
slug: data/datasets/ui-and-views
category: data
---

## Product UI

In the starships.ai web app, datasets are shown under the **Datasets** section:

- **List + create**: `/ship/:slug/datasets`
- **Viewer**: `/ship/:slug/datasets/:datasetId`

The viewer renders a `DataTable` using the server response shape:

- `columns`: the dataset schema
- `data`: the projected rows array
- `pagination`: paging info

## Editing schema in the UI

The UI allows editing:

- `columns` (including `enum`, `reference`, and `formula` configs)
- `primaryKey` (must match an existing column name)

Constraints notes:

- The UI disables `constraints.unique` for non-primaryKey columns because the server currently only supports uniqueness on the `primaryKey` column.

## Views integration (showing datasets in a View)

If you want to show a dataset inside a View, the most straightforward approach is:

- Create a view query of kind `http` that calls the dataset rows endpoint:
  - `GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows?limit=...&offset=...`
- Bind a `DataTable` widget’s `columns` and `data` to the query result.

Because dataset endpoints are starship-scoped and require auth, prefer using the platform’s connector/query mechanisms that can inject auth rather than hardcoding JWTs in a view.

See also:

- `public-docs/views/runtime.md`
- `public-docs/widgets/data/data-table.md`
