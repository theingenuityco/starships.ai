---
title: Datasets Schema & Columns
slug: data/datasets/schema
category: data
---

## Dataset model

At the protocol/API level, a dataset looks like:

- **`id`**: string
- **`starshipId`**: string
- **`name`**: string (max 200)
- **`slug`**: string (max 100, unique per starship)
- **`description`**: string (max 2000, defaults to `""`)
- **`columns`**: `StarshipDatasetColumn[]` (stored as JSON)
- **`primaryKey`**: `string | null` (optional)
- **`archived`**: boolean
- **`createdAt` / `updatedAt`**: ISO8601 strings

DB storage is:

- **Datasets table**: `starship_datasets`
  - `columns_json` (JSONB)
  - `primary_key` (VARCHAR(100), nullable)
- **Rows table**: `starship_dataset_rows`
  - `data_json` (JSONB)
  - `row_key` (TEXT, nullable; `UNIQUE(dataset_id, row_key)`)

## Column model (`StarshipDatasetColumn`)

Each column is an object with:

```json
{
  "name": "status",
  "description": "Current workflow stage",
  "type": "enum",
  "format": "text",
  "constraints": { "required": true },
  "enum": { "options": ["todo", "doing", "done"] }
}
```

### Required fields

- **`name`**: required
  - Must match `^[a-zA-Z0-9_]+$`
  - Max length: 100
  - Must be unique within `columns`

All other fields are optional, but some become required depending on `type` (see below).

## Column types (`column.type`)

Supported types:

- `string`
- `number`
- `boolean`
- `date` (stored as ISO date-only `YYYY-MM-DD`)
- `datetime` (stored as ISO instant; requires `Z` or an offset, canonicalized to `...Z`)
- `json` (any JSON value accepted)
- `enum` (single-select string)
- `reference` (relation to a dataset row or task card)
- `formula` (computed on read)

## Column formats (`column.format`)

Formats are primarily display hints for UI/export:

- `text`
- `number`
- `currency`
- `date`
- `datetime`
- `percentage`

## Constraints (`column.constraints`)

Supported constraint keys:

- `required?: boolean`
- `nullable?: boolean`
- `unique?: boolean`
- `default?: unknown`
- `min?: number`, `max?: number`
- `minLength?: number`, `maxLength?: number`
- `pattern?: string` (JS regex string)

Important server rule:

- **`constraints.unique` is currently only supported for the dataset `primaryKey` column.**

## Enum columns

For `type: "enum"`, `enum.options` is required:

```json
{
  "name": "status",
  "type": "enum",
  "enum": { "options": ["todo", "doing", "done"] }
}
```

Writes are validated so the stored value must be one of the configured `options`.

## Reference columns

For `type: "reference"`, `reference.target` is required:

### Reference to a task card

```json
{
  "name": "task",
  "type": "reference",
  "reference": { "target": { "kind": "task_card" } }
}
```

### Reference to a row in another dataset

```json
{
  "name": "account",
  "type": "reference",
  "reference": {
    "target": { "kind": "dataset_row", "datasetIdOrSlug": "accounts" },
    "labelColumn": "name"
  }
}
```

Notes:

- `datasetIdOrSlug` may be a dataset id or a slug.
- Reference hydration uses the **target dataset’s primaryKey** (i.e., it resolves by `row_key`).

## Formula columns

For `type: "formula"`, `formula.expr` is required:

```json
{
  "name": "total",
  "type": "formula",
  "formula": { "expr": "round(price * qty, 2)", "resultType": "number" }
}
```

Semantics:

- Formulas are **computed on read** (during row listing).
- Writes **ignore** any provided value for a formula column (the server drops it).
- If evaluation fails, the value returned is `null`.

Supported operators:

- `+ - * /` with parentheses

Supported functions:

- `coalesce(a,b,...)`
- `round(x, digits)`
- `nowEpochMs()`
- `toEpochMs(datetimeIso)`
- `daysBetween(a,b)`
- `lookupDataset(datasetIdOrSlug, key, fieldName)`
- `lookupTask(cardId, fieldName)`

## `primaryKey`

`primaryKey` (when set) must match an existing column name.

What it enables:

- `POST .../rows:upsert` with `mode: "upsert"`
- Stable `row_key` storage (`starship_dataset_rows.row_key`) and `UNIQUE(dataset_id, row_key)`
- Dataset-row reference hydration (and formula `lookupDataset`) to work predictably
