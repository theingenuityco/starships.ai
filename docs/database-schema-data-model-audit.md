# Database Schema & Data Model Documentation Audit
_Workspace: `/workspace` • Date: 2026-01-02_

This report audits the **implemented** data layer (migrations + entities + repositories) against the **documentation** (ER diagram + migration spec).

---

## 1) Complete data-layer map (authoritative sources)

### Schema definitions (authoritative)
- **Base schema**: `packages/models/src/migrations/000_postgresql_schema.ts` (raw SQL in a TS migration).
- **Incremental schema evolution**: `packages/models/src/migrations/*.ts` (additional tables, ALTERs, indexes, constraints).
- **Migration runner**: `packages/models/src/scripts/db-migrate.ts` (tracks checksums in `schema_migrations`; explicit note that SQL-file support is removed).

### Data models + validation rules (application-layer)
- **Entities (Layer 2, validation + transformation)**: `packages/models/src/entities/*Entity.ts`
  - Uses `class-validator` decorators (e.g., enum membership, lengths, formats), plus custom create/update rules in `static validate(...)`.
  - Note: these are **not DB constraints** unless mirrored in migrations.

### Persistence / access patterns
- **Repositories**: `packages/models/src/repositories/*.ts` (SQL query patterns + implicit expectations about indexes and constraints).
- **Schema validation utility**: `packages/models/src/scripts/schema-validator.ts` (information_schema/pg_indexes checks; should mirror current schema reality).

### Documentation sources compared in this audit
- **ER diagram**: `docs/er-diagram.md`
- **Migration spec**: `MIGRATION_SPEC.md`
- **Package docs**: `packages/models/README.md`, root `README.md`

---

## 2) Implemented schema catalog (tables/models)

**Legend**
- **Schema**: migration file(s) and line ranges that define or mutate the table.
- **Entity**: entity file (validation rules / model shape). If missing, schema is driven by repositories / protocol types.
- **Relationships**: FKs and their delete behavior (CASCADE/SET NULL).
- **Constraints/Indexes**: key ones; not exhaustive where the table is heavily evolved.

### `users`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L19-L44`
  - Add instance admin flag: `packages/models/src/migrations/012_add_instance_admin_flag.ts:L18-L21`
- **Entity**: `packages/models/src/entities/UserEntity.ts` (e.g., email normalization, avatar format, Stripe customer id format)
- **Relationships**
  - Referenced by many FKs (e.g., `starships.owner_id`, token tables, subscriptions).
- **Key columns (implemented)**
  - `id varchar(255) pk`
  - `email varchar(255) unique (nullable)`
  - `stripe_customer_id varchar(255) unique (nullable)`
  - `email_verified boolean not null default false`
  - `has_password boolean not null default false`
  - `auth_methods text[] not null default '{}'`
  - `primary_auth_method varchar(10) not null default 'password' check in ('password','oauth')`
  - `last_login_at timestamptz null`
  - `is_instance_admin boolean not null default false` (added later)
  - `created_at/updated_at timestamptz not null default now()`
- **Key indexes**
  - BTree: email, stripe_customer_id, email_verified, has_password, primary_auth_method, created_at, last_login_at
  - GIN: auth_methods

### `oauth_accounts`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L49-L67`
- **Entity**: `packages/models/src/entities/OAuthAccountEntity.ts` (not shown in this audit excerpt; exists in tree)
- **Relationships**
  - `user_id -> users(id) on delete cascade`
- **Constraints**
  - `unique(provider, provider_user_id)`

### `oauth_auth_codes`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L72-L86`
- **Entity**: `packages/models/src/entities/OAuthAuthCodeEntity.ts`
- **Relationships**
  - `user_id -> users(id) on delete cascade`
- **Constraints/Indexes**
  - `code unique not null`
  - Partial index on `code` where `NOT consumed`
  - `expires_at` index

