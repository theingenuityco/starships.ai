---
title: Connector Actions & Agent Tools (Datasets)
slug: data/datasets/connector-actions
category: data
---

## Two ways to access datasets

You can interact with datasets via:

- **HTTP API** (see [Datasets API](./api.md))
- **Starships connector actions** via `connector_action` nodes (recommended for agents)

Agents typically use connector actions so the host can inject auth and base URLs.

## Starships connector actions (datasets)

Key actions:

- `list-datasets`
- `create-dataset`
- `get-dataset`
- `list-dataset-rows`
- `upsert-dataset-rows`

## Built-in tools (seeded)

Starships ships a few dataset-focused tools (implemented as blueprints) that wrap connector actions:

- **List Datasets**: `list-datasets`
- **Create Dataset**: `create-dataset`
- **Get Dataset Rows**: `get-dataset-rows` (calls `list-dataset-rows`)
- **Upsert Dataset Rows**: `upsert-dataset-rows`

These tools default `starshipId` from `env('STARSHIP_ID')` when not provided.

## Example: create a dataset, then upsert rows (Blueprint / DSL)

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "create",
      "type": "connector_action",
      "name": "Create dataset",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "create-dataset",
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
        "action": "upsert-dataset-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "datasetSlug": "{{ lastOutputOf('create').body.data.dataset.slug }}",
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

- Connector actions accept `datasetSlug` (preferred) or `datasetId` and map it into the server’s `:datasetIdOrSlug` route param.
- For `mode: "upsert"`, the dataset must define `primaryKey` and each row must include that field.

## Example: list rows (pagination)

```json
{
  "nodes": [
    { "ref": "start", "type": "start", "name": "Start", "description": "", "parameters": {} },
    {
      "ref": "rows",
      "type": "connector_action",
      "name": "List rows",
      "description": "",
      "parameters": {
        "connector": "starships",
        "action": "list-dataset-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "datasetSlug": "leads",
          "limit": 50,
          "offset": 0
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

- `limit` (optional): max rows to return (0–200)
- `offset` (optional): offset (0+) for pagination
- `expandRefs` (optional): when `true`, maps to `expand=refs` for reference label hydration
- `search` (optional): substring search across `rowKey` and row values (case-insensitive)
- `filters` (optional): JSON string (either an object map or array of filter objects)

Example: list rows with `search` + `filters`

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
        "action": "list-dataset-rows",
        "failOnNon2xx": true,
        "args": {
          "starshipId": "{{ env('STARSHIP_ID') }}",
          "datasetSlug": "leads",
          "limit": 50,
          "offset": 0,
          "expandRefs": true,
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
