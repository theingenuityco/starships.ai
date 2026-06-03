---
title: Connector Actions & Agent Tools (Databases)
slug: data/databases/connector-actions
category: data
---

## Two ways to access Tables

You can interact with a starship's Database and Tables via:

- **HTTP API** (see [Databases API](./api.md))
- **Starships connector actions** via `connector_action` nodes (recommended for agents)

Agents typically use connector actions so the host can inject auth and base URLs.

## Starships connector actions (Tables)

Key actions:

- `list-tables`
- `create-table`
- `get-table`
- `update-table`
- `list-table-rows`
- `upsert-table-rows`
- `query-database-sql` (read-only SQL over the Database)

> Note: deleting a row is currently only available via the HTTP API (`DELETE /api/v1/starships/:starshipId/tables/:tableIdOrSlug/rows/:rowKey`); there is no corresponding connector action.

Room pinning actions (to surface a Table in a room):

- `pin-room-table`
- `unpin-room-table`
- `get-room-pins-tables`
- `reorder-room-pins-tables`

Most Table actions accept `tableSlug` (preferred) or `tableId`, which the connector maps into the server's `:tableIdOrSlug` route param. Actions default `starshipId` from `env('STARSHIP_ID')` when not provided.

## Query Database (SQL) tool

Starships ships a seeded agent tool that wraps the read-only SQL surface:

- **Query Database (SQL)**: slug `query-database-sql`, wraps the `query-database-sql` connector action.
- Parameters: `starshipId?` (defaults to `STARSHIP_ID`), `sql` (required), `params?` (positional `$1, $2, ...`).
- It runs a single read-only `SELECT`; writes are rejected. Call `list-tables` first to learn each Table's `physicalTable` name and columns. See [Querying a Database with SQL](./sql.md).

## Example: create a Table, then upsert rows (Blueprint / DSL)

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "create",
      "type": "connector_action",
      "name": "Create table",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "create-table",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "name": "Leads",
          "description": "Inbound leads captured by agents",
          "columns": [
            { "name": "email", "type": "string", "description": "Primary contact email" },
            { "name": "status", "type": "enum", "enum": { "options": ["new", "qualified"] } },
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
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "upsert-table-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "tableSlug": "{{ lastOutputOf('create').body.data.table.slug }}",
          "mode": "upsert",
          "rows": [
            { "email": "a@b.com", "status": "new", "score": 92 },
            { "email": "c@d.com", "status": "qualified", "score": 78 }
          ]
        }
      }
    },
    { "ref": "end", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('upsert').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "create" },
    { "ref": "e2", "from": "create", "to": "upsert" },
    { "ref": "e3", "from": "upsert", "to": "end" }
  ],
  "metadata": {}
}
```

Notes:

- Connector actions accept `tableSlug` (preferred) or `tableId` and map it into the server's `:tableIdOrSlug` route param.
- For `mode: "upsert"`, the Table must define `primaryKey` and each row must include that field.

## Example: list rows (pagination + filters)

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "rows",
      "type": "connector_action",
      "name": "List rows (filtered)",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "list-table-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "tableSlug": "leads",
          "limit": 50,
          "offset": 0,
          "search": "acme",
          "filters": "[{\"column\":\"status\",\"op\":\"eq\",\"value\":\"new\"},{\"column\":\"score\",\"op\":\"gte\",\"value\":80}]"
        }
      }
    },
    { "ref": "end", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('rows').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "rows" },
    { "ref": "e2", "from": "rows", "to": "end" }
  ],
  "metadata": {}
}
```

Args:

- `limit` (optional): max rows to return (0-5000)
- `offset` (optional): offset (0+) for pagination
- `search` (optional): substring search across `__row_key` and row values (case-insensitive)
- `filters` (optional): JSON string (either an object map or array of filter objects)

## Example: read-only SQL over the Database

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "sql",
      "type": "connector_action",
      "name": "Query Database SQL",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "query-database-sql",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "sql": "SELECT status, count(*) AS n FROM leads GROUP BY status ORDER BY n DESC",
          "params": []
        }
      }
    },
    { "ref": "end", "type": "end", "name": "End", "description": "", "parameters": { "output": "{{ lastOutputOf('sql').body.data }}" } }
  ],
  "edges": [
    { "ref": "e1", "from": "start", "to": "sql" },
    { "ref": "e2", "from": "sql", "to": "end" }
  ],
  "metadata": {}
}
```

Notes:

- Reference Tables unqualified by their `physicalTable` name (the `search_path` is preset to the Database schema).
- `SELECT` only; results are capped at 1000 rows. See [Querying a Database with SQL](./sql.md) for the full security model and limits.
