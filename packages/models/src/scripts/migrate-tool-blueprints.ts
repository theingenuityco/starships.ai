#!/usr/bin/env node

/**
 * Migrate seeded tool "blueprint + safe fields" from code seeders into:
 * - tool_templates.{name,description,parameters,blueprint,transforms,mutations,condition,category,example_usage,requires_api_key,configuration_fields}
 * - tools.{name,description,parameters,blueprint,transforms,mutations,condition}
 *
 * Important notes:
 * - Seeder slug is a *partial* of tool/template slugs:
 *   - template duplicates: {templateSlug}-2, {templateSlug}-3, ...
 * - Tool INSTANCE slugs are generated from tool name (incremental suffix), so this script
 *   does NOT use tool slugs for matching; it uses tool template linkage instead.
 * - This script intentionally does NOT touch:
 *   - id, slug, version
 *   - DB/instance-owned fields (tools.starship_id, tools.configuration, tools.is_enabled, tools.status, publication fields, template links, etc.)
 * - Always-write: updates all matched rows (no comparisons).
 *
 * Usage:
 * - All slugs (apply): pnpm --filter @starships/models migrate:tool-blueprints
 * - Dry run:          pnpm --filter @starships/models migrate:tool-blueprints --dry-run
 * - Specific slugs:   pnpm --filter @starships/models migrate:tool-blueprints get-tool list-tools
 * - Debug logs:       pnpm --filter @starships/models migrate:tool-blueprints --debug
 */

