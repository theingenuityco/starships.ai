---
title: Rows, Coercion, and Upserts
slug: data/datasets/rows
category: data
---

## Row storage model

At the protocol/API level:

- A listed row is a plain JSON object: `Record<string, unknown>`, keyed by column `name`.

In the DB:

- Each stored row is a record in `starship_dataset_rows`:
  - `data_json` (JSONB): the row object
  - `row_key` (TEXT, optional): derived from the dataset `primaryKey` value when present

## Listing rows (projection)

When you list rows, the server projects each `data_json` row through a projector that can:

- **Compute formula columns** and include them in the returned row object
- Optionally **hydrate reference labels** when `expand=refs` is provided

This means the returned `data[]` may contain fields that are not persisted (formula results, reference `label`).

## Writing rows: `append` vs `upsert`

Rows are written via:

- `POST /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert`

Body:

```json
{ "mode": "append", "rows": [{ "id": "1", "status": "todo" }] }
```

### `mode: "append"` (default)

- Always inserts new row records.
- If the dataset has a `primaryKey` and a row contains a non-empty value for that key, the server also stores `row_key`.
- If a row fails validation, it is **skipped** and added to `errors[]` (other rows may still be written).

### `mode: "upsert"`

- Requires the dataset to have `primaryKey` set.
- Requires each row to include a non-empty value for that primary key field.
- Writes are applied by `row_key`:
  - Existing row with the same `row_key` is updated.
  - Otherwise a new row is inserted.
- Rows that fail validation are **skipped** and added to `errors[]`.

## Coercion & validation rules (server-enforced)

Validation happens per row, per column:

- **`type: "formula"`**: ignored on write (any provided field is removed)
- **Defaults**: if a column has `constraints.default` and the field is missing, the server writes the default
- **Required**: `constraints.required` rejects `null`, `undefined`, and empty strings
- **Nullable**: `constraints.nullable` controls whether `null` is allowed

Type-specific behavior:

- **`string`**:
  - stored as `String(value)`
  - `minLength`, `maxLength`, `pattern` are enforced when provided
- **`number`**:
  - accepts numbers and numeric strings (e.g. `"42"` → `42`)
  - `min`, `max` enforced when provided
- **`boolean`**:
  - accepts: `true/false`, `"true"/"false"`, `1/0`, `"1"/"0"`, `"yes"/"no"`, `"y"/"n"`
- **`date`**:
  - accepts ISO date or ISO datetime inputs
  - stored as `YYYY-MM-DD`
- **`datetime`**:
  - requires an ISO8601 string with an explicit offset or `Z`
  - stored as canonical ISO `...Z`
- **`enum`**:
  - value must be in `enum.options`
- **`reference`**:
  - must be a reference object (see below)
- **`json`**:
  - accepted as-is (no coercion)

## Reference values stored in rows

Reference column values are stored as JSON objects.

### Dataset row reference

```json
{ "kind": "dataset_row", "datasetIdOrSlug": "accounts", "key": "acct_123" }
```

### Task card reference

```json
{ "kind": "task_card", "cardId": "TASK_CARD_ID" }
```

If you list rows with `expand=refs`, the server may add a non-persisted `label`:

```json
{ "kind": "dataset_row", "datasetIdOrSlug": "accounts", "key": "acct_123", "label": "Acme Inc." }
```

## Row-level error reporting

Row writes return counts and optional row-level errors:

```json
{
  "inserted": 10,
  "updated": 2,
  "errors": [
    { "index": 3, "column": "createdAt", "code": "TYPE", "message": "Expected ISO8601 datetime with offset or Z" }
  ]
}
```

Notes:

- `index` refers to the position of the row in the submitted `rows` array.
- In the presence of `errors`, the operation is typically **partially successful** (some rows written, some rejected).