### `email_verification_tokens`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L93-L108`
- **Entity**: `packages/models/src/entities/EmailVerificationTokenEntity.ts`
- **Relationships**
  - `user_id -> users(id) on delete cascade`

### `password_reset_tokens`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L113-L128`
- **Entity**: `packages/models/src/entities/PasswordResetTokenEntity.ts`
- **Relationships**
  - `user_id -> users(id) on delete cascade`

### `email_change_tokens`
- **Schema**: `packages/models/src/migrations/002_add_email_change_tokens.ts:L8-L24`
- **Entity**: `packages/models/src/entities/EmailChangeTokenEntity.ts`
- **Relationships**
  - `user_id -> users(id) on delete cascade`

### `starships`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L133-L150`
  - Add class + concurrency + subs tables: `packages/models/src/migrations/053_add_ship_class_subscriptions_and_concurrency.ts:L24-L88`
  - Expand ship_class enum: `packages/models/src/migrations/054_add_cruiser_ship_class.ts:L34-L38`
- **Entity**: `packages/models/src/entities/StarshipEntity.ts` (requires `shipClass`, `maxConcurrentTurns`, etc.)
- **Relationships**
  - `owner_id -> users(id) on delete cascade`
- **Key columns (implemented)**
  - From base: `id`, `slug`, `owner_id`, `name`, `max_agents`, `status`, `created_at`, `updated_at`, unique(owner_id,slug)
  - Added: `ship_class varchar(20) not null default 'scout' check in ('scout','frigate','cruiser')`
  - Added: `max_concurrent_turns int not null default 1`
- **Key note**
  - `max_agents` default changes from 3 (base schema) to 5 (migration 053).

### `starship_subscriptions`
- **Schema**: `packages/models/src/migrations/053_add_ship_class_subscriptions_and_concurrency.ts:L42-L66`
- **Entity**: no `StarshipSubscriptionEntity` present in `packages/models/src/entities/` (as of this audit)
- **Relationships**
  - `starship_id -> starships(id) on delete cascade` (unique)
  - `user_id -> users(id) on delete cascade`
- **Constraints**
  - unique(starship_id), unique(stripe_subscription_id)

### `starship_turn_leases`
- **Schema**: `packages/models/src/migrations/053_add_ship_class_subscriptions_and_concurrency.ts:L69-L81`
- **Entity**: none present
- **Relationships**
  - `starship_id -> starships(id) on delete cascade`

### `agent_templates`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L155-L183`
  - Versioning: `packages/models/src/migrations/005_add_template_versioning.ts:L10-L18`
  - Temperature type: `packages/models/src/migrations/018_change_agent_temperature_to_double.ts:L17-L21`
  - Avatar fields: `packages/models/src/migrations/040_add_agent_avatars.ts:L27-L36`
- **Entity**: `packages/models/src/entities/AgentTemplateEntity.ts`
- **Key columns (base schema)**
  - Notably includes: `state jsonb not null`, `assigned_tool_slugs text[]`, `icon varchar(10)`, `preview_prompts text[]`
  - Note: base schema uses `tags text[]`, not JSONB.

### `agents`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L188-L215`
  - Versioning: `packages/models/src/migrations/005_add_template_versioning.ts:L20-L34`
  - Publication: `packages/models/src/migrations/013_add_agent_publication_status.ts:L20-L32`
  - Publication metadata: `packages/models/src/migrations/016_add_agent_publication_metadata.ts:L20-L25`
  - Category: `packages/models/src/migrations/017_add_agent_category.ts:L10-L16`
  - Temperature type: `packages/models/src/migrations/018_change_agent_temperature_to_double.ts:L10-L14`
  - Avatar attachment: `packages/models/src/migrations/040_add_agent_avatars.ts:L16-L23`
  - Avatar prompt: `packages/models/src/migrations/041_add_agent_avatar_mirror_description.ts:L13-L15`
  - Reasoning config: `packages/models/src/migrations/043_add_agent_reasoning_config.ts:L13-L15`
