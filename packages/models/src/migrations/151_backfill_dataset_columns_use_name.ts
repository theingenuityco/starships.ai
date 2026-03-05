import type { Client } from 'pg';

/**
 * Migration 151: Backfill dataset columns to use `{ name }` only.
 *
 * Prior schema stored columns as `{ key, label, ... }`. The app now expects:
 * - columns_json: [{ name, format?, type? }]
 *
 * This migration rewrites existing `starship_datasets.columns_json` rows:
 * - name = key (preferred) OR label if key is missing
 * - removes key/label fields
 * - drops any column objects that cannot produce a valid name
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      UPDATE starship_datasets
         SET columns_json = (
           SELECT COALESCE(jsonb_agg(
             jsonb_strip_nulls(
               (c - 'key' - 'label')
               || jsonb_build_object(
                 'name',
                 CASE
                   WHEN (c ? 'name') AND NULLIF(BTRIM(c->>'name'), '') IS NOT NULL THEN BTRIM(c->>'name')
                   WHEN (c ? 'key')  AND NULLIF(BTRIM(c->>'key'),  '') IS NOT NULL THEN BTRIM(c->>'key')
                   WHEN (c ? 'label')AND NULLIF(BTRIM(c->>'label'), '') IS NOT NULL THEN BTRIM(c->>'label')
                   ELSE NULL
                 END
               )
             )
           ) FILTER (
             WHERE
               (
                 (c ? 'name') AND NULLIF(BTRIM(c->>'name'), '') IS NOT NULL
               ) OR (
                 (c ? 'key')  AND NULLIF(BTRIM(c->>'key'),  '') IS NOT NULL
               ) OR (
                 (c ? 'label')AND NULLIF(BTRIM(c->>'label'), '') IS NOT NULL
               )
           ), '[]'::jsonb)
           FROM jsonb_array_elements(COALESCE(columns_json, '[]'::jsonb)) AS c
         ),
             updated_at = NOW()
       WHERE columns_json IS NOT NULL
         AND jsonb_typeof(columns_json) = 'array';
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  // Non-destructive down migration (we intentionally removed information like label).
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

