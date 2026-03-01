---
title: Starship Datasets (Tabular Data)
slug: data/datasets
category: data
---

## Overview

Starship Datasets are **starship-scoped tables** used by humans and agents.

- **Schema**: stored on the dataset as a `columns` array (JSON)
- **Rows**: stored as JSON objects (`Record<string, unknown>`) keyed by column `name`
- **Primary key**: optional `primaryKey` enables upsert semantics and dataset-row references

## Data model

### Dataset

- **`columns`**: array of `StarshipDatasetColumn`
- **`primaryKey`**: optional column name. When set:
  - `rows:upsert` mode `"upsert"` is allowed
  - dataset-row references resolve by `row_key` (derived from the primaryKey value)

### Column

Column shape (high-level):

```json
{
  "name": "status",
  "type": "enum",
  "format": "text",
  "constraints": { "required": true },
  "enum": { "options": ["todo", "doing", "done"] }
}
```

#### Column types (`column.type`)

Supported `type` values:

- `string`
- `number`
- `boolean`
- `date` (stored/validated as ISO date string `YYYY-MM-DD`)
- `datetime` (stored/validated as ISO8601 instant with `Z` or offset; canonicalized to ISO `Z`)
- `json` (any JSON value)
- `enum` (single-select string from `enum.options`)
- `reference` (relation to dataset row or task card)
- `formula` (computed on read)

#### Column formats (`column.format`)

Formats are display hints (primarily for UI + export formatting):

- `text`
- `number`
- `currency`
- `date`
- `datetime`
- `percentage`

#### Constraints (`column.constraints`)

`constraints` is optional and may include:

- `required?: boolean`
- `nullable?: boolean`
- `unique?: boolean` (currently enforced only for the dataset `primaryKey` column)
- `default?: unknown` (applied on write if the field is missing)
- `min?: number`, `max?: number` (numbers)
- `minLength?: number`, `maxLength?: number` (strings)
- `pattern?: string` (strings; JS regex on the server)

## Enum columns

For `type: "enum"`:

```json
{
  "name": "status",
  "type": "enum",
  "enum": { "options": ["todo", "doing", "done"] }
}
```

On write, values must be one of the configured options.

## Reference (relation) columns

For `type: "reference"`, configure a target:

```json
{
  "name": "assigneeCard",
  "type": "reference",
  "reference": { "target": { "kind": "task_card" } }
}
```

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

### Reference values stored in rows

- Dataset row ref:

```json
{ "kind": "dataset_row", "datasetIdOrSlug": "accounts", "key": "acct_123" }
```

- Task card ref:

```json
{ "kind": "task_card", "cardId": "TASK_CARD_ID" }
```

### Hydrating labels for references

Row listing supports `expand=refs` to add `label` fields for reference values in returned row objects.

Example:

```json
{ "kind": "dataset_row", "datasetIdOrSlug": "accounts", "key": "acct_123", "label": "Acme Inc." }
```

## Formula columns

For `type: "formula"`:

```json
{
  "name": "total",
  "type": "formula",
  "formula": { "expr": "round(price * qty, 2)", "resultType": "number" }
}
```

### Semantics

- **Computed on read** (virtual): values are produced when listing rows.
- **Ignored on write**: any provided `total` cell value is dropped during upsert/append.
- If evaluation fails, the computed value is returned as `null`.

### Expression language

- Identifiers (e.g. `price`, `qty`) read from the current row.
- Operators: `+ - * /` and parentheses.
- Supported functions:
  - `coalesce(a,b,...)`
  - `round(x, digits)`
  - `nowEpochMs()`
  - `toEpochMs(datetimeIso)`
  - `daysBetween(a,b)`
  - `lookupDataset(datasetIdOrSlug, key, fieldName)`
  - `lookupTask(cardId, fieldName)`

## Write-time coercion & validation

Row upserts validate/coerce per column type:

