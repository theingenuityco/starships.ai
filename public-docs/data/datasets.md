---
title: Starship Datasets (Tabular Data)
slug: data/datasets
category: data
---

## What are datasets?

Starship datasets are **starship-scoped tables** (schema + rows) that both **humans and agents** can read/write.

- **Schema**: `columns` (JSON) stored on the dataset
- **Rows**: JSON objects (`Record<string, unknown>`) stored per row
- **Primary key** (optional): `primaryKey` enables safe **upsert** semantics and stable **row references**

## Where this is implemented (source of truth)

If you need to confirm behavior, these files define the canonical shapes and rules:

- **Protocol types (API shapes)**: `packages/protocol/src/domains/dataset.ts`
- **HTTP API + validation/coercion**: `packages/server/src/routes/datasets.ts`
- **Formula + reference hydration**: `packages/server/src/services/DatasetRowProjector.ts`
- **DB tables**: `packages/models/src/migrations/143_add_starship_datasets.ts`
- **Entities**: `packages/models/src/entities/StarshipDatasetEntity.ts`, `packages/models/src/entities/StarshipDatasetRowEntity.ts`

## Documentation map (recommended reading order)

- **1) Schema & column types**: [Datasets schema](./datasets/schema.md)
- **2) Writing & reading rows**: [Rows, coercion, and upserts](./datasets/rows.md)
- **3) HTTP API**: [Datasets API](./datasets/api.md)
- **4) Agent/Autopilot usage**: [Connector actions & tools](./datasets/connector-actions.md)
- **5) UI & Views**: [Product UI + Views integration](./datasets/ui-and-views.md)
- **6) Debugging**: [Troubleshooting & gotchas](./datasets/troubleshooting.md)

## Quickstart (mental model)

1. **Create a dataset** with a `columns` array.
2. Optionally set **`primaryKey`** to a column name:
   - Enables `mode: "upsert"` in `rows:upsert`
   - Populates / relies on `row_key` in the DB (`starship_dataset_rows.row_key`)
3. **Append or upsert rows** as plain JSON objects keyed by column `name`.
4. **List rows** and optionally request **reference label hydration** via `expand=refs`.

## Glossary

- **datasetIdOrSlug**: Most endpoints accept either a dataset **id** or its **slug**.
- **rowKey / row_key**: A stable row identifier derived from the dataset `primaryKey` value.
- **projected rows**: Returned rows may include **computed formula columns** and (optionally) hydrated reference labels.