- **Entity**: `packages/models/src/entities/AgentEntity.ts`
- **Relationships (base)**
  - `starship_id -> starships(id) on delete set null` (note: nullable FK in base schema)
  - `template_id -> agent_templates(id) on delete set null`
- **Key note**
  - Base schema includes global unique index on `agents.slug` (`packages/models/src/migrations/000_postgresql_schema.ts:L213-L214`).

### `tool_templates`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L220-L245`
  - Versioning: `packages/models/src/migrations/006_add_tool_versioning.ts:L10-L18`
- **Entity**: `packages/models/src/entities/ToolTemplateEntity.ts`

### `tools`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L250-L280`
  - Versioning: `packages/models/src/migrations/006_add_tool_versioning.ts:L20-L34`
  - Publication workflow: `packages/models/src/migrations/019_add_tool_publication_metadata.ts:L25-L40`
  - Split template linkage: `packages/models/src/migrations/042_add_tool_published_template_id_and_rename_template_id.ts:L20-L67`
- **Entity**: `packages/models/src/entities/ToolEntity.ts`
- **Relationships (base + later)**
  - `starship_id -> starships(id) on delete cascade`
  - `template_id -> tool_templates(id) on delete set null` (renamed to `source_template_id` by migration 042)
  - `published_template_id -> tool_templates(id) on delete set null`
- **Key note**
  - Base schema defines both:
    - `unique(starship_id, slug)` and
    - `unique index on tools.slug` (global uniqueness) at `packages/models/src/migrations/000_postgresql_schema.ts:L269-L278`.

### `conversations`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L292-L307`
  - Parent conversation: `packages/models/src/migrations/020_add_parent_conversation_id.ts:L4-L10`
- **Entity**: `packages/models/src/entities/ConversationEntity.ts`
- **Relationships**
  - `starship_id -> starships(id) on delete cascade`
  - `parent_conversation_id -> conversations(id) on delete set null`

### `messages`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L312-L335`
  - Attachments linkage: `packages/models/src/migrations/007_add_attachments.ts:L52-L61`
- **Entity**: `packages/models/src/entities/MessageEntity.ts`
- **Relationships**
  - `starship_id -> starships(id) on delete cascade`
  - `conversation_id -> conversations(id) on delete cascade`
  - `agent_id -> agents(id) on delete set null`

### `attachments`
- **Schema**
  - Create table + message column: `packages/models/src/migrations/007_add_attachments.ts:L14-L61`
  - Change uniqueness to (starship_id,s3_key): `packages/models/src/migrations/045_change_attachments_s3_key_unique_to_starship_scoped.ts:L14-L22`
- **Entity**: **no `AttachmentEntity`** in `packages/models/src/entities/` (as of this audit)
- **Repository/model**
  - Repository exists: `packages/models/src/repositories/AttachmentRepository.ts`
  - Implied model mapping: `AttachmentRepository.mapToModel` at `packages/models/src/repositories/AttachmentRepository.ts:L193-L205`
- **Relationships**
  - `starship_id -> starships(id) on delete cascade`
  - `message_id -> messages(id) on delete cascade`

### `connectors`
- **Schema**
  - Create table: `packages/models/src/migrations/008_add_starship_connectors.ts:L9-L31`
  - Remove provider check constraint: `packages/models/src/migrations/009_extend_connector_providers.ts:L15-L19`
  - Add template linkage columns: `packages/models/src/migrations/028_add_connector_template_link_to_connectors.ts:L13-L17`
- **Entity**: `packages/models/src/entities/ConnectorEntity.ts`
- **Relationships**
  - `starship_id -> starships(id) on delete cascade`
  - `template_id -> connector_templates(id)` (nullable)

