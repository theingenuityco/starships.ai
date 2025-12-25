#!/usr/bin/env node

/**
 * Migrate ONLY tool blueprints from code seeders into:
 * - tool_templates.blueprint
 * - tools.blueprint
 *
 * Important notes:
 * - Seeder slug is a *partial* of tool/template slugs:
 *   - tool instances: {templateSlug}-{randomSuffix}
 *   - template duplicates: {templateSlug}-2, {templateSlug}-3, ...
 * - This script ONLY updates the blueprint field (and updated_at) — no other fields.
 * - Idempotent: skips rows whose blueprint already matches the seeder blueprint.
 *
 * Usage:
 * - All slugs (apply): pnpm --filter @starships/models migrate:tool-blueprints
 * - Dry run:          pnpm --filter @starships/models migrate:tool-blueprints --dry-run
 * - Specific slugs:   pnpm --filter @starships/models migrate:tool-blueprints get-tool list-tools
 */

import { getEnvConfig } from '@starships/env';
import { createConnection, type PostgresConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { ALL_TOOL_TEMPLATES } from '@/seeders/tools';
import type { Blueprint } from '@starships/autopilot';

type Row = { id: string; slug: string; blueprint: unknown | null };

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const stringify = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(stringify);
    const obj = v as Record<string, unknown>;
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = stringify(obj[k]);
    return out;
  };
  return JSON.stringify(stringify(value));
}

function blueprintsEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function parseArgs(argv: string[]): { dryRun: boolean; slugs?: string[] } {
  const dryRun = argv.includes('--dry-run') || argv.includes('--dryrun');
  const slugs = argv
    .filter((a) => !a.startsWith('--'))
    .map((s) => s.trim())
    .filter(Boolean);
  return { dryRun, slugs: slugs.length > 0 ? slugs : undefined };
}

async function migrateBlueprintsForSlug(
  db: PostgresConnection,
  seederSlug: string,
  blueprint: Blueprint,
  dryRun: boolean
): Promise<{
  templatesMatched: number;
  templatesUpdated: number;
  toolsMatched: number;
  toolsUpdated: number;
}> {
  // Match exact or "{slug}-*" variants; avoid matching "slugXYZ" without delimiter.
  const likePrefix = `${seederSlug}-%`;

  // Note: We intentionally accept both template duplicates (slug-2, slug-3, ...)
  // and tool instances (slug-xxxx suffix).
  const templates = await db.query<Row>('SELECT id, slug, blueprint FROM tool_templates WHERE slug = $1 OR slug LIKE $2', [
    seederSlug,
    likePrefix,
  ]);
  const tools = await db.query<Row>('SELECT id, slug, blueprint FROM tools WHERE slug = $1 OR slug LIKE $2', [seederSlug, likePrefix]);

  let templatesUpdated = 0;
  for (const row of templates) {
    if (blueprintsEqual(row.blueprint, blueprint)) continue;
    templatesUpdated++;
    if (!dryRun) {
      await db.query('UPDATE tool_templates SET blueprint = $2, updated_at = NOW() WHERE id = $1', [row.id, blueprint]);
    }
  }

  let toolsUpdated = 0;
  for (const row of tools) {
    if (blueprintsEqual(row.blueprint, blueprint)) continue;
    toolsUpdated++;
    if (!dryRun) {
      await db.query('UPDATE tools SET blueprint = $2, updated_at = NOW() WHERE id = $1', [row.id, blueprint]);
    }
  }

  return {
    templatesMatched: templates.length,
    templatesUpdated,
    toolsMatched: tools.length,
    toolsUpdated,
  };
}

export async function migrateToolBlueprintsFromSeeders(options?: { dryRun?: boolean; slugs?: string[] }): Promise<void> {
  const dryRun = !!options?.dryRun;
  const targetSlugs = options?.slugs?.length ? new Set(options.slugs) : null;

  const seeded = ALL_TOOL_TEMPLATES.map((t) => ({
    seederSlug: String((t as { slug?: unknown }).slug || '').trim(),
    blueprint: (t as { blueprint?: Blueprint }).blueprint,
  }))
    .filter((t) => t.seederSlug.length > 0)
    .filter((t) => (targetSlugs ? targetSlugs.has(t.seederSlug) : true))
    .filter((t): t is { seederSlug: string; blueprint: Blueprint } => !!t.blueprint && typeof t.blueprint === 'object');

  if (seeded.length === 0) {
    logger.warn('No tool seeders matched the provided slug filters; nothing to do.', {
      component: 'migrate-tool-blueprints',
      metadata: {
        dryRun,
        requestedSlugs: options?.slugs || [],
      },
    });
    return;
  }

  const env = getEnvConfig();
  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await db.connect();

  try {
    logger.info('Starting tool blueprint migration (seeders -> tools + tool_templates)...', {
      component: 'migrate-tool-blueprints',
      metadata: {
        dryRun,
        seederCount: seeded.length,
      },
    });

    let totalTemplatesMatched = 0;
    let totalTemplatesUpdated = 0;
    let totalToolsMatched = 0;
    let totalToolsUpdated = 0;

    for (const s of seeded) {
      const stats = await migrateBlueprintsForSlug(db, s.seederSlug, s.blueprint, dryRun);
      totalTemplatesMatched += stats.templatesMatched;
      totalTemplatesUpdated += stats.templatesUpdated;
      totalToolsMatched += stats.toolsMatched;
      totalToolsUpdated += stats.toolsUpdated;

      logger.info('Processed seeder blueprint', {
        component: 'migrate-tool-blueprints',
        metadata: {
          slug: s.seederSlug,
          templatesMatched: stats.templatesMatched,
          templatesUpdated: stats.templatesUpdated,
          toolsMatched: stats.toolsMatched,
          toolsUpdated: stats.toolsUpdated,
        },
      });
    }

    logger.info('✅ Tool blueprint migration complete', {
      component: 'migrate-tool-blueprints',
      metadata: {
        dryRun,
        totalSeeders: seeded.length,
        totalTemplatesMatched,
        totalTemplatesUpdated,
        totalToolsMatched,
        totalToolsUpdated,
      },
    });
  } finally {
    try {
      await db.disconnect();
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  const { dryRun, slugs } = parseArgs(process.argv.slice(2));
  migrateToolBlueprintsFromSeeders({ dryRun, slugs })
    .then(() => process.exit(0))
    .catch((err) => {
      // Keep CLI output succinct; details should already be in logs.
      console.error('❌ Tool blueprint migration failed:', err?.message || err);
      process.exit(1);
    });
}
