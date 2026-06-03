---
title: Databases HTTP API
slug: data/databases/api
category: data
---

## Auth & access control

All endpoints require:

- JWT authentication
- The authenticated user must have collaborator access to the starship (the hard-delete endpoint requires admin access)

## Response envelope

All server responses use a standard envelope:

```json
{ "success": true, "data": { } }
```

Errors use:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Identifiers: `:tableIdOrSlug`

Most Table endpoints accept `:tableIdOrSlug`, which may be either:

- a Table **id**, or
- a Table **slug**

## Endpoints

### List tables

`GET /api/v1/starships/:starshipId/tables`

Query params:

- `includeArchived` (optional): `true/false` (also accepts `1/0`, `yes/no`, `y/n`)

Response body (`data`):

```json
{
  "success": true,
  "data": {
    "tables": [{ "id": "...", "name": "...", "slug": "...", "columns": [], "primaryKey": null, "physicalTable": "leads", "archived": false }]
  }
}
```

### Create table

`POST /api/v1/starships/:starshipId/tables`

Body:

```json
{
  "name": "Leads",
  "description": "Sales leads",
  "primaryKey": "email",
  "columns": [
    { "name": "email", "type": "string", "description": "Primary contact email" },
    { "name": "status", "type": "enum", "enum": { "options": ["new", "qualified"] } }
  ]
}
```

Creating the first Table also provisions the starship's Database schema (`db_<starshipId>`) and its read-only role.

Response body (`data`), status `201`:

```json
{
  "success": true,
  "data": {
    "table": { "id": "...", "slug": "leads", "columns": [], "primaryKey": "email", "physicalTable": "leads", "archived": false }
  }
}
```

### Get table details

`GET /api/v1/starships/:starshipId/tables/:tableIdOrSlug`

Response body (`data`):

```json
{
  "success": true,
  "data": { "table": { "id": "...", "name": "...", "slug": "...", "columns": [], "physicalTable": "leads" } }
}
```

### Update table

`PATCH /api/v1/starships/:starshipId/tables/:tableIdOrSlug`

Body supports partial updates:

- `name?: string`
- `description?: string`
- `columns?: StarshipTableColumn[]`
- `primaryKey?: string | null`
- `archived?: boolean`

Notes:

- Changing `columns` compiles to `ALTER TABLE`. Additive and metadata changes are allowed; destructive changes (logical type change, autoincrement toggle) are rejected with `400`. See [schema evolution](./schema.md#schema-evolution-patch).
- If you set `primaryKey`, it must match an existing column name.
- `constraints.unique` is currently only supported for the primaryKey column.

Response body (`data`): `{ "table": { ... } }`

### Archive table

`POST /api/v1/starships/:starshipId/tables/:tableIdOrSlug/archive`

Soft-deletes the Table (sets `archived: true`). The physical table is retained. Response body (`data`): `{ "table": { ... } }`.

### Delete table (admin)

`DELETE /api/v1/starships/:starshipId/tables/:tableIdOrSlug`

Hard-deletes the Table: drops the physical Postgres table and removes the registry row. Requires **admin** access. Returns `204` on success.

### List rows (paginated)

`GET /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows?limit&offset&search&filters`

Query params:

- `limit` (optional): integer 0-5000, default 50
- `offset` (optional): integer 0+, default 0
- `search` (optional, alias `q`): case-insensitive substring match across `__row_key` and row values
- `filters` (optional, alias `filter`): JSON string (either an object map or an array of filter objects)

Examples:

- Search only:
  - `search=acme`
- Filter object map (implies `eq`):
  - `filters={"status":"new","owner":"alice"}`
- Filter array (explicit operators):
  - `filters=[{"column":"status","op":"eq","value":"new"},{"column":"score","op":"gte","value":80}]`

Notes:

- `filters` must be **URL-encoded** when used as a query param.
- For advanced filter operators, each entry can include:
  - `column`: column name (the Table's `primaryKey` column is automatically mapped to `__row_key`)
  - `op`: `eq | neq | contains | startsWith | endsWith | gt | gte | lt | lte | in | isNull | isNotNull`
  - `value`: operator value (string/number/bool/array depending on `op`)

Response body (`data`):

```json
{
  "success": true,
  "data": {
    "columns": [{ "name": "email", "type": "string" }],
    "data": [{ "email": "a@b.com" }],
    "pagination": { "limit": 50, "offset": 0, "total": 123 }
  }
}
```

Notes:

- Returned rows are reconstructed (reference columns become reference objects).
- Labels are not hydrated inline; use the resolve endpoint below.

### Append / upsert rows

`POST /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows:upsert`

Body:

```json
{ "mode": "upsert", "rows": [{ "email": "a@b.com", "status": "new" }] }
```

Notes:

- `mode: "append"` (default): inserts new rows
- `mode: "upsert"`: requires the Table `primaryKey` and each row must include that field

Response body (`data`):

```json
{
  "success": true,
  "data": {
    "inserted": 10,
    "updated": 2,
    "errors": [{ "index": 3, "column": "createdAt", "code": "TYPE", "message": "Expected ISO8601 datetime with offset or Z" }]
  }
}
```

### Delete a row

`DELETE /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows/:rowKey`

Deletes a single row by its `__row_key` (the primary key value). Returns `204`, or `404` if no row matches.

### Batch resolve references

`POST /api/v1/starships/:starshipId/tables/refs:resolve`

Resolves soft reference keys into human-readable labels and the underlying row/card data. This is the supported way to "hydrate" references.

Body:

```json
{
  "tableRowRefs": [{ "tableIdOrSlug": "accounts", "key": "acct_123", "labelColumn": "name" }],
  "taskCardRefs": [{ "cardId": "TASK_CARD_ID" }]
}
```

Response body (`data`):

```json
{
  "success": true,
  "data": {
    "resolved": {
      "table_row:accounts:acct_123": { "label": "Acme Inc.", "data": { "name": "Acme Inc." } },
      "task_card:TASK_CARD_ID": { "label": "Fix login bug", "data": { "id": "TASK_CARD_ID", "title": "Fix login bug", "description": "", "priority": null } }
    }
  }
}
```

Notes:

- Table-row references only resolve when the target Table defines a `primaryKey` (so `__row_key` exists).
- If `labelColumn` is set and present on the row, it becomes the `label`; otherwise the key is used.

### Query the Database with SQL

`POST /api/v1/starships/:starshipId/database/sql`

Runs a single read-only SQL `SELECT` against the starship's Database. See the dedicated [SQL surface](./sql.md) page for the security model, limits, and examples.