- `number`: accepts numeric strings (`"42"` → `42`)
- `boolean`: accepts `true/false`, `"true"/"false"`, `1/0`, `"1"/"0"`, `"yes"/"no"`
- `date`: accepts ISO date or ISO datetime; stored as `YYYY-MM-DD`
- `datetime`: requires ISO8601 with `Z` or offset (avoids ambiguous local strings); stored as canonical ISO `Z`
- `enum`: enforces membership
- `reference`: validates reference object shape

If a row fails validation, it can be skipped with a row-level error (see response shape below).

## API

### List datasets

- `GET /api/v1/starships/:starshipId/datasets`

### Create dataset

- `POST /api/v1/starships/:starshipId/datasets`

### Update dataset (schema changes)

- `PATCH /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug`

### List rows (computed formulas + optional ref hydration)

- `GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows?limit&offset&expand=refs`

Notes:

- `expand=refs` enables reference label hydration.
- Response rows include computed formula columns.

### Append / upsert rows

- `POST /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows:upsert`

Body:

```json
{ "mode": "append", "rows": [{ "id": "1", "status": "todo" }] }
```

Response includes counts and optional row-level errors:

```json
{
  "inserted": 10,
  "updated": 2,
  "errors": [{ "index": 3, "column": "createdAt", "code": "TYPE", "message": "Expected ISO8601 datetime with offset or Z" }]
}
```

### Batch resolve references (optional)

- `POST /api/v1/starships/:starshipId/datasets/refs:resolve`

Body:

```json
{
  "datasetRowRefs": [{ "datasetIdOrSlug": "accounts", "key": "acct_123", "labelColumn": "name" }],
  "taskCardRefs": [{ "cardId": "TASK_CARD_ID" }]
}
```

---

title: Starship Datasets (Tabular)
slug: datasets
category: data

---

# Starship Datasets (Tabular)

## Overview

Datasets are **starship-scoped** tabular data stores intended for both humans and agents.

- Each dataset has a **name**, **slug**, and optional **description**
- Datasets define a schema-like list of **columns**
- Rows are stored as JSON objects (`Record<string, unknown>`)
- Optional `primaryKey` enables safe **upsert** semantics

## Data model (conceptual)

A dataset:

- `id`: string
- `starshipId`: string
- `name`: string
- `slug`: string (server-generated, unique per starship)
- `description`: string
- `columns`: `{ name, type?, format? }[]`
- `primaryKey?`: string | null
- `archived`: boolean

Column rules (server enforced):

- `name`: `^[a-zA-Z0-9_]+$` (alphanumeric + underscore), max 100 chars
- `type` (optional): `string | number | boolean | date | json`
- `format` (optional): `text | number | currency | date | percentage`

## Agent usage (connector actions)

Agents can manage datasets via the `starships` connector using `connector_action` nodes.

Key actions (Starships connector):

- `list-datasets`
- `create-dataset`
- `get-dataset`
- `list-dataset-rows`
- `upsert-dataset-rows`

### Notes on IDs vs slugs

- Many dataset actions accept **`datasetSlug` (preferred)** or `datasetId`.
- `create-dataset` does **not** accept a slug (the server generates it from the name and ensures uniqueness).

## Example: create a dataset, then upsert rows

