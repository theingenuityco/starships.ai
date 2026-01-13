/**
 * Backfill missing deployed tools for deployed template-based agents.
 *
 * Problem:
 * Some starships have deployed agents created from agent templates, but the agent's
 * template tools (agent_template_tool_templates / assignedToolSlugs) were not
 * deployed to the starship and/or not linked via agent_tools.
 *
 * This script:
 * - Scans starships (all, or a provided list)
 * - For each deployed agent with sourceTemplateId:
 *   - Loads the agent template's assignedToolSlugs
 *   - Ensures each required tool is deployed to the starship (tools table)
 *   - Ensures the agent↔tool relationship exists (agent_tools)
 *
 * Safety:
 * - Idempotent: safe to run multiple times.
 * - Dry-run by default; use --apply to write changes.
 */

import { logger } from '@/helpers/logging';
import { AgentRepository } from '@/repositories/AgentRepository';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { ToolRepository } from '@/repositories/ToolRepository';
import type { StarshipModel } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';

interface BackfillStats {
  starshipsProcessed: number;
  agentsProcessed: number;
  agentsSkippedNoTemplate: number;
  toolLinksNeeded: number;
  toolInstancesCreated: number;
  toolLinksCreated: number;
  toolPermissionsSetToAllow: number;
  errors: number;
}

function parseCli(argv: string[]): { apply: boolean; starshipIds?: string[] } {
  const args = argv.slice(2);
  const apply = args.includes('--apply') || args.includes('-a');
  const starshipIds = args.filter((a) => !a.startsWith('-')).map((s) => s.trim()).filter(Boolean);
  return { apply, starshipIds: starshipIds.length > 0 ? starshipIds : undefined };
}

async function backfillStarship(starshipId: string, starshipSlug: string, apply: boolean): Promise<Omit<BackfillStats, 'starshipsProcessed'>> {
  const agentRepo = new AgentRepository();
  const agentTemplateRepo = new AgentTemplateRepository();
  const toolRepo = new ToolRepository();

  const stats: Omit<BackfillStats, 'starshipsProcessed'> = {
    agentsProcessed: 0,
    agentsSkippedNoTemplate: 0,
    toolLinksNeeded: 0,
    toolInstancesCreated: 0,
    toolLinksCreated: 0,
    toolPermissionsSetToAllow: 0,
    errors: 0,
  };

  const agents = await new StarshipRepository().getDeployedAgents(starshipId);
  const templateAgents = agents.filter((a) => !!a.sourceTemplateId);
  if (templateAgents.length === 0) return stats;

  // Batch fetch all relevant templates so we don't do N+1 lookups.
  const templateIds = Array.from(new Set(templateAgents.map((a) => a.sourceTemplateId).filter((v): v is string => !!v)));
  const templatesById = await agentTemplateRepo.findInternalByIds(templateIds);

  for (const agent of templateAgents) {
    try {
      if (!agent.sourceTemplateId) continue;
      const template = templatesById.get(agent.sourceTemplateId);
      if (!template) {
        stats.agentsSkippedNoTemplate++;
        logger.warn(`Agent template not found for agent ${agent.id} (sourceTemplateId=${agent.sourceTemplateId})`, {
          component: 'backfill-missing-agent-tools',
          operation: 'templateLookup',
          metadata: { starshipId, starshipSlug, agentId: agent.id, sourceTemplateId: agent.sourceTemplateId },
        });
        continue;
      }

      stats.agentsProcessed++;

      const requiredToolSlugs = (template.assignedToolSlugs || []).map((s) => String(s)).filter((s) => s.trim().length > 0);
      if (requiredToolSlugs.length === 0) continue;

      // Current linked tools for this agent (starship-scoped in the query).
      const currentTools = await agentRepo.getAgentTools(agent.id, starshipId);
      const currentlyLinkedToolIds = new Set(currentTools.map((t) => t.id));

      for (const requiredSlug of requiredToolSlugs) {
        try {
          // Ensure the tool instance exists on the starship.
          let tool = await toolRepo.findByTemplateSlugAndStarship(requiredSlug, starshipId);
          if (!tool) {
            stats.toolLinksNeeded++;
            logger.info(
              `[${apply ? 'APPLY' : 'DRY-RUN'}] Missing tool instance "${requiredSlug}" on starship ${starshipSlug} (needed by agent ${agent.slug})`,
              {
                component: 'backfill-missing-agent-tools',
                operation: 'ensureToolInstance',
                metadata: { starshipId, starshipSlug, agentId: agent.id, agentSlug: agent.slug, requiredSlug },
              }
            );

            if (apply) {
              tool = await toolRepo.createFromTemplate(requiredSlug, starshipId);
              stats.toolInstancesCreated++;
            } else {
              // Can't link without a tool id in dry-run.
              continue;
            }
          }

          // Ensure relationship exists.
          if (!currentlyLinkedToolIds.has(tool.id)) {
            stats.toolLinksNeeded++;
            logger.info(
              `[${apply ? 'APPLY' : 'DRY-RUN'}] Missing agent→tool link for agent ${agent.slug} -> tool ${tool.slug} (template "${requiredSlug}")`,
              {
                component: 'backfill-missing-agent-tools',
                operation: 'ensureLink',
                metadata: { starshipId, starshipSlug, agentId: agent.id, agentSlug: agent.slug, toolId: tool.id, toolSlug: tool.slug },
              }
            );

            if (apply) {
              await agentRepo.addToolRelationship(agent.id, tool.id);
              stats.toolLinksCreated++;
              currentlyLinkedToolIds.add(tool.id);
            }
          }

          // Ensure permission is ALWAYS allowed for these template tools.
          // (The join table default is 'ask', so we must actively update it.)
          logger.info(
            `[${apply ? 'APPLY' : 'DRY-RUN'}] Setting agent→tool permission to allow for agent ${agent.slug} -> tool ${tool.slug}`,
            {
              component: 'backfill-missing-agent-tools',
              operation: 'setPermissionAllow',
              metadata: { starshipId, starshipSlug, agentId: agent.id, agentSlug: agent.slug, toolSlug: tool.slug },
            }
          );
          if (apply) {
            // This only updates existing relationships; it will throw if the tool isn't assigned.
            await agentRepo.setAgentToolPermissionBySlug({
              agentId: agent.id,
              starshipId,
              toolSlug: tool.slug,
              permission: 'allow',
            });
            stats.toolPermissionsSetToAllow++;
          }
        } catch (error) {
          stats.errors++;
          logger.warn(
            `Failed ensuring tool/link for agent ${agent.id} requiredSlug=${requiredSlug}`,
            {
              component: 'backfill-missing-agent-tools',
              operation: 'ensureToolOrLink',
              metadata: { starshipId, starshipSlug, agentId: agent.id, requiredSlug },
            },
            error as Error
          );
        }
      }
    } catch (error) {
      stats.errors++;
      logger.warn(
        `Failed processing agent ${agent.id} on starship ${starshipSlug}`,
        {
          component: 'backfill-missing-agent-tools',
          operation: 'processAgent',
          metadata: { starshipId, starshipSlug, agentId: agent.id },
        },
        error as Error
      );
    }
  }

  return stats;
}