### `connector_templates`
- **Schema**
  - Create table (v1): `packages/models/src/migrations/027_add_connector_templates.ts:L18-L45`
  - OAuth cleanup / legacy column drops: `packages/models/src/migrations/031_squash_connector_template_oauth_cleanup.ts:L26-L392`
  - v2 root runtime fields (adds base_url/auth_json/endpoints_json; drops runtime_config + display_name): `packages/models/src/migrations/051_connector_templates_v2_root_runtime_fields.ts:L22-L257`
  - Allow basic auth: `packages/models/src/migrations/055_allow_basic_auth_in_connector_templates.ts:L11-L19`
  - Starships endpoint catalog expansion: `packages/models/src/migrations/052_expand_starships_connector_endpoints.ts:L13-L16`
- **Entity**: `packages/models/src/entities/ConnectorTemplateEntity.ts`

### `connector_providers` (deprecated/dropped)
- **Schema**
  - Create table: `packages/models/src/migrations/026_add_connector_blueprints_inline.ts:L18-L41`
  - Dropped by: `packages/models/src/migrations/027_add_connector_templates.ts:L267-L270`
- **Entity**: none present

### `environments` → `connector_secrets`
- **Schema**
  - Create `environments`: `packages/models/src/migrations/000_postgresql_schema.ts:L340-L357`
  - Add `connector_id` FK: `packages/models/src/migrations/008_add_starship_connectors.ts:L33-L42`
  - Rename table: `packages/models/src/migrations/034_rename_environments_to_connector_secrets.ts:L51-L76`
- **Entity**: `packages/models/src/entities/ConnectorSecretEntity.ts`
- **Key note**
  - Entity docstring explicitly states: “Formerly EnvironmentEntity / environments table”.

### `platform_secrets`
- **Schema**: `packages/models/src/migrations/032_add_platform_secrets.ts:L18-L33`
- **Entity**: `packages/models/src/entities/PlatformSecretEntity.ts`
- **Constraints**
  - `key unique not null`

### `schedules`
- **Schema**
  - Create table: `packages/models/src/migrations/023_add_schedules_table.ts:L13-L33`
  - Add `is_recurring`: `packages/models/src/migrations/024_add_is_recurring_to_schedules.ts:L13-L15`
  - Add end fields + run_count: `packages/models/src/migrations/025_add_schedule_end_fields.ts:L16-L20`
  - Add owner user id: `packages/models/src/migrations/030_add_schedule_owner_user_id.ts:L14-L16`
- **Entity**: `packages/models/src/entities/ScheduleEntity.ts`

### `widgets`
- **Schema**: `packages/models/src/migrations/010_add_widgets_table.ts:L12-L30`
- **Entity**: `packages/models/src/entities/WidgetEntity.ts`

### `usage`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L362-L387`
- **Entity**: `packages/models/src/entities/UsageEntity.ts`
- **Key note**
  - Implemented schema includes billing reconciliation fields: `billed_at`, `billed_ledger_id`, and a FK to `ledger_entries` (`000_postgresql_schema.ts:L371-L460`).

### `wallets`
- **Schema**
  - Create table: `packages/models/src/migrations/000_postgresql_schema.ts:L392-L404`
  - Convert legacy USD wallets to credits: `packages/models/src/migrations/047_migrate_usd_wallet_balances_to_credits.ts:L3-L50`
- **Entity**: `packages/models/src/entities/WalletEntity.ts` (validates currency in `['USD','CREDITS']`)

### `topups`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L409-L429`
- **Entity**: `packages/models/src/entities/TopupEntity.ts`

### `ledger_entries` (legacy)
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L434-L460`
- **Entity**: `packages/models/src/entities/LedgerEntryEntity.ts`
- **Key note**
  - New code writes to `wallet_ledger` (see `packages/models/src/repositories/LedgerRepository.ts:L33-L71`).

### `wallet_ledger` (current)
- **Schema**
  - Create table: `packages/models/src/migrations/046_add_message_billing_idempotency_index.ts:L12-L38`
  - Add invoice idempotency: `packages/models/src/migrations/053_add_ship_class_subscriptions_and_concurrency.ts:L82-L88`
- **Entity**
  - Uses `LedgerEntryEntity` despite different physical table name (repository maps from `wallet_ledger`).

### `promo_redemptions`
- **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L466-L485`
- **Entity**: `packages/models/src/entities/PromoRedemptionEntity.ts`

