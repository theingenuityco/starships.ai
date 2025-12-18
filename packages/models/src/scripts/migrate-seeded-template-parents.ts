#!/usr/bin/env node

/**
 * Backfill "parent" Agents for seeded AgentTemplates.
 *
 * Context:
 * - Normal workflow: Agent is created on a Starship → published to Marketplace as an AgentTemplate.
 *   The publish step links Agent → AgentTemplate via agents.published_template_id.
 * - Seeders create AgentTemplate rows directly (marketplace) without any parent Agent.
 *
 * What this script does:
 * - Given a target Starship (by slug or id), ensures each *seeded* AgentTemplate has a parent Agent:
 *   - Checks if any Agent already exists with published_template_id = template.id.
 *   - If missing, creates an Agent on the target starship that mirrors the template fields and
 *     marks it as published into that template (publishedTemplateId = template.id).
 *
 * Idempotent:
 * - Safe to run multiple times; it only creates parent agents for templates missing a parent.
 */

import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { AgentRepository } from '@/repositories/AgentRepository';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { ALL_AGENT_TEMPLATES } from '@/seeders/agents';
import { generateUniqueAgentSlug } from '@/utils/slugGenerator';

type Args = {
  starshipSlug?: string;
  starshipId?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const out: Args = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') {
      out.dryRun = true;
      continue;
    }
    if (a.startsWith('--starship-slug=')) {
      out.starshipSlug = a.split('=')[1];
      continue;
    }
    if (a === '--starship-slug' && args[i + 1] && !args[i + 1].startsWith('-')) {
      out.starshipSlug = args[i + 1];
      i++;
      continue;
    }
    if (a.startsWith('--starship-id=')) {
      out.starshipId = a.split('=')[1];
      continue;
    }
    if (a === '--starship-id' && args[i + 1] && !args[i + 1].startsWith('-')) {
      out.starshipId = args[i + 1];
      i++;
      continue;
    }
  }

  // Back-compat: allow passing slug as first positional arg
  const positional = args.filter((x) => !x.startsWith('-'));
  if (!out.starshipSlug && !out.starshipId && positional[0]) {
    out.starshipSlug = positional[0];
  }

  return out;
}

type StarshipRow = {
  id: string;
  slug: string;
  owner_id: string;
  name: string;
};

async function resolveTargetStarship(db: ReturnType<typeof createConnection>, args: Args): Promise<StarshipRow> {
  if (args.starshipId) {
    const row = await db.queryOne<StarshipRow>('SELECT id, slug, owner_id, name FROM starships WHERE id = $1', [args.starshipId]);
    if (!row) {
      throw new Error(`Starship not found by id: ${args.starshipId}`);
    }
    return row;
  }

  if (!args.starshipSlug) {
    throw new Error('Missing required argument: provide --starship-slug <slug> (or --starship-id <id>)');
  }

  const rows =
    (await db.query<StarshipRow>('SELECT id, slug, owner_id, name FROM starships WHERE slug = $1 ORDER BY created_at DESC', [
      args.starshipSlug,
    ])) || [];

  if (rows.length === 0) {
    throw new Error(`Starship not found by slug: ${args.starshipSlug}`);
  }

  // Slug is only unique per owner. If collisions exist, force operator to disambiguate.
  if (rows.length > 1) {
    const options = rows.map((r) => `${r.id} (owner_id=${r.owner_id}, name="${r.name}")`).join(', ');
    throw new Error(
      `Starship slug "${args.starshipSlug}" matched multiple rows (${rows.length}). Re-run with --starship-id. Matches: ${options}`
    );
  }

  return rows[0];
}

type ParentCheckRow = { id: string; slug: string; starship_id: string | null };