export async function backfillMissingAgentTools(starshipIds?: string[], apply: boolean = false): Promise<void> {
  const starshipRepo = new StarshipRepository();

  const total: BackfillStats = {
    starshipsProcessed: 0,
    agentsProcessed: 0,
    agentsSkippedNoTemplate: 0,
    toolLinksNeeded: 0,
    toolInstancesCreated: 0,
    toolLinksCreated: 0,
    toolPermissionsSetToAllow: 0,
    errors: 0,
  };

  logger.info(`Starting backfill missing agent tools (${apply ? 'APPLY' : 'DRY-RUN'})...`, {
    component: 'backfill-missing-agent-tools',
  });

  const starships: StarshipModel[] = [];
  if (starshipIds && starshipIds.length > 0) {
    for (const raw of starshipIds) {
      const key = String(raw).trim();
      if (!key) continue;
      const byId = await starshipRepo.findById(key);
      if (byId) {
        starships.push(byId);
        continue;
      }
      const bySlug = await starshipRepo.findBySlugAnyOwner(key);
      if (bySlug) {
        starships.push(bySlug);
        continue;
      }
      logger.warn(`Starship not found for identifier: ${key}`, {
        component: 'backfill-missing-agent-tools',
        operation: 'resolveStarship',
        metadata: { identifier: key },
      });
    }
  } else {
    starships.push(...(await starshipRepo.findAll()));
  }

  for (const starship of starships) {
    total.starshipsProcessed++;
    logger.info(`Processing starship ${starship.slug} (${starship.id})`, {
      component: 'backfill-missing-agent-tools',
      metadata: { starshipId: starship.id, starshipSlug: starship.slug },
    });

    try {
      const s = await backfillStarship(starship.id, starship.slug, apply);
      total.agentsProcessed += s.agentsProcessed;
      total.agentsSkippedNoTemplate += s.agentsSkippedNoTemplate;
      total.toolLinksNeeded += s.toolLinksNeeded;
      total.toolInstancesCreated += s.toolInstancesCreated;
      total.toolLinksCreated += s.toolLinksCreated;
      total.toolPermissionsSetToAllow += s.toolPermissionsSetToAllow;
      total.errors += s.errors;
    } catch (error) {
      total.errors++;
      logger.warn(
        `Failed processing starship ${starship.slug}`,
        { component: 'backfill-missing-agent-tools', operation: 'processStarship', metadata: { starshipId: starship.id } },
        error as Error
      );
    }
  }

  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Backfill Missing Agent Tools Summary:');
  logger.info(`  Starships Processed: ${total.starshipsProcessed}`);
  logger.info(`  Agents Processed: ${total.agentsProcessed}`);
  logger.info(`  Agents Skipped (missing template): ${total.agentsSkippedNoTemplate}`);
  logger.info(`  Tool instances created: ${total.toolInstancesCreated}`);
  logger.info(`  Agent→tool links created: ${total.toolLinksCreated}`);
  logger.info(`  Agent→tool permissions set to allow: ${total.toolPermissionsSetToAllow}`);
  logger.info(`  Errors: ${total.errors}`);
  logger.info('═══════════════════════════════════════════════════════════');

  if (!apply) {
    logger.info('Dry-run complete. Re-run with --apply to persist changes.', { component: 'backfill-missing-agent-tools' });
  }
}

if (require.main === module) {
  const { apply, starshipIds } = parseCli(process.argv);
  (async () => {
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
      await backfillMissingAgentTools(starshipIds, apply);
      process.exit(0);
    } catch (err) {
      // Keep a direct stderr log for CLI users; structured logs already emitted via logger.
      // eslint-disable-next-line no-console
      console.error('❌ Backfill failed:', err);
      process.exit(1);
    } finally {
      try {
        await db.disconnect();
      } catch {
        // ignore
      }
    }
  })();
}