### Junction tables
- **`agent_tools`**
  - **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L491-L496`
  - **Note**: permissions column added later by `packages/models/src/migrations/049_add_agent_tool_permissions.ts` (not cited here; exists in migrations list).
- **`agent_template_tool_templates`**
  - **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L499-L504`
- **`conversation_agents`**
  - **Schema**: `packages/models/src/migrations/000_postgresql_schema.ts:L507-L512`

---

## 3) Documentation vs implementation mismatches

Each mismatch includes:
- **Actual (code)**: authoritative source (migration/entity/repo) with file+line range.
- **Claimed (docs)**: the conflicting documentation snippet (file+line range).
- **Severity**
  - **CRITICAL**: can plausibly cause data corruption or broken production behavior.
  - **MAJOR**: materially wrong mental model; likely to cause incorrect features/queries.
  - **MINOR**: incomplete docs or small type drift without big consequences.
- **Recommended fix**: concrete change.

### M1 — Migration spec references a non-existent schema file + outdated runner behavior
- **Actual (code)**
  - Migrations are TS/JS only; SQL-file support is explicitly removed: `packages/models/src/scripts/db-migrate.ts:L42-L44`.
  - Base schema migration is `packages/models/src/migrations/000_postgresql_schema.ts` (not `.sql`).
- **Claimed (docs)**
  - `MIGRATION_SPEC.md` references `packages/models/migrations/000_postgresql_schema.sql` and shows running `psql ... -f ...sql`: `MIGRATION_SPEC.md:L31-L38` and `MIGRATION_SPEC.md:L295-L303`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Update `MIGRATION_SPEC.md` to reference `packages/models/src/migrations/000_postgresql_schema.ts` and the `pnpm run migrate` flow (or `tsx src/scripts/db-migrate.ts` if that is the intended entrypoint).

### M2 — ER diagram omits large parts of the implemented schema (auth tokens, billing, connectors, schedules, widgets, approvals)
- **Actual (code)**
  - Implemented tables not represented in `docs/er-diagram.md` include, at minimum:
    - Auth/token tables: `oauth_accounts`, `oauth_auth_codes`, `email_verification_tokens`, `password_reset_tokens`, `email_change_tokens` (`000_postgresql_schema.ts:L49-L128`, `002_add_email_change_tokens.ts:L8-L24`)
    - Billing: `wallets`, `topups`, `ledger_entries`, `wallet_ledger`, `promo_redemptions` (`000_postgresql_schema.ts:L392-L485`, `046_add_message_billing_idempotency_index.ts:L12-L38`)
    - Connectors: `connectors`, `connector_templates`, `platform_secrets` (`008_add_starship_connectors.ts:L9-L37`, `027_add_connector_templates.ts:L18-L45`, `032_add_platform_secrets.ts:L18-L33`)
    - Scheduling: `schedules` + later ALTERs (`023_add_schedules_table.ts:L13-L33`, `024_add_is_recurring_to_schedules.ts:L13-L15`, `025_add_schedule_end_fields.ts:L16-L20`, `030_add_schedule_owner_user_id.ts:L14-L16`)
    - Widgets: `widgets` (`010_add_widgets_table.ts:L12-L30`)
    - Tool approvals: `tool_call_approvals` (`050_add_tool_call_approvals.ts:L11-L32`)
- **Claimed (docs)**
  - `docs/er-diagram.md` presents an “actual implemented database schema” but only includes a subset of tables: `docs/er-diagram.md:L1-L207`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Update `docs/er-diagram.md` to include the missing tables and relationships, or rename it to explicitly indicate it is a “core subset”.