export async function migrateSeededTemplateParents(args: Args): Promise<void> {
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

  const startedAt = Date.now();
  const seededSlugs = [...new Set(ALL_AGENT_TEMPLATES.map((t) => String(t.slug)).filter(Boolean))];

  logger.info(`Starting seeded template parent backfill (${args.dryRun ? 'dry-run' : 'apply'})`, {
    component: 'migrate-seeded-template-parents',
    metadata: { seededTemplateCount: seededSlugs.length, starshipSlug: args.starshipSlug, starshipId: args.starshipId },
  });

  try {
    const target = await resolveTargetStarship(db, args);
    logger.info(`Target starship resolved: ${target.name} (${target.slug})`, {
      component: 'migrate-seeded-template-parents',
      metadata: { starshipId: target.id, ownerId: target.owner_id },
    });

    const agentRepo = new AgentRepository();
    const templateRepo = new AgentTemplateRepository();

    let templatesFound = 0;
    let alreadyHadParent = 0;
    let parentsCreated = 0;
    let skippedMissingTemplate = 0;
    let errors = 0;

    for (const slug of seededSlugs) {
      try {
        const template = await templateRepo.findBySlug(slug);
        if (!template) {
          skippedMissingTemplate++;
          logger.warn(`Seeded template slug missing from DB: ${slug}`, {
            component: 'migrate-seeded-template-parents',
            operation: 'loadTemplate',
            metadata: { slug },
          });
          continue;
        }
        templatesFound++;

        const existingParent = await db.queryOne<ParentCheckRow>(
          'SELECT id, slug, starship_id FROM agents WHERE published_template_id = $1 LIMIT 1',
          [template.id]
        );

        if (existingParent) {
          alreadyHadParent++;
          logger.debug(`Template already has parent agent: ${template.slug} → ${existingParent.slug}`, {
            component: 'migrate-seeded-template-parents',
            metadata: { templateId: template.id, agentId: existingParent.id, agentStarshipId: existingParent.starship_id },
          });
          continue;
        }

        const now = new Date().toISOString();

        // Prefer using the template slug verbatim for the "parent" when available.
        // If taken, fall back to the normal unique slug pattern ({base}-{suffix}).
        let agentSlug = template.slug;
        const slugTaken = await agentRepo.findBySlug(agentSlug);
        if (slugTaken) {
          agentSlug = await generateUniqueAgentSlug(template.slug, agentRepo);
        }

        if (args.dryRun) {
          parentsCreated++;
          logger.info(`[DRY-RUN] Would create parent agent for template "${template.slug}" on starship ${target.slug}`, {
            component: 'migrate-seeded-template-parents',
            metadata: { templateId: template.id, plannedAgentSlug: agentSlug, starshipId: target.id },
          });
          continue;
        }

        const created = await agentRepo.create(
          {
            name: template.name,
            slug: agentSlug,
            description: template.description,
            model: template.model,
            category: template.category,
            temperature: template.temperature,
            maxTokens: template.maxTokens,
            timeout: template.timeout,
            systemPrompt: template.systemPrompt,
            state: template.state,
            blueprint: template.blueprint,
            previewPrompts: template.previewPrompts,
            version: template.version,
            templateSnapshotAt: now,
          },
          target.id
        );

        const published = await agentRepo.update(created.id, {
          version: template.version,
          templateSnapshotAt: now,
          publicationStatus: 'published',
          publicationApprovedBy: 'system',
          publicationApprovedAt: now,
          publishedTemplateId: template.id,
          publicationChangelog: 'Backfilled parent agent for seeded marketplace template',
        });

        if (!published) {
          throw new Error(`Failed to update created agent ${created.id} with publishedTemplateId`);
        }

        parentsCreated++;
        logger.info(`✅ Created parent agent for template "${template.slug}" as "${published.slug}"`, {
          component: 'migrate-seeded-template-parents',
          metadata: { templateId: template.id, agentId: published.id, agentSlug: published.slug, starshipId: target.id },
        });
      } catch (e) {
        errors++;
        logger.warn(
          `Failed processing seeded template slug "${slug}"`,
          { component: 'migrate-seeded-template-parents', operation: 'processTemplate', metadata: { slug } },
          e as Error
        );
      }
    }

    logger.info('═══════════════════════════════════════════════════════════');
    logger.info('Seeded Template Parent Backfill Summary:', { component: 'migrate-seeded-template-parents' });
    logger.info(`  Seeded template slugs: ${seededSlugs.length}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Templates found in DB: ${templatesFound}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Missing templates skipped: ${skippedMissingTemplate}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Already had parent: ${alreadyHadParent}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Parent agents created: ${parentsCreated}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Errors: ${errors}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Duration: ${Date.now() - startedAt}ms`, { component: 'migrate-seeded-template-parents' });
    logger.info('═══════════════════════════════════════════════════════════');
  } finally {
    try {
      await db.disconnect();
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  migrateSeededTemplateParents(args)
    .then(() => process.exit(0))
    .catch((err) => {
      // Prefer a clean, operator-friendly message in CLI usage
      // eslint-disable-next-line no-console
      console.error('❌ Seeded template parent backfill failed:', err?.message || err);
      process.exit(1);
    });
}
