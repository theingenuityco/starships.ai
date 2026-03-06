import type { Client } from 'pg';

/**
 * Migration 174: Add `users.slug` for stable @mentions.
 *
 * - Adds `slug` column
 * - Backfills existing users with a unique slug derived from display_name or email local-part,
 *   using the same "template slug" strategy as agent_templates: `${base}-${rand4}` (always-on suffix)
 * - Enforces uniqueness + NOT NULL
 */
export async function up(client: Client): Promise<void> {
  // NOTE: Some installations have drifted schema where messages.metadata was referenced by server code
  // but never added. Keep this idempotent fix here to avoid requiring a separate migration number.
  await client.query(`
    ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  `);

  await client.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS slug VARCHAR(100);
  `);

  const getRows = <T>(result: unknown): T[] => {
    if (Array.isArray(result)) return result as T[];
    const anyRes = result as { rows?: unknown };
    return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
  };

  const slugify = (input: string): string =>
    String(input || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-');

  const generateRandomSuffix = (): string => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 4; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  };

  const rowsRes = await client.query<{
    id: string;
    display_name: string | null;
    email: string | null;
    slug: string | null;
  }>(`SELECT id, display_name, email, slug FROM users`);
  const rows = getRows<{ id: string; display_name: string | null; email: string | null; slug: string | null }>(rowsRes);
  const existingSlugs = new Set(
    rows
      .map((row) => (typeof row.slug === 'string' ? row.slug.trim() : ''))
      .filter((slug): slug is string => Boolean(slug))
  );

  const generateUniqueSlugRandomSuffix = async (baseSlug: string, maxLength = 100, maxAttempts = 100): Promise<string> => {
    const base = slugify(baseSlug) || 'user';
    const effectiveBase = base.slice(0, Math.max(1, Math.min(maxLength, base.length)));
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      const rand = generateRandomSuffix();
      const suffix = `-${rand}`;
      const candidate = `${effectiveBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
      if (!existingSlugs.has(candidate)) {
        existingSlugs.add(candidate);
        return candidate;
      }
    }
    const ts = Date.now().toString(36);
    const suffix = `-${ts}`;
    const candidate = `${effectiveBase.slice(0, Math.max(1, maxLength - suffix.length))}${suffix}`;
    existingSlugs.add(candidate);
    return candidate;
  };

  for (const r of Array.isArray(rows) ? rows : []) {
    const id = String(r.id || '').trim();
    if (!id) continue;
    const existing = typeof r.slug === 'string' ? String(r.slug).trim() : '';
    if (existing) continue;

    const base =
      (typeof r.display_name === 'string' && String(r.display_name).trim()) ||
      (typeof r.email === 'string' && String(r.email).trim().split('@')[0]) ||
      'user';
    const candidate = await generateUniqueSlugRandomSuffix(base, 100, 100);

    await client.query(`UPDATE users SET slug = $1 WHERE id = $2`, [candidate, id]);
  }

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_slug_unique
      ON users(slug);
  `);

  await client.query(`
    ALTER TABLE users
      ALTER COLUMN slug SET NOT NULL;
  `);
}

export async function down(client: Client): Promise<void> {
  await client.query(`
    ALTER TABLE users
      ALTER COLUMN slug DROP NOT NULL;
  `);
  await client.query(`
    DROP INDEX IF EXISTS idx_users_slug_unique;
  `);
  await client.query(`
    ALTER TABLE users
      DROP COLUMN IF EXISTS slug;
  `);

  // Best-effort revert (some deployments may already rely on this column).
  await client.query(`
    ALTER TABLE messages
      DROP COLUMN IF EXISTS metadata;
  `);
}