### M3 — ER diagram includes `waitlist`, but no schema migration creates it (and no repository/entity exists)
- **Actual (code)**
  - No `CREATE TABLE waitlist` exists in `packages/models/src/migrations` (confirmed by search during audit).
  - There is **no** `WaitlistEntity.ts` in `packages/models/src/entities/` and **no** `WaitlistRepository.ts` in `packages/models/src/repositories/` (tree snapshot).
- **Claimed (docs)**
  - `docs/er-diagram.md` includes `waitlist` table: `docs/er-diagram.md:L152-L158`.
  - `packages/models/README.md` lists `WaitlistRepository` as available: `packages/models/README.md:L98-L103`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Either (A) re-introduce `waitlist` migration + entity + repository, or (B) remove `waitlist` from docs and repository listing.

### M4 — `environments` table name is no longer canonical; code uses `connector_secrets`
- **Actual (code)**
  - DB rename: `packages/models/src/migrations/034_rename_environments_to_connector_secrets.ts:L51-L76`.
  - Entity explicitly models connector secrets: `packages/models/src/entities/ConnectorSecretEntity.ts:L1-L6`.
- **Claimed (docs)**
  - ER diagram still documents `environments`: `docs/er-diagram.md:L126-L136`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Update `docs/er-diagram.md` to rename the table to `connector_secrets` and show the optional relationship to `connectors` (added in `008_add_starship_connectors.ts:L33-L42`).

### M5 — Starship entitlement columns exist in code, but ER diagram omits them
- **Actual (code)**
  - `starships.ship_class` + `starships.max_concurrent_turns` added by migration: `053_add_ship_class_subscriptions_and_concurrency.ts:L24-L32`.
  - `ship_class` expanded to include `cruiser`: `054_add_cruiser_ship_class.ts:L34-L38`.
  - Entity requires `shipClass` + `maxConcurrentTurns`: `packages/models/src/entities/StarshipEntity.ts:L55-L70`.
- **Claimed (docs)**
  - `docs/er-diagram.md` only lists `max_agents` and no ship class / concurrency: `docs/er-diagram.md:L24-L33`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Add `ship_class` and `max_concurrent_turns` (and optional `starship_subscriptions` / `starship_turn_leases`) to ER diagram.

### M6 — `usage.provider` is documented but does not exist in the implemented base schema
- **Actual (code)**
  - `usage` table columns in base schema do **not** include `provider`: `packages/models/src/migrations/000_postgresql_schema.ts:L362-L374`.
- **Claimed (docs)**
  - ER diagram lists `usage.provider`: `docs/er-diagram.md:L139-L150`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Either add a `provider` column via migration (if needed by analytics) or remove it from `docs/er-diagram.md`.

### M7 — Tags type mismatch: docs say JSONB; schema uses TEXT[]
- **Actual (code)**
  - `agent_templates.tags` is `TEXT[]` in base schema: `packages/models/src/migrations/000_postgresql_schema.ts:L163-L170`.
  - `tool_templates.tags` is `TEXT[]` in base schema: `packages/models/src/migrations/000_postgresql_schema.ts:L233-L239`.
- **Claimed (docs)**
  - ER diagram claims `agent_templates.tags` and `tool_templates.tags` are `jsonb`: `docs/er-diagram.md:L44-L45` and `docs/er-diagram.md:L82-L83`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Update the ER diagram types to `text[]` (or migrate to JSONB if that was the original design intent).

### M8 — Temperature type drift: docs claim DECIMAL, but migrations convert to DOUBLE PRECISION
- **Actual (code)**
  - Base schema uses `DECIMAL(3,2)`: `packages/models/src/migrations/000_postgresql_schema.ts:L166-L167` and `:L193-L195`.
  - Migration converts to `DOUBLE PRECISION`: `packages/models/src/migrations/018_change_agent_temperature_to_double.ts:L10-L21`.
- **Claimed (docs)**
  - ER diagram lists `decimal temperature`: `docs/er-diagram.md:L47-L48` and `docs/er-diagram.md:L60-L61`.
- **Severity**: **MINOR**
- **Recommended fix**
  - Update diagram to `double precision` (or `float8`) for `agents.temperature` and `agent_templates.temperature`.

