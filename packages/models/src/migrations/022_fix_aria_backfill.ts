import type { Client } from 'pg';

import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ToolRepository } from '@/repositories/ToolRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';

/**
 * Migration 022: Corrective Aria delegator backfill for existing starships
 *
 * This migration fixes cases where 021_backfill_aria_delegator did not
 * populate Aria correctly. It uses a stricter condition for detecting
 * existing Aria agents (by sourceTemplateId only) and ensures that both
 * the Aria agent and its delegation tools are present and wired up.
 *
 * Behaviour:
 * - If the Aria template does not exist, this migration is a no-op.
 * - For each starship:
 *   - Acquire a per-starship advisory lock to avoid duplicate work
 *     across concurrent migration runners.
 *   - Look for agents whose sourceTemplateId === ariaTemplate.id.
 *   - If none exist, create a new Aria agent from the template.
 *   - Ensure delegation tools (list-agent, call-agent, list-tools, or
 *     whatever is configured on the template) are deployed to the starship.
 *   - Ensure agent→tool relationships are present (ON CONFLICT DO NOTHING
 *     semantics inside AgentRepository.addToolRelationship keep this
 *     idempotent).
 *
 * Idempotency:
 * - Safe to run multiple times; existing agents and tools are reused
 *   when present, and relationships are de-duplicated via ON CONFLICT.
 *
 * Down migration:
 * - Like 021, this is non-destructive: we do NOT delete Aria agents or
 *   tools on down() to avoid data loss. Down is therefore a no-op.
 */
export async function up(client: Client): Promise<void> {
  const templateRepo = new AgentTemplateRepository();
  const agentRepo = new AgentRepository();
  const toolRepo = new ToolRepository();
  const starshipRepo = new StarshipRepository();

  // Locate Aria agent template by slug
  const ariaTemplate = await templateRepo.findBySlug('aria');

  if (!ariaTemplate) {
    console.warn(
      '[022_fix_aria_backfill] Aria agent template not found (slug="aria") – skipping corrective backfill for existing starships.'
    );
    return;
  }

  // Determine which tool slugs should be deployed alongside Aria.
  // Prefer the template's assignedToolSlugs; fall back to the expected defaults.
  let toolSlugs: string[] = Array.isArray(ariaTemplate.assignedToolSlugs) ? (ariaTemplate.assignedToolSlugs ?? []) : [];

  if (!toolSlugs || toolSlugs.length === 0) {
    toolSlugs = ['list-agent', 'call-agent', 'list-tools'];
  }

  // Fetch all existing starships
  const starships = await starshipRepo.findAll();

  for (const starship of starships) {
    const starshipId = starship.id;
    if (!starshipId) continue;

    try {
      // Serialize corrective backfill work per starship across concurrent runners.
      try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [starshipId]);
      } catch (lockErr) {
        console.error(`[022_fix_aria_backfill] Failed to acquire advisory lock for starship ${starshipId}; skipping.`, lockErr);
        continue;
      }

      // Find all agents on this starship and look for those created from the Aria template.
      const existingAgents = await agentRepo.findByStarship(starshipId);
      const ariaAgentsFromTemplate = existingAgents.filter((agent) => agent.sourceTemplateId === ariaTemplate.id);

      let ariaAgentId: string | null = null;

      if (ariaAgentsFromTemplate.length > 0) {
        // Reuse the most recently created Aria agent that points at this template.
        const chosen = ariaAgentsFromTemplate[0];
        ariaAgentId = chosen.id;
        console.log(
          `[022_fix_aria_backfill] Starship ${starshipId} already has Aria agent ${ariaAgentId} from template ${ariaTemplate.id}; ensuring tools and relationships.`
        );
      } else {
        // No Aria-from-template agent exists; create one now.
        try {
          const ariaAgent = await agentRepo.createFromTemplate(ariaTemplate.id, starshipId);
          ariaAgentId = ariaAgent.id;
          console.log(
            `[022_fix_aria_backfill] Created Aria agent ${ariaAgentId} on starship ${starshipId} from template ${ariaTemplate.id}.`
          );
        } catch (err) {
          console.error(
            `[022_fix_aria_backfill] Failed to create Aria agent on starship ${starshipId} from template ${ariaTemplate.id}:`,
            err
          );
          // If we cannot create the agent, skip tool relationship creation for this starship
          continue;
        }
      }

      // Ensure tools from the template are deployed to this starship
      const deployedToolIds: string[] = [];
      for (const toolSlug of toolSlugs) {
        try {
          let tool = await toolRepo.findByTemplateSlugAndStarship(toolSlug, starshipId);
          if (!tool) {
            tool = await toolRepo.createFromTemplate(toolSlug, starshipId);
            console.log(`[022_fix_aria_backfill] Deployed tool '${toolSlug}' to starship ${starshipId} from template.`);
          } else {
            console.log(
              `[022_fix_aria_backfill] Tool '${toolSlug}' already deployed to starship ${starshipId}; reusing existing instance.`
            );
          }

          if (tool) {
            deployedToolIds.push(tool.id);
          }
        } catch (err) {
          console.error(`[022_fix_aria_backfill] Failed to ensure tool '${toolSlug}' for starship ${starshipId}:`, err);
          // Continue with other tools instead of failing the entire starship
        }
      }

      // Link deployed tools to the Aria agent via agent_tools junction table
      if (ariaAgentId && deployedToolIds.length > 0) {
        for (const toolId of deployedToolIds) {
          try {
            await agentRepo.addToolRelationship(ariaAgentId, toolId);
          } catch (err) {
            console.error(
              `[022_fix_aria_backfill] Failed to link Aria agent ${ariaAgentId} to tool ${toolId} on starship ${starshipId}:`,
              err
            );
          }
        }
      }

      // Release the advisory lock for this starship once all work is done.
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [starshipId]);
      } catch (unlockErr) {
        console.error(`[022_fix_aria_backfill] Failed to release advisory lock for starship ${starshipId}:`, unlockErr);
      }
    } catch (err) {
      console.error('[022_fix_aria_backfill] Unexpected error while processing starship during Aria corrective backfill:', err);
      // Continue with the next starship instead of failing the migration globally
    }
  }
}

export async function down(client: Client): Promise<void> {
  // Parameter is required by migration runner signature; mark as intentionally unused.
  void client;
  // Intentionally a no-op: removing Aria agents/tools automatically would be destructive
  // and could delete user-edited agents or conversations that depend on them.
  console.warn('[022_fix_aria_backfill] down() is a no-op to avoid deleting existing Aria agents or tools from starships.');
}