import { getEnvConfig } from '@starships/env';
import { createConnection, type PostgresConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { ALL_TOOL_TEMPLATES } from '@/seeders/tools';
import type { Blueprint } from '@starships/autopilot';

type ToolTemplateRow = {
  id: string;
  slug: string;
  name: string | null;
  description: string | null;
  parameters: unknown | null;
  blueprint: unknown | null;
  transforms: unknown | null;
  mutations: unknown | null;
  condition: string | null;
  category: string | null;
  example_usage: string | null;
  requires_api_key: boolean | null;
  configuration_fields: unknown | null;
};

type ToolRow = {
  id: string;
  slug: string;
  name: string | null;
  description: string | null;
  parameters: unknown | null;
  blueprint: unknown | null;
  transforms: unknown | null;
  mutations: unknown | null;
  condition: string | null;
};

type SeededToolFields = {
  // ToolParams-ish fields
  name: string | undefined;
  description: string | undefined;
  parameters: unknown;
  blueprint: Blueprint | undefined;
  transforms: unknown;
  mutations: unknown;
  condition: string | undefined;

  // Template-only metadata (safe to sync)
  category: string | undefined;
  exampleUsage: string | undefined;
  requiresApiKey: boolean | undefined;
  configurationFields: unknown;
};

type SeededToolFieldsWithBlueprint = Omit<SeededToolFields, 'blueprint'> & { blueprint: Blueprint };

async function resolveToolTemplateLinkColumns(db: PostgresConnection): Promise<{
  sourceColumn: 'source_template_id' | 'template_id' | null;
  publishedColumn: 'published_template_id' | null;
}> {
  const cols = await db.query<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tools'
    `
  );
  const set = new Set(cols.map((c) => String(c.column_name)));
  const sourceColumn = set.has('source_template_id') ? 'source_template_id' : set.has('template_id') ? 'template_id' : null;
  const publishedColumn = set.has('published_template_id') ? 'published_template_id' : null;
  return { sourceColumn, publishedColumn };
}

function parseArgs(argv: string[]): { dryRun: boolean; debug: boolean; slugs?: string[] } {
  const dryRun = argv.includes('--dry-run') || argv.includes('--dryrun');
  const debug = argv.includes('--debug') || argv.includes('--verbose') || argv.includes('-v');
  const slugs = argv
    .filter((a) => !a.startsWith('--'))
    .map((s) => s.trim())
    .filter(Boolean);
  return { dryRun, debug, slugs: slugs.length > 0 ? slugs : undefined };
}

async function migrateBlueprintsForSlug(
  db: PostgresConnection,
  seederSlug: string,
  seeded: SeededToolFieldsWithBlueprint,
  dryRun: boolean,
  debug: boolean
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
  const templates = await db.query<ToolTemplateRow>(
    `
    SELECT
      id, slug,
      name, description, parameters, blueprint, transforms, mutations, condition,
      category, example_usage, requires_api_key, configuration_fields
    FROM tool_templates
    WHERE slug = $1 OR slug LIKE $2
    `,
    [seederSlug, likePrefix]
  );

  // IMPORTANT:
  // Tool instance slugs are NOT guaranteed to be derived from the seeder slug.
  // The reliable linkage is via tool template IDs:
  // - tools.source_template_id (or legacy tools.template_id)
  // - tools.published_template_id (if present)
  const templateIds = templates.map((t) => t.id).filter((id) => typeof id === 'string' && id.length > 0);
  const { sourceColumn, publishedColumn } = await resolveToolTemplateLinkColumns(db);

  if (debug) {
    logger.info('🔎 Seeder match diagnostics', {
      component: 'migrate-tool-blueprints',
      metadata: {
        seederSlug,
        templatesMatched: templates.length,
        templateSlugsSample: templates.slice(0, 5).map((t) => t.slug),
        templateIdsCount: templateIds.length,
        templateIdsSample: templateIds.slice(0, 5),
        toolLinkSourceColumn: sourceColumn,
        toolLinkPublishedColumn: publishedColumn,
      },
    });
  }

  const tools =
    templateIds.length === 0 || !sourceColumn
      ? []
      : await db.query<ToolRow>(
          `
          SELECT
            id, slug,
            name, description, parameters, blueprint, transforms, mutations, condition
          FROM tools
          WHERE ${sourceColumn} = ANY($1)
          ${publishedColumn ? `OR ${publishedColumn} = ANY($1)` : ''}
          `,
          [templateIds]
        );

  if (debug) {
    logger.info('🔎 Tool match diagnostics', {
      component: 'migrate-tool-blueprints',
      metadata: {
        seederSlug,
        toolsMatched: tools.length,
        toolsSample: tools.slice(0, 5).map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
      },
    });
  } else if (templates.length > 0 && tools.length === 0) {
    logger.warn('No tools matched via template linkage for this seeder', {
      component: 'migrate-tool-blueprints',
      metadata: {
        seederSlug,
        templatesMatched: templates.length,
        templateSlugsSample: templates.slice(0, 5).map((t) => t.slug),
        toolLinkSourceColumn: sourceColumn,
        toolLinkPublishedColumn: publishedColumn,
        hint: 'This usually means existing tools are not linked to templates (source_template_id/template_id/published_template_id is NULL or points elsewhere).',
      },
    });
  }

  let templatesUpdated = 0;
  for (const row of templates) {
    // Always update ALL synced template fields (except version/id/slug/etc).
    const desired = {
      name: seeded.name ?? row.name,
      description: seeded.description ?? row.description,
      parameters: seeded.parameters ?? row.parameters,
      blueprint: seeded.blueprint,
      transforms: seeded.transforms ?? row.transforms,
      mutations: seeded.mutations ?? row.mutations,
      condition: seeded.condition ?? row.condition,
      category: seeded.category ?? row.category,
      example_usage: seeded.exampleUsage ?? row.example_usage,
      requires_api_key: seeded.requiresApiKey ?? row.requires_api_key,
      configuration_fields: seeded.configurationFields ?? row.configuration_fields,
    };
    templatesUpdated++;
    if (!dryRun) {
      await db.query(
        `
        UPDATE tool_templates
        SET
          name = $2,
          description = $3,
          parameters = $4,
          blueprint = $5,
          transforms = $6,
          mutations = $7,
          condition = $8,
          category = $9,
          example_usage = $10,
          requires_api_key = $11,
          configuration_fields = $12,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          row.id,
          desired.name,
          desired.description,
          desired.parameters,
          desired.blueprint,
          desired.transforms,
          desired.mutations,
          desired.condition,
          desired.category,
          desired.example_usage,
          desired.requires_api_key,
          desired.configuration_fields,
        ]
      );
    }
  }

  let toolsUpdated = 0;
  for (const row of tools) {
    // For tools, only sync the safe ToolParams surface. Never touch version/slug/starship/config/status/etc.
    const desired = {
      name: seeded.name ?? row.name,
      description: seeded.description ?? row.description,
      parameters: seeded.parameters ?? row.parameters,
      blueprint: seeded.blueprint,
      transforms: seeded.transforms ?? row.transforms,
      mutations: seeded.mutations ?? row.mutations,
      condition: seeded.condition ?? row.condition,
    };
    toolsUpdated++;
    if (!dryRun) {
      await db.query(
        `
        UPDATE tools
        SET
          name = $2,
          description = $3,
          parameters = $4,
          blueprint = $5,
          transforms = $6,
          mutations = $7,
          condition = $8,
          updated_at = NOW()
        WHERE id = $1
        `,
        [row.id, desired.name, desired.description, desired.parameters, desired.blueprint, desired.transforms, desired.mutations, desired.condition]
      );
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
    seeded: {
      name: (t as { name?: unknown }).name as string | undefined,
      description: (t as { description?: unknown }).description as string | undefined,
      parameters: (t as { parameters?: unknown }).parameters,
      blueprint: (t as { blueprint?: Blueprint }).blueprint,
      transforms: (t as { transforms?: unknown }).transforms,
      mutations: (t as { mutations?: unknown }).mutations,
      condition: (t as { condition?: unknown }).condition as string | undefined,
      category: (t as { category?: unknown }).category as string | undefined,
      exampleUsage: (t as { exampleUsage?: unknown }).exampleUsage as string | undefined,
      requiresApiKey: (t as { requiresApiKey?: unknown }).requiresApiKey as boolean | undefined,
      configurationFields: (t as { configurationFields?: unknown }).configurationFields,
    } satisfies SeededToolFields,
  }))
    .filter((t) => t.seederSlug.length > 0)
    .filter((t) => (targetSlugs ? targetSlugs.has(t.seederSlug) : true))
    .filter(
      (t): t is { seederSlug: string; seeded: SeededToolFieldsWithBlueprint } =>
        !!t.seeded?.blueprint && typeof t.seeded.blueprint === 'object'
    );

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
    // Log tool linkage columns once at startup (useful for debugging schema drift).
    const linkCols = await resolveToolTemplateLinkColumns(db);
    logger.info('Tool-template linkage columns detected', {
      component: 'migrate-tool-blueprints',
      metadata: linkCols,
    });

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
      const stats = await migrateBlueprintsForSlug(db, s.seederSlug, s.seeded, dryRun, false);
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
  const { dryRun, debug, slugs } = parseArgs(process.argv.slice(2));
  // Wire debug into the internal migration without changing external API shape.
  // (CLI-only: library callers can add debug later if needed.)
  const run = async () => {
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
      const targetSlugs = slugs?.length ? new Set(slugs) : null;
      const seeded = ALL_TOOL_TEMPLATES.map((t) => ({
        seederSlug: String((t as { slug?: unknown }).slug || '').trim(),
        seeded: {
          name: (t as { name?: unknown }).name as string | undefined,
          description: (t as { description?: unknown }).description as string | undefined,
          parameters: (t as { parameters?: unknown }).parameters,
          blueprint: (t as { blueprint?: Blueprint }).blueprint,
          transforms: (t as { transforms?: unknown }).transforms,
          mutations: (t as { mutations?: unknown }).mutations,
          condition: (t as { condition?: unknown }).condition as string | undefined,
          category: (t as { category?: unknown }).category as string | undefined,
          exampleUsage: (t as { exampleUsage?: unknown }).exampleUsage as string | undefined,
          requiresApiKey: (t as { requiresApiKey?: unknown }).requiresApiKey as boolean | undefined,
          configurationFields: (t as { configurationFields?: unknown }).configurationFields,
        } satisfies SeededToolFields,
      }))
        .filter((t) => t.seederSlug.length > 0)
        .filter((t) => (targetSlugs ? targetSlugs.has(t.seederSlug) : true))
        .filter(
          (t): t is { seederSlug: string; seeded: SeededToolFieldsWithBlueprint } =>
            !!t.seeded?.blueprint && typeof t.seeded.blueprint === 'object'
        );

      if (seeded.length === 0) {
        logger.warn('No tool seeders matched the provided slug filters; nothing to do.', {
          component: 'migrate-tool-blueprints',
          metadata: { dryRun, debug, requestedSlugs: slugs || [] },
        });
        return;
      }

      const linkCols = await resolveToolTemplateLinkColumns(db);
      logger.info('Tool-template linkage columns detected', { component: 'migrate-tool-blueprints', metadata: linkCols });

      logger.info('Starting tool migration (seeders -> tools + tool_templates)...', {
        component: 'migrate-tool-blueprints',
        metadata: { dryRun, debug, seederCount: seeded.length },
      });

      let totalTemplatesMatched = 0;
      let totalTemplatesUpdated = 0;
      let totalToolsMatched = 0;
      let totalToolsUpdated = 0;

      for (const s of seeded) {
        const stats = await migrateBlueprintsForSlug(db, s.seederSlug, s.seeded, dryRun, debug);
        totalTemplatesMatched += stats.templatesMatched;
        totalTemplatesUpdated += stats.templatesUpdated;
        totalToolsMatched += stats.toolsMatched;
        totalToolsUpdated += stats.toolsUpdated;
      }

      logger.info('✅ Tool migration complete', {
        component: 'migrate-tool-blueprints',
        metadata: {
          dryRun,
          debug,
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
  };

  run()
    .then(() => process.exit(0))
    .catch((err) => {
      // Keep CLI output succinct; details should already be in logs.
      console.error('❌ Tool blueprint migration failed:', err?.message || err);
      process.exit(1);
    });
}
