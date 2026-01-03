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
import { ToolRepository } from '@/repositories/ToolRepository';
import { ToolTemplateRepository } from '@/repositories/ToolTemplateRepository';
import { ALL_AGENT_TEMPLATES } from '@/seeders/agents';

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
type ChildOnStarshipRow = { id: string; slug: string; deployed_at: string | null; created_at: string };
type ToolParentCheckRow = { id: string };

function toolSlugBaseFromName(name: string | undefined): string {
  // Must match ToolRepository.create() slug base logic exactly.
  return (name || 'tool')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

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

    // publication_approved_by is a FK → users(id). For publication flows we want
    // a real instance admin user id (mirrors the service-level approve logic).
    const instanceAdmin = await db.queryOne<{ id: string; email?: string | null }>(
      `
      SELECT id, email
      FROM users
      WHERE is_instance_admin = true
      ORDER BY created_at ASC
      LIMIT 1
      `
    );
    if (!instanceAdmin?.id) {
      throw new Error(
        'No instance admin user found (users.is_instance_admin = true). Create/mark an instance admin user first, then re-run.'
      );
    }
    const approverUserId = instanceAdmin.id;
    logger.info(`Using instance admin for publication approval`, {
      component: 'migrate-seeded-template-parents',
      metadata: { approverUserId, approverEmail: instanceAdmin.email ?? undefined },
    });

    const agentRepo = new AgentRepository();
    const templateRepo = new AgentTemplateRepository();
    const toolRepo = new ToolRepository();
    const toolTemplateRepo = new ToolTemplateRepository();

    let templatesFound = 0;
    let alreadyHadParent = 0;
    let promotedExisting = 0;
    let parentsCreated = 0;
    let toolsDeployed = 0;
    let toolsPromotedToParents = 0;
    let agentVersionsSynced = 0;
    let toolVersionsSynced = 0;
    let agentToolLinksEnsured = 0;
    let skippedMissingTemplate = 0;
    let errors = 0;

    for (const slug of seededSlugs) {
      try {
        // Use INTERNAL loader to ensure we have sensitive config fields (state/blueprint/systemPrompt)
        // required for creating parent agents.
        const template = await templateRepo.findInternalBySlug(slug);
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

        // assignedToolSlugs is populated from relationships by findInternalBySlug/findInternalById.
        const assignedToolTemplateSlugs = template.assignedToolSlugs || [];

        const now = new Date().toISOString();

        // Ensure tool instances exist on the target starship for every tool template
        // referenced by this AgentTemplate, and collect the deployed tool ids.
        const deployedToolIds: string[] = [];
        for (const toolTemplateSlug of assignedToolTemplateSlugs) {
          try {
            const toolTemplate = await toolTemplateRepo.findBySlug(toolTemplateSlug);
            if (!toolTemplate) {
              logger.warn(`Tool template not found by slug "${toolTemplateSlug}" (skipping)`, {
                component: 'migrate-seeded-template-parents',
                operation: 'loadToolTemplate',
                metadata: { toolTemplateSlug, starshipId: target.id, templateSlug: template.slug },
              });
              continue;
            }

            // Always ensure any existing "parent tool" for this template is on the same version.
            // Previously this script skipped syncing versions for already-existing parents.
            if (!args.dryRun) {
              const syncedParentTools =
                (await db.query<{ id: string }>(
                  `
                  UPDATE tools
                  SET
                    source_template_id = NULL,
                    template_snapshot_at = $3,
                    version = $2,
                    updated_at = NOW()
                  WHERE published_template_id = $1
                    AND (
                      version IS DISTINCT FROM $2 OR
                      template_snapshot_at IS NULL OR
                      source_template_id IS NOT NULL
                    )
                  RETURNING id
                  `,
                  [toolTemplate.id, toolTemplate.version, now]
                )) || [];
              toolVersionsSynced += syncedParentTools.length;
            }

            // Root cause of duplicates:
            // - Some tools exist on a starship but aren't linked via source_template_id
            // - Also, tool slugs are not guaranteed to be based on template slug; ToolRepository.create derives slugs from NAME.
            //
            // Therefore, we treat a tool as "already present" if we find ANY tool on the target starship that:
            // - is linked by source_template_id, OR
            // - is linked by published_template_id (already promoted), OR
            // - has a slug that starts with template.slug, OR
            // - has a slug that starts with baseFromName(template.name)
            const baseFromName = toolSlugBaseFromName(toolTemplate.name);
            const existingToolIdRow = await db.queryOne<{ id: string }>(
              `
              SELECT id
              FROM tools
              WHERE starship_id = $1
                AND (
                  source_template_id = $2 OR
                  published_template_id = $2 OR
                  slug LIKE $3 OR
                  slug LIKE $4
                )
              ORDER BY created_at DESC
              LIMIT 1
              `,
              [target.id, toolTemplate.id, `${toolTemplate.slug}%`, `${baseFromName}%`]
            );

            let toolOnStarship = existingToolIdRow?.id ? await toolRepo.findById(existingToolIdRow.id) : null;

            if (!toolOnStarship) {
              if (args.dryRun) {
                logger.info(`[DRY-RUN] Would deploy tool for template "${toolTemplateSlug}" to starship ${target.slug}`, {
                  component: 'migrate-seeded-template-parents',
                  operation: 'deployToolFromTemplate',
                  metadata: { toolTemplateSlug, starshipId: target.id, templateSlug: template.slug },
                });
                continue;
              }

              toolOnStarship = await toolRepo.createFromTemplate(toolTemplateSlug, target.id);
              toolsDeployed++;
              logger.info(`✅ Deployed tool for template "${toolTemplateSlug}" to starship ${target.slug}`, {
                component: 'migrate-seeded-template-parents',
                operation: 'deployToolFromTemplate',
                metadata: { toolTemplateSlug, toolId: toolOnStarship.id, starshipId: target.id, templateSlug: template.slug },
              });
            }

            // Normalize version + snapshot + source link for reused tools.
            // - If the tool already exists (likely from older seed logic) it may not have source_template_id set.
            // - Ensure template_snapshot_at and version are aligned with the template for consistent update behavior.
            if (!args.dryRun) {
              await db.query(
                `
                UPDATE tools
                SET
                  -- Never force a published (parent) tool to have a source template id.
                  source_template_id = CASE
                    WHEN published_template_id IS NOT NULL THEN NULL
                    ELSE COALESCE(source_template_id, $2)
                  END,
                  template_snapshot_at = $3,
                  version = $4,
                  updated_at = NOW()
                WHERE id = $1
                `,
                [toolOnStarship.id, toolTemplate.id, now, toolTemplate.version]
              );
            }

            // If the marketplace template has no parent tool anywhere yet, promote the starship's tool into the parent.
            // This avoids creating a second "duplicate" tool on the starship.
            const existingToolParent = await db.queryOne<ToolParentCheckRow>(
              'SELECT id FROM tools WHERE published_template_id = $1 LIMIT 1',
              [toolTemplate.id]
            );

            if (!existingToolParent) {
              if (args.dryRun) {
                toolsPromotedToParents++;
                logger.info(`[DRY-RUN] Would promote tool "${toolOnStarship.slug}" to parent for tool template "${toolTemplateSlug}"`, {
                  component: 'migrate-seeded-template-parents',
                  operation: 'promoteToolToParent',
                  metadata: { toolTemplateSlug, toolTemplateId: toolTemplate.id, toolId: toolOnStarship.id, starshipId: target.id },
                });
              } else {
                await db.query(
                  `
                  UPDATE tools
                  SET
                    source_template_id = NULL,
                    template_snapshot_at = $7,
                    publication_status = 'published',
                    publication_approved_by = $2,
                    publication_approved_at = $3,
                    publication_changelog = $4,
                    published_template_id = $5,
                    version = $6,
                    updated_at = NOW()
                  WHERE id = $1
                  `,
                  [
                    toolOnStarship.id,
                    approverUserId,
                    now,
                    'Backfilled parent tool for seeded marketplace tool template (promoted existing tool)',
                    toolTemplate.id,
                    toolTemplate.version,
                    now,
                  ]
                );
                toolsPromotedToParents++;
              }
            }

            deployedToolIds.push(toolOnStarship.id);
          } catch (toolErr) {
            // Tool failures should not block agent parent backfill; log and continue.
            logger.warn(
              `Failed to ensure tool instance for tool template "${toolTemplateSlug}"`,
              {
                component: 'migrate-seeded-template-parents',
                operation: 'deployToolFromTemplate',
                metadata: { toolTemplateSlug, starshipId: target.id, templateSlug: template.slug },
              },
              toolErr as Error
            );
          }
        }

        // Always sync versions for existing deployed agents on the target starship.
        // Older seed logic sometimes created agents from templates without setting version.
        if (!args.dryRun) {
          const syncedAgents =
            (await db.query<{ id: string }>(
              `
              UPDATE agents
              SET
                version = $4,
                template_snapshot_at = $3,
                updated_at = NOW()
              WHERE starship_id = $1
                AND source_template_id = $2
                AND (
                  version IS DISTINCT FROM $4 OR
                  template_snapshot_at IS NULL
                )
              RETURNING id
              `,
              [target.id, template.id, now, template.version]
            )) || [];
          agentVersionsSynced += syncedAgents.length;
        }

        const existingParent = await db.queryOne<ParentCheckRow>(
          'SELECT id, slug, starship_id FROM agents WHERE published_template_id = $1 LIMIT 1',
          [template.id]
        );

        if (existingParent) {
          alreadyHadParent++;

          if (args.dryRun) {
            logger.info(`[DRY-RUN] Would sync existing parent agent version for template "${template.slug}"`, {
              component: 'migrate-seeded-template-parents',
              metadata: {
                templateId: template.id,
                agentId: existingParent.id,
                agentSlug: existingParent.slug,
                agentStarshipId: existingParent.starship_id,
                targetVersion: template.version,
              },
            });
          } else {
            const syncedParent = await db.queryOne<{ id: string }>(
              `
              UPDATE agents
              SET
                version = $2,
                template_snapshot_at = $3,
                updated_at = NOW()
              WHERE id = $1
                AND (
                  version IS DISTINCT FROM $2 OR
                  template_snapshot_at IS NULL
                )
              RETURNING id
              `,
              [existingParent.id, template.version, now]
            );
            if (syncedParent?.id) {
              agentVersionsSynced++;
            }
          }

          logger.debug(`Template already has parent agent: ${template.slug} → ${existingParent.slug}`, {
            component: 'migrate-seeded-template-parents',
            metadata: { templateId: template.id, agentId: existingParent.id, agentStarshipId: existingParent.starship_id },
          });

          // If the existing parent is on the target starship, ensure it has relationships
          // to any tool instances we deployed/identified for this template.
          if (existingParent.starship_id === target.id) {
            for (const toolId of deployedToolIds) {
              try {
                await agentRepo.addToolRelationship(existingParent.id, toolId);
                agentToolLinksEnsured++;
              } catch (relErr) {
                logger.warn(
                  `Failed to ensure agent-tool relationship for existing parent agent`,
                  {
                    component: 'migrate-seeded-template-parents',
                    operation: 'addAgentToolRelationship',
                    metadata: { agentId: existingParent.id, toolId, templateSlug: template.slug, starshipId: target.id },
                  },
                  relErr as Error
                );
              }
            }
          }

          continue;
        }

        // If this template is already deployed on the target starship as a child agent instance,
        // "promote" that existing agent into the parent by only updating the linkage fields.
        // This avoids creating a new agent and avoids overwriting any user customizations.
        const existingChildOnTarget = await db.queryOne<ChildOnStarshipRow>(
          `
          SELECT id, slug, deployed_at, created_at
          FROM agents
          WHERE starship_id = $1 AND source_template_id = $2
          ORDER BY created_at ASC
          LIMIT 1
          `,
          [target.id, template.id]
        );

        if (existingChildOnTarget) {
          if (args.dryRun) {
            promotedExisting++;
            logger.info(
              `[DRY-RUN] Would promote existing deployed agent "${existingChildOnTarget.slug}" to parent for template "${template.slug}"`,
              {
                component: 'migrate-seeded-template-parents',
                metadata: {
                  templateId: template.id,
                  agentId: existingChildOnTarget.id,
                  agentSlug: existingChildOnTarget.slug,
                  starshipId: target.id,
                },
              }
            );
            continue;
          }

          // IMPORTANT: Repository update cannot set sourceTemplateId to NULL (it omits undefined),
          // so we do a direct SQL update to truly promote the child → parent.
          await db.query(
            `
            UPDATE agents
            SET
              source_template_id = NULL,
              template_snapshot_at = $6,
              version = $7,
              publication_status = 'published',
              publication_approved_by = $2,
              publication_approved_at = $3,
              published_template_id = $4,
              publication_changelog = $5,
              updated_at = NOW()
            WHERE id = $1
            `,
            [
              existingChildOnTarget.id,
              approverUserId,
              now,
              template.id,
              'Backfilled parent agent for seeded marketplace template (promoted existing deployed instance)',
              now,
              template.version,
            ]
          );

          promotedExisting++;
          logger.info(`✅ Promoted existing agent "${existingChildOnTarget.slug}" to parent for template "${template.slug}"`, {
            component: 'migrate-seeded-template-parents',
            metadata: { templateId: template.id, agentId: existingChildOnTarget.id, starshipId: target.id },
          });

          // Ensure the promoted parent has relationships to the deployed tool instances
          // required by the template.
          for (const toolId of deployedToolIds) {
            try {
              await agentRepo.addToolRelationship(existingChildOnTarget.id, toolId);
              agentToolLinksEnsured++;
            } catch (relErr) {
              logger.warn(
                `Failed to ensure agent-tool relationship for promoted parent agent`,
                {
                  component: 'migrate-seeded-template-parents',
                  operation: 'addAgentToolRelationship',
                  metadata: { agentId: existingChildOnTarget.id, toolId, templateSlug: template.slug, starshipId: target.id },
                },
                relErr as Error
              );
            }
          }
          continue;
        }

        if (args.dryRun) {
          parentsCreated++;
          logger.info(`[DRY-RUN] Would create parent agent for template "${template.slug}" on starship ${target.slug}`, {
            component: 'migrate-seeded-template-parents',
            metadata: { templateId: template.id, starshipId: target.id },
          });
          continue;
        }

        const created = await agentRepo.create(
          {
            name: template.name,
            role: template.role,
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
          publicationApprovedBy: approverUserId,
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

        // Ensure new parent agent has relationships to the deployed tool instances required by the template.
        for (const toolId of deployedToolIds) {
          try {
            await agentRepo.addToolRelationship(published.id, toolId);
            agentToolLinksEnsured++;
          } catch (relErr) {
            logger.warn(
              `Failed to ensure agent-tool relationship for created parent agent`,
              {
                component: 'migrate-seeded-template-parents',
                operation: 'addAgentToolRelationship',
                metadata: { agentId: published.id, toolId, templateSlug: template.slug, starshipId: target.id },
              },
              relErr as Error
            );
          }
        }
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
    logger.info(`  Existing deployed agents promoted: ${promotedExisting}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Parent agents created: ${parentsCreated}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Tools deployed: ${toolsDeployed}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Tools promoted to parents: ${toolsPromotedToParents}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Agent versions synced: ${agentVersionsSynced}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Tool versions synced: ${toolVersionsSynced}`, { component: 'migrate-seeded-template-parents' });
    logger.info(`  Agent→Tool links ensured: ${agentToolLinksEnsured}`, { component: 'migrate-seeded-template-parents' });
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

      console.error('❌ Seeded template parent backfill failed:', err?.message || err);
      process.exit(1);
    });
}
