import type { Client } from 'pg';

type IndexInfo = { is_unique: boolean };
type DupRow = { starship_id: string; slug: string; cnt: number | string };

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 128: Enforce view slug uniqueness per starship.
 *
 * Fixes a TOCTOU race in slug generation by enforcing a DB-level constraint:
 * - UNIQUE (starship_id, slug)
 *
 * Note:
 * - Migration 082 was updated to create a UNIQUE index for fresh installs.
 * - This migration upgrades existing DBs where idx_views_starship_slug may already exist as non-unique.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const idxRes = await client.query<IndexInfo>(`
      SELECT i.indisunique as is_unique
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_index i ON i.indexrelid = c.oid
       WHERE n.nspname = 'public'
         AND c.relname = 'idx_views_starship_slug'
       LIMIT 1;
    `);
    const idxRows = toRows<IndexInfo>(idxRes as unknown);
    if (idxRows.length && idxRows[0]?.is_unique === true) {
      await client.query('COMMIT');
      return;
    }

    // Fail fast if duplicates already exist (we should not silently drop/rename user-facing slugs).
    const dupRes = await client.query<DupRow>(`
      SELECT starship_id, slug, COUNT(*) as cnt
        FROM views
       GROUP BY starship_id, slug
      HAVING COUNT(*) > 1
       LIMIT 10;
    `);
    const dups = toRows<DupRow>(dupRes as unknown);
    if (dups.length) {
      const sample = dups
        .map((d) => `${String(d.starship_id)}:${String(d.slug)} (count=${String(d.cnt)})`)
        .join(', ');
      throw new Error(`Cannot add UNIQUE (starship_id, slug) to views: duplicates exist. Sample: ${sample}`);
    }

    // Replace the index with a UNIQUE index (same name).
    await client.query(`DROP INDEX IF EXISTS idx_views_starship_slug;`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_views_starship_slug ON views(starship_id, slug);`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort rollback: revert to non-unique index (matches pre-128 behavior).
    await client.query(`DROP INDEX IF EXISTS idx_views_starship_slug;`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_views_starship_slug ON views(starship_id, slug);`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

