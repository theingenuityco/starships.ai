---
title: Troubleshooting & Gotchas
slug: data/datasets/troubleshooting
category: data
---

## Common write errors

### `VALIDATION_ERROR: Dataset primaryKey is required for upsert mode`

Cause:

- You called `rows:upsert` with `mode: "upsert"` on a dataset that does not have `primaryKey` set.

Fix:

- Set `primaryKey` on the dataset (must match a column name), then retry.

### `REQUIRED: Row is missing primary key field: <primaryKey>`

Cause:

- Upsert mode requires every row to include a non-empty value for the dataset `primaryKey` field.

Fix:

- Ensure every row includes a non-empty value for the primaryKey column.

### `TYPE: Expected ISO8601 datetime with offset or Z`

Cause:

- `type: "datetime"` requires a timezone offset or `Z` (e.g. `2026-03-01T12:34:56Z` or `2026-03-01T12:34:56-05:00`).

Fix:

- Provide an ISO instant with `Z` or an offset. Avoid ambiguous local-time strings.

### `ENUM: Value is not in enum options`

Cause:

- The value you wrote isn’t in `enum.options`.

Fix:

- Update the dataset schema (add the option) or write a valid option.

### `SCHEMA: Enum options are not configured` / `SCHEMA`-like errors

Cause:

- Column configuration doesn’t match `type` (e.g. `type: "enum"` without `enum.options`).

Fix:

- Fix the column config (see [Datasets schema](./schema.md)).

## Partial success on writes

The server may accept some rows and reject others in the same request.

If you see `errors[]` in the response:

- Use `errors[].index` to map back to the submitted row in your `rows` array.
- Do not assume the whole request was rolled back.

## Uniqueness constraints

`constraints.unique` is currently only supported for the dataset `primaryKey` column.

If you mark other columns as `unique`, you should expect a validation error when updating schema.

## Formula gotchas

- Formula columns are **computed on read**, not stored.
- If a formula fails to evaluate for a row, the returned value is `null`.
- Writes silently drop any provided value for a formula column.

## Reference hydration expectations

- `expand=refs` adds `label` fields to reference objects in listed rows.
- Dataset-row references only hydrate reliably when the target dataset has a `primaryKey` (so `row_key` exists).
