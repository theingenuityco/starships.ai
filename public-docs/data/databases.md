---
title: Starship Databases & Tables (Tabular Data)
slug: data/databases
category: data
---

## What is a Database?

Every starship has its own private **Database**: a starship-scoped namespace that holds typed **Tables** of rows. Both **humans and agents** can read and write it.

The feature is a two-level hierarchy:

- **Database** (one per starship): the starship's private data namespace. Under the hood it is a dedicated Postgres schema, `db_<starshipId>`, provisioned automatically the first time you create a Table.
- **Table**: a real, typed Postgres table of rows inside the Database.

Because Tables are real Postgres tables, columns are strongly typed, constraints are enforced by the database, and agents can run read-only **SQL** directly against their Database.

- **Schema**: a `columns` array stored on the Table (column name, type, constraints, enum/reference config).
- **Rows**: plain JSON objects (`Record<string, unknown>`) at the API level, stored as typed columns in the physical table.
- **Primary key** (optional): `primaryKey` enables safe **upsert** semantics and stable **row references**.

## Where this is implemented (source of truth)

If you need to confirm behavior, these files define the canonical shapes and rules:

- **Protocol types (API shapes)**: `packages/protocol/src/domains/table.ts`
- **HTTP API + validation/coercion**: `packages/server/src/routes/tables.ts`
- **Identifiers (schema/role/table naming)**: `packages/models/src/helpers/starship-tables/identifiers.ts`
- **DDL generation (CREATE/ALTER TABLE)**: `packages/models/src/services/StarshipTableDdlCompiler.ts`
- **Database + read-only role provisioning**: `packages/models/src/services/StarshipDatabaseProvisioner.ts`
- **Registry + rows repositories**: `packages/models/src/repositories/StarshipTableRepository.ts`, `packages/models/src/repositories/StarshipTableRowRepository.ts`
- **DB migration**: `packages/models/src/migrations/191_starship_tables.ts`

## Documentation map (recommended reading order)

- **1) Schema & column types**: [Tables schema](./databases/schema.md)
- **2) Writing & reading rows**: [Rows, coercion, and upserts](./databases/rows.md)
- **3) HTTP API**: [Databases API](./databases/api.md)
- **4) Read-only SQL surface**: [Querying a Database with SQL](./databases/sql.md)
- **5) Agent/Autopilot usage**: [Connector actions & tools](./databases/connector-actions.md)
- **6) UI & Views**: [Product UI + Views integration](./databases/ui-and-views.md)
- **7) Debugging**: [Troubleshooting & gotchas](./databases/troubleshooting.md)

## Physical model (how it is stored)

Each starship maps to one Postgres schema, and each Table maps to one real Postgres table inside it:

- **Database schema**: `db_<starshipId>`
- **Physical table name**: derived from the Table slug (lowercase, `[a-z0-9_]`, max 63 bytes), unique within the schema, and surfaced as `physicalTable` so agents can reference it in read-only SQL queries.

Every physical table carries four hidden bookkeeping columns alongside your author-defined columns:

```
__id          text PRIMARY KEY     (app-generated surrogate key)
__row_key     text [UNIQUE]        (mirrors the logical primaryKey value; upsert target)
__created_at  timestamptz          (app-maintained, defaults to now())
__updated_at  timestamptz          (app-maintained, defaults to now())
```

Your declared columns become real typed Postgres columns (see [schema](./databases/schema.md) for the type mapping).

## Quickstart (mental model)

1. **Create a Table** with a `columns` array. The Database schema is provisioned automatically on first use.
2. Optionally set **`primaryKey`** to a column name:
   - Enables `mode: "upsert"` in `rows:upsert`
   - Backs the `__row_key` UNIQUE constraint and stable row references
3. **Append or upsert rows** as plain JSON objects keyed by column `name`.
4. **List rows** with pagination, search, and filters.
5. Optionally, let agents **query the Database with read-only SQL** (`POST .../database/sql`).

## Glossary

- **Database**: the per-starship Postgres schema (`db_<starshipId>`) that contains a starship's Tables.
- **Table**: a real, typed Postgres table of rows.
- **tableIdOrSlug**: most endpoints accept either a Table **id** or its **slug**.
- **rowKey / `__row_key`**: a stable row identifier derived from the Table `primaryKey` value.
- **physicalTable**: the physical Postgres table name (within `db_<starshipId>`) that agents reference in SQL.
