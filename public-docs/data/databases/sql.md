---
title: Querying a Database with SQL
slug: data/databases/sql
category: data
---

## Overview

Because each starship's Tables are real Postgres tables inside a per-starship schema (`db_<starshipId>`), agents (and authenticated users) can run **read-only SQL** directly against the Database. This is the most flexible way to read, join, filter, and aggregate across Tables without paging through the rows API.

`POST /api/v1/starships/:starshipId/database/sql`

Body:

```json
{ "sql": "SELECT status, count(*) AS n FROM leads GROUP BY status ORDER BY n DESC", "params": [] }
```

- `sql` (required): a single read-only `SELECT` statement (max 20000 chars)
- `params` (optional): positional parameters for `$1, $2, ...` (max 100)

Response body (`data`):

```json
{
  "success": true,
  "data": {
    "fields": ["status", "n"],
    "rows": [{ "status": "new", "n": 42 }, { "status": "qualified", "n": 17 }],
    "rowCount": 2,
    "truncated": false
  }
}
```

## Referencing Tables in SQL

- The `search_path` is preset to the starship's Database schema, so reference Tables **unqualified** by their `physicalTable` name (e.g. `FROM leads`, not `FROM db_xxx.leads`).
- Call `list-tables` (or `GET .../tables`) first to discover each Table's `physicalTable` name and columns. The author column names you defined are the real Postgres column names.
- The hidden bookkeeping columns are available too: `__id`, `__row_key`, `__created_at`, `__updated_at`.

Example with parameters:

```json
{
  "sql": "SELECT email, score FROM leads WHERE score >= $1 ORDER BY score DESC LIMIT 10",
  "params": [80]
}
```

## Security model

Isolation is enforced by Postgres, not just by application code:

- A restricted agent login role (`NOINHERIT`) assumes a per-starship role `ship_ro_<starshipId>` via `SET LOCAL ROLE` for the duration of the query.
- That per-starship role has only `USAGE` + `SELECT` on this starship's schema. It cannot see other starships' schemas, the `public` schema, or any catalog data it was not granted.
- The query runs inside a `BEGIN READ ONLY` transaction with `SET LOCAL search_path` and `SET LOCAL statement_timeout = 10000` (10 seconds). All `SET LOCAL` settings auto-revert at commit, so nothing leaks onto the pooled connection.

Consequences for callers:

- **`SELECT` only.** Writes (`INSERT`/`UPDATE`/`DELETE`/DDL) are rejected by the read-only transaction.
- **Single statement.** Parameters are bound; do not concatenate untrusted input into the SQL string.
- **Row cap**: results are capped at **1000 rows**. If more rows match, `truncated` is `true` and you should add `LIMIT`/`OFFSET` or aggregate.
- **10-second timeout** per statement.
- **Generic errors**: raw Postgres errors (which would leak physical schema/table/column names) are logged server-side; callers receive a generic `DATABASE_QUERY_FAILED` / "Query failed" `400`.

## Enabling the SQL surface (operators)

The SQL surface is **optional** and is only available when the read-only agent role is configured:

- Set `POSTGRES_AGENT_PASSWORD` (and optionally `POSTGRES_AGENT_USER`, default `starships_agent`) in the server environment.
- Bootstrap the login role once: `pnpm --filter @starships/models provision:agent-role`.

When it is not configured, the endpoint returns `503` with `SERVICE_UNAVAILABLE` and the message "Agent SQL surface is not enabled on this instance". Table CRUD and the rows API are unaffected, they use the app's own connection.

## Agent usage

Agents typically call this through the seeded **Query Database (SQL)** tool (slug `query-database-sql`) or the `query-database-sql` Starships connector action. See [Connector actions & tools](./connector-actions.md#query-database-sql-tool).
