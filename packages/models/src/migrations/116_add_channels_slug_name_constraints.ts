import type { Client } from 'pg';

/**
 * Migration 116: Enforce channel slug/name constraints at the DB level.
 *
 * Goals:
 * - `channels.slug`: lowercase, URL-safe, hyphen-only; 1..100 chars
 * - `channels.name`: trimmed (no leading/trailing whitespace); non-empty; 1..100 chars
 *
 * Notes:
 * - Older deployments allowed underscores in slugs via API validation. This migration
 *   normalizes existing data (_ -> - and lowercase) before adding CHECK constraints.
 * - If normalization would create collisions, we deterministically suffix with `-2`, `-3`, etc
 *   per starship to preserve uniqueness (existing unique index is case-insensitive already).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1) Normalize existing names (trim) and ensure they aren't whitespace-only.
    await client.query(`
      UPDATE channels
         SET name = btrim(name),
             updated_at = NOW()
       WHERE name IS NOT NULL
         AND name <> btrim(name);
    `);

    await client.query(`
      UPDATE channels
         SET name = slug,
             updated_at = NOW()
       WHERE btrim(COALESCE(name, '')) = '';
    `);

    // 2) Normalize existing slugs:
    // - lowercase
    // - underscores/spaces/periods -> hyphen
    // - strip everything except [a-z0-9-]
    // - collapse hyphens
    // - trim hyphens at edges
    //
    // Also resolve collisions deterministically per starship by suffixing with -2, -3, ...
    // (Conversation id is the PK, so it's a stable tie-breaker.)
    await client.query(`
      WITH normalized AS (
        SELECT
          conversation_id,
          starship_id,
          created_at,
          -- Base normalization
          NULLIF(
            btrim(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(lower(COALESCE(slug, '')), '[\\s\\._]+', '-', 'g'),
                    '[^a-z0-9-]+', '', 'g'
                  ),
                  '-+', '-', 'g'
                ),
                '^-+|-+$', '', 'g'
              ),
              '-'
            ),
            ''
          ) AS base_slug
        FROM channels
      ),
      with_base AS (
        SELECT
          conversation_id,
          starship_id,
          created_at,
          COALESCE(base_slug, 'channel') AS base_slug
        FROM normalized
      ),
      ranked AS (
        SELECT
          conversation_id,
          starship_id,
          created_at,
          base_slug,
          row_number() OVER (PARTITION BY starship_id, base_slug ORDER BY created_at ASC, conversation_id ASC) AS rn
        FROM with_base
      ),
      desired AS (
        SELECT
          conversation_id,
          CASE
            WHEN rn = 1 THEN
              CASE
                WHEN length(base_slug) <= 100 THEN base_slug
                ELSE btrim(regexp_replace(substr(base_slug, 1, 100), '-+$', ''), '-')
              END
            ELSE
              -- Ensure we have space for the suffix "-<rn>"
              (
                btrim(
                  regexp_replace(
                    CASE
                      WHEN length(base_slug) <= (100 - (1 + length(rn::text))) THEN base_slug
                      ELSE substr(base_slug, 1, (100 - (1 + length(rn::text))))
                    END,
                    '-+$',
                    ''
                  ),
                  '-'
                )
              ) || '-' || rn::text
          END AS desired_slug
        FROM ranked
      )
      UPDATE channels c
         SET slug = d.desired_slug,
             updated_at = NOW()
        FROM desired d
       WHERE c.conversation_id = d.conversation_id
         AND c.slug <> d.desired_slug;
    `);

    // 3) Add DB-level CHECK constraints (idempotent).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_channels_slug_format'
        ) THEN
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_slug_format
            CHECK (
              length(slug) BETWEEN 1 AND 100
              AND slug = lower(slug)
              AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
            );
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint
           WHERE conname = 'ck_channels_name_trimmed'
        ) THEN
          ALTER TABLE channels
            ADD CONSTRAINT ck_channels_name_trimmed
            CHECK (
              length(name) BETWEEN 1 AND 100
              AND name = btrim(name)
            );
        END IF;
      END $$;
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_name_trimmed;');
    await client.query('ALTER TABLE channels DROP CONSTRAINT IF EXISTS ck_channels_slug_format;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

