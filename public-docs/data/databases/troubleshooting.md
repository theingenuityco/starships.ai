---
title: Troubleshooting & Gotchas
slug: data/databases/troubleshooting
category: data
---

## Common write errors

### `VALIDATION_ERROR: Table primaryKey is required for upsert mode`

Cause:

- You called `rows:upsert` with `mode: "upsert"` on a Table that does not have `primaryKey` set.

Fix:

- Set `primaryKey` on the Table (must match a column name), then retry.

### `REQUIRED: Row is missing primary key field: <primaryKey>`

Cause:

- Upsert mode requires every row to include a non-empty value for the Table `primaryKey` field.

Fix:

- Ensure every row includes a non-empty value for the primaryKey column.

### `TYPE: Expected ISO8601 datetime with offset or Z`

Cause:

- `type: "datetime"` requires a timezone offset or `Z` (e.g. `2026-03-01T12:34:56Z` or `2026-03-01T12:34:56-05:00`).

Fix:

- Provide an ISO instant with `Z` or an offset. Avoid ambiguous local-time strings.

### `ENUM: Value is not in enum options`

Cause:

- The value you wrote is not in `enum.options`.

Fix:

- Update the Table schema (add the option) or write a valid option.

### `SCHEMA: Enum options are not configured` / `SCHEMA`-like errors

Cause:

- Column configuration does not match `type` (e.g. `type: "enum"` without `enum.options`).

Fix:

- Fix the column config (see [Tables schema](./schema.md)).

## Schema change rejected

Changing a column's logical `type` (e.g. `string` to `number`) or toggling `autoincrement` on an existing column is rejected with a `400`. The physical Postgres column already exists with the old type, and these changes are destructive.

Fix:

- Add a new column with the new type and migrate values, or create a new Table.

## Partial success on writes

The server may accept some rows and reject others in the same request.

If you see `errors[]` in the response:

- Use `errors[].index` to map back to the submitted row in your `rows` array.
- Do not assume the whole request was rolled back.

## Uniqueness constraints

`constraints.unique` is currently only supported for the Table `primaryKey` column.

If you mark other columns as `unique`, you should expect a validation error when updating schema.

## Append mode vs primaryKey uniqueness

If a Table has `primaryKey` set, the database enforces `UNIQUE(__row_key)`.

That means:

- `mode: "append"` can fail if you append rows that produce a duplicate `__row_key` (i.e. the same primaryKey value).
- Use `mode: "upsert"` when you want to write by primary key repeatedly.

## Reference resolution expectations

- Row listings return reference values as reference objects (`{ kind, ... , key }`) but do not include human labels.
- To get labels, call `POST .../tables/refs:resolve` (see [API](./api.md#batch-resolve-references)).
- Table-row references only resolve reliably when the target Table has a `primaryKey` (so `__row_key` exists).

## SQL surface returns 503

### `SERVICE_UNAVAILABLE: Agent SQL surface is not enabled on this instance`

Cause:

- The read-only agent role is not configured on this deployment.

Fix (operators):

- Set `POSTGRES_AGENT_PASSWORD` (and optionally `POSTGRES_AGENT_USER`), then bootstrap the login role once with `pnpm --filter @starships/models provision:agent-role`. See [Querying a Database with SQL](./sql.md#enabling-the-sql-surface-operators).

## SQL surface returns generic `Query failed`

Cause:

- Raw Postgres errors are intentionally not returned to callers (they would leak physical schema/table/column names). The detail is logged server-side.

Fix:

- Verify your SQL is a single read-only `SELECT`, references Tables by their `physicalTable` name (unqualified), stays under the 10-second timeout, and binds inputs via `params` (`$1, $2, ...`). See [the SQL page](./sql.md).