This example assumes the agent runtime provides `state.starshipId` (or `runtimeEnv.STARSHIP_ID`) and that the agent has permission to call Starships connector actions.

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "Start", "parameters": {} },
    {
      "ref": "create",
      "type": "connector_action",
      "name": "Create dataset",
      "description": "Create a starship dataset",
      "parameters": {
        "connector": "starships",
        "action": "create-dataset",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ state.starshipId }}",
          "name": "Leads",
          "description": "Inbound leads captured by agents",
          "columns": [
            { "name": "email", "type": "string" },
            { "name": "status", "type": "string" },
            { "name": "score", "type": "number", "format": "number" }
          ],
          "primaryKey": "email"
        }
      }
    },
    {
      "ref": "upsert",
      "type": "connector_action",
      "name": "Upsert rows",
      "description": "Upsert rows by primaryKey",
      "parameters": {
        "connector": "starships",
        "action": "upsert-dataset-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ state.starshipId }}",
          "datasetSlug": "{{ lastOutputOf('create').body.data.dataset.slug }}",
          "mode": "upsert",
          "rows": [
            { "email": "a@b.com", "status": "new", "score": 92 },
            { "email": "c@d.com", "status": "qualified", "score": 78 }
          ]
        }
      }
    },
    {
      "ref": "end",
      "type": "end",
      "name": "End",
      "description": "End",
      "parameters": { "output": "{{ lastOutputOf('upsert').body.data }}" }
    }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "create" },
    { "ref": "e2", "from": "create", "to": "upsert" },
    { "ref": "e3", "from": "upsert", "to": "end" }
  ],
  "metadata": {}
}
```

## Example: list rows (pagination)

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "Start", "parameters": {} },
    {
      "ref": "rows",
      "type": "connector_action",
      "name": "List rows",
      "description": "Fetch a page of rows",
      "parameters": {
        "connector": "starships",
        "action": "list-dataset-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ state.starshipId }}",
          "datasetSlug": "leads",
          "limit": 50,
          "offset": 0
        }
      }
    },
    {
      "ref": "end",
      "type": "end",
      "name": "End",
      "description": "End",
      "parameters": { "output": "{{ lastOutputOf('rows').body.data }}" }
    }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "rows" },
    { "ref": "e2", "from": "rows", "to": "end" }
  ],
  "metadata": {}
}
```

Notes:

- `list-dataset-rows` returns `{ columns, data, pagination }` in `body.data`.
- For `mode: "upsert"`, the dataset must have `primaryKey` set, and each row must include a non-empty value for that key.

---

title: Starship Datasets (Tabular Data)
slug: data/datasets
category: data

---

# Starship Datasets (Tabular Data)

Starship datasets are **starship-scoped tables** that both **humans and agents** can read/write.

They are designed for:

- Agent work logs and structured outputs (e.g. leads, backlog items, research results)
- Human review in the product UI (Tables screen)
- Binding into Views via `DataTable` (optional)

## Data model

- **Dataset**: schema-like `columns` plus metadata.
- **Rows**: JSON objects (one object per row).

If a dataset defines `primaryKey`, agents can use upsert semantics by providing a value for that field.

## API (server)

All endpoints require JWT auth and starship collaborator access.

### List datasets

`GET /api/v1/starships/:starshipId/datasets`

Response:

```json
{ "datasets": [{ "id": "...", "name": "...", "columns": [] }] }
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
    { "key": "email", "label": "Email" },
    { "key": "status", "label": "Status" }
  ]
}
```

### List dataset rows (paginated)

`GET /api/v1/starships/:starshipId/datasets/:datasetId/rows?limit=50&offset=0`

Response:

```json
{
  "columns": [{ "key": "email", "label": "Email" }],
  "data": [{ "email": "a@b.com" }],
  "pagination": { "limit": 50, "offset": 0, "total": 123 }
}
```

### Append or upsert rows

`POST /api/v1/starships/:starshipId/datasets/:datasetId/rows:upsert`

Body:

```json
{
  "mode": "upsert",
  "rows": [{ "email": "a@b.com", "status": "new" }]
}
```

- `mode: "append"` (default): always inserts new rows.\n- `mode: "upsert"`: requires dataset `primaryKey` and each row must include that field.\n

## UI (Tables)

The product renders datasets at:

- `/ship/:slug/tables` (list + create)\n- `/ship/:slug/tables/:datasetId` (viewer)

## Views integration (optional)

To show a dataset inside a View, you can bind a `DataTable` widget to a query result.\n\nBecause datasets are starship-scoped and require auth, the simplest approach is:\n- Create a view query of kind `http` pointing at the dataset rows endpoint.\n- Bind the widget’s `columns` and `data` to the query result.\n\nSee:\n- `public-docs/views/runtime.md`\n- `public-docs/widgets/data/data-table.md`\n+
