---
title: Rows, Coercion, and Upserts
slug: data/databases/rows
category: data
---

## Row storage model

At the protocol/API level:

- A listed row is a plain JSON object: `Record<string, unknown>`, keyed by column `name`.

In the database:

- Each row is a record in the physical table `db_<starshipId>.<physical_table>`.
- Your author columns are stored as typed Postgres columns.
- Hidden bookkeeping columns are maintained by the app:
  - `__id` (text, primary key): app-generated surrogate key
  - `__row_key` (text, optional, `UNIQUE` when a `primaryKey` is set): mirrors the `primaryKey` value
  - `__created_at` / `__updated_at` (timestamptz)

## Listing rows

When you list rows, the server reads from the physical table and returns row objects keyed by column `name`. Rows are always ordered newest-first (`__created_at` desc); there is no sort parameter.

Reference columns are **reconstructed** into reference objects on read (see below). Listing does not hydrate human labels; use the [`refs:resolve` endpoint](./api.md#batch-resolve-references) when you need labels.

## Writing rows: `append` vs `upsert`

Rows are written via:

- `POST /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows:upsert`

Body:

```json
{ "mode": "append", "rows": [{ "id": "1", "status": "todo" }] }
```

### `mode: "append"` (default)

- Always inserts new row records.
- If the Table has a `primaryKey` and a row contains a non-empty value for that key, the server also stores `__row_key`.
- Because the database enforces `UNIQUE(__row_key)`, appending rows with a duplicate primary key value can fail with a uniqueness violation. If you want "insert or update" behavior for a primary key, use `mode: "upsert"`.
- For an `autoincrement` primary key, omit the field and the database allocates it.
- If a row fails validation, it is **skipped** and added to `errors[]` (other rows may still be written).

### `mode: "upsert"`

- Requires the Table to have `primaryKey` set.
- Requires each row to include a non-empty value for that primary key field.
- Writes are applied by `__row_key` (`INSERT ... ON CONFLICT`):
  - Existing row with the same key is updated.
  - Otherwise a new row is inserted.
- Rows that fail validation are **skipped** and added to `errors[]`.

## Coercion & validation rules (server-enforced)

Validation happens per row, per column, before the typed insert. The physical table is the ultimate enforcer (NOT NULL / CHECK / type), but the server coerces JSON strings to typed values and surfaces friendly per-row errors first.

- **Defaults**: if a column has `constraints.default` and the field is missing, the server writes the default
- **Required**: `constraints.required` rejects `null`, `undefined`, and empty strings
- **Nullable**: `constraints.nullable` controls whether explicit `null` is allowed

Type-specific behavior:

- **`string`** (also the default when `type` is omitted):
  - stored as `String(value)`
  - `minLength`, `maxLength`, `pattern` are enforced when provided
- **`number`**:
  - accepts numbers and numeric strings (e.g. `"42"` -> `42`)
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
  - accepts a reference object (see below) or a bare string key; stored as the soft text key
- **`json`**:
  - accepted as-is (no coercion)

## Reference values in rows

On **write**, a reference column accepts either a bare string key or a reference object. The server extracts and stores only the soft text key:

- For `table_row`: the target row's `primaryKey` value (the object's `key`)
- For `task_card`: the card id (the object's `cardId`)

On **read**, stored keys are reconstructed into reference objects using the column's configured target.

### Table-row reference

```json
{ "kind": "table_row", "tableIdOrSlug": "accounts", "key": "acct_123" }
```

### Task card reference

```json
{ "kind": "task_card", "cardId": "TASK_CARD_ID" }
```

To attach human-readable labels (e.g. "Acme Inc." for `acct_123`), call the [batch resolve endpoint](./api.md#batch-resolve-references) rather than expecting labels inline in row listings.

## Row-level error reporting

Row writes return counts and optional row-level errors:

```json
{
  "success": true,
  "data": {
    "inserted": 10,
    "updated": 2,
    "errors": [
      { "index": 3, "column": "createdAt", "code": "TYPE", "message": "Expected ISO8601 datetime with offset or Z" }
    ]
  }
}
```

Notes:

- `index` refers to the position of the row in the submitted `rows` array.
- When `errors` is present, the operation is typically **partially successful** (some rows written, some rejected).

## Deleting a row

- `DELETE /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows/:rowKey`

Deletes a single row by its `__row_key` (the primary key value). Returns `204` on success, `404` if no row matches.