### M9 — Tool template linkage columns renamed/split, but ER diagram still uses legacy `template_id`
- **Actual (code)**
  - Tools base schema: `template_id` exists: `000_postgresql_schema.ts:L263-L267`.
  - Migration renames to `source_template_id` + adds `published_template_id`: `042_add_tool_published_template_id_and_rename_template_id.ts:L20-L67`.
  - Entity models `sourceTemplateId` and `publishedTemplateId`: `packages/models/src/entities/ToolEntity.ts:L39-L51`.
- **Claimed (docs)**
  - ER diagram claims tools has `template_id`: `docs/er-diagram.md:L96-L97`.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Update ER diagram to reflect `source_template_id` + `published_template_id` and their semantics.

### M10 — Ledger tables: docs don’t cover the ledger split, and code no longer writes to `ledger_entries`
- **Actual (code)**
  - Base schema creates `ledger_entries`: `000_postgresql_schema.ts:L434-L460`.
  - Migration creates `wallet_ledger`: `046_add_message_billing_idempotency_index.ts:L12-L38`.
  - Repository writes to `wallet_ledger`: `packages/models/src/repositories/LedgerRepository.ts:L33-L71`.
- **Claimed (docs)**
  - No mention in `docs/er-diagram.md`; and naming in migration 046 suggests “message billing idempotency” but actually introduces a new ledger table.
- **Severity**: **MAJOR**
- **Recommended fix**
  - Add `wallet_ledger` (and its relationship to `wallets`) to ER diagram + document whether `ledger_entries` is legacy-only (and if/when it can be removed).

### M11 — `schema-validator.ts` expects a removed table (`workflows`)
- **Actual (code)**
  - Base schema explicitly notes workflows/blueprints/executions are removed: `packages/models/src/migrations/000_postgresql_schema.ts:L282-L286`.
  - `SchemaValidator` still expects `workflows` as a “core table”: `packages/models/src/scripts/schema-validator.ts:L86-L88`.
- **Claimed (docs)**
  - ER diagram similarly claims “workflows removed”: `docs/er-diagram.md:L7-L8` and `docs/er-diagram.md:L271-L292`.
- **Severity**: **MAJOR** (schema validation tool will falsely report failures)
- **Recommended fix**
  - Update `expectedTables` in `schema-validator.ts` to reflect the current canonical table set.

### M12 — Global slug uniqueness likely contradicts “scoped uniqueness” semantics
- **Actual (code)**
  - `tools` has both `UNIQUE(starship_id, slug)` and a global unique index on `slug`: `000_postgresql_schema.ts:L269-L278`.
  - `agents` has a global unique index on `slug`: `000_postgresql_schema.ts:L213-L214`.
- **Claimed (docs)**
  - Starships explicitly documents scoping for `starships.slug` (“unique per owner”): `docs/er-diagram.md:L26-L27`.
  - Tools are described as “instances live on a starship” (root README): `README.md:L11-L13`, which typically implies scoping.
- **Severity**: **MAJOR** (can block multi-tenant reuse of slugs; affects UX + API semantics)
- **Recommended fix**
  - Decide desired behavior:
    - If slugs should be **starship-scoped**, drop global unique indexes on `agents.slug` and `tools.slug`.
    - If slugs should be **global**, remove/avoid documentation implying per-starship scoping and ensure APIs reflect global uniqueness.

---

## 4) Highest-impact recommended doc updates (short list)

1. **Update `docs/er-diagram.md`** to include missing tables (auth tokens, billing/credits, connectors, schedules, widgets, approvals) and correct types (`tags`, `temperature`, `usage.provider`, tool template linkage).
2. **Fix `MIGRATION_SPEC.md`** to match the TS migration runner (no `.sql` schema file flow).
3. **Remove or reintroduce `waitlist`** consistently across docs and code.
4. **Fix `schema-validator.ts` expected tables** to avoid false negatives.

