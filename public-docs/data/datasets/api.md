---
title: Datasets HTTP API
slug: data/datasets/api
category: data
---

## Auth & access control

All endpoints require:

- JWT authentication
- The authenticated user must have collaborator access to the starship

## Identifiers: `:datasetIdOrSlug`

Most dataset endpoints accept `:datasetIdOrSlug`, which may be either:

- a dataset **id**, or
- a dataset **slug**

## Endpoints

### List datasets

`GET /api/v1/starships/:starshipId/datasets`

Query params:

- `includeArchived` (optional): `true/false` (also accepts `1/0`, `yes/no`, `y/n`)

Response body (`data`):

```json
{ "datasets": [{ "id": "...", "name": "...", "slug": "...", "columns": [], "primaryKey": null, "archived": false }] }
```

### Create dataset

`POST /api/v1/starships/:starshipId/datasets`

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

Response body (`data`):

```json
{ "dataset": { "id": "...", "slug": "leads", "columns": [], "primaryKey": "email", "archived": false } }
```

### Get dataset details

`GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug`

Response body (`data`):

```json
{ "dataset": { "id": "...", "name": "...", "slug": "...", "columns": [] } }
```

### Update dataset

`PATCH /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug`

Body supports partial updates:

- `name?: string`
- `description?: string`
- `columns?: StarshipDatasetColumn[]`
- `primaryKey?: string | null`
- `archived?: boolean`

Notes:

- If you set `primaryKey`, it must match an existing column name (in the provided `columns` or the current dataset schema).
- `constraints.unique` is currently only supported for the primaryKey column.

### List rows (paginated)

`GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows?limit&offset&expand=refs`

Query params:

- `limit` (optional): integer \(0–200\), default 50
- `offset` (optional): integer \(0+\), default 0
- `expand` (optional): comma-separated list; `refs` enables reference label hydration

Response body (`data`):

```json
{
  "columns": [{ "name": "email", "type": "string" }],
  "data": [{ "email": "a@b.com" }],
  "pagination": { "limit": 50, "offset": 0, "total": 123 }
}
```

Notes:

- Returned rows include **computed formula columns** (if defined).
- With `expand=refs`, returned reference values may include a computed `label`.

### Append / upsert rows

`POST /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert`

Body:

```json
{ "mode": "upsert", "rows": [{ "email": "a@b.com", "status": "new" }] }
```

Notes:

- `mode: "append"` (default): inserts new rows
- `mode: "upsert"`: requires dataset `primaryKey` and each row must include that field

Response body (`data`):

```json
{ "inserted": 10, "updated": 2, "errors": [{ "index": 3, "column": "createdAt", "code": "TYPE", "message": "Expected ISO8601 datetime with offset or Z" }] }
```

### Batch resolve references (optional)

`POST /api/v1/starships/:starshipId/datasets/refs:resolve`

Body:

```json
{
  "datasetRowRefs": [{ "datasetIdOrSlug": "accounts", "key": "acct_123", "labelColumn": "name" }],
  "taskCardRefs": [{ "cardId": "TASK_CARD_ID" }]
}
```

Response body (`data`):

```json
{ "resolved": { "dataset_row:accounts:acct_123": { "label": "Acme Inc.", "data": { "name": "Acme Inc." } } } }
```
