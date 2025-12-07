import type { Client } from 'pg';

import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ToolRepository } from '@/repositories/ToolRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';

/**
 * Migration 021: Backfill Aria delegator agent (and its tools) onto existing starships
 *
 * Goal:
 * - For every existing starship that does NOT yet have an Aria agent created from the Aria template,
 *   create a new Aria agent instance from the template and deploy its assigned tools
 *   (list-agent, call-agent, list-tools) to that starship.
 *
 * Safety / Idempotency:
 * - If the Aria template does not exist, the migration is a no-op.
 * - For each starship, we first check whether an agent exists whose sourceTemplateId matches
 *   the Aria template; if so, we skip that starship.
 * - Tool deployment is done via ToolRepository.createFromTemplate which always generates
 *   unique slugs and is safe to call multiple times (we first check for an existing tool
 *   created from the same template for that starship).
 * - Agent→Tool relationships are created via AgentRepository.addToolRelationship
 *   using ON CONFLICT DO NOTHING semantics in the junction table.
 *
 * Down migration:
 * - We do NOT delete Aria or its tools on down() to avoid destructive data loss
 *   (agents/tools may have been edited or used by users). Down is therefore a no-op.
 */
export async function up(client: Client): Promise<void> {
  // This migration uses repository classes directly instead of the raw client.
  // Mark the parameter as intentionally unused to satisfy linters.
  void client;
  const templateRepo = new AgentTemplateRepository();
  const agentRepo = new AgentRepository();
  const toolRepo = new ToolRepository();
  const starshipRepo = new StarshipRepository();

  // Locate Aria agent template by slug
  const ariaTemplate = await templateRepo.findBySlug('aria');

  if (!ariaTemplate) {
    console.warn('[021_backfill_aria_delegator] Aria agent template not found (slug="aria") – skipping backfill for existing starships.');
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
    try {
      const starshipId = starship.id;
      if (!starshipId) continue;

      // Check if this starship already has an Aria agent created from the Aria template
      const existingAgents = await agentRepo.findByStarship(starshipId);
      const hasAria = existingAgents.some((agent) => {
        const srcTemplateId = agent.sourceTemplateId;
        const slug = agent.slug;
        return srcTemplateId === ariaTemplate.id || (slug && slug.startsWith('aria'));
      });

      if (hasAria) {
        console.log(
          `[021_backfill_aria_delegator] Starship ${starshipId} already has an Aria agent (from template ${ariaTemplate.id}); skipping.`
        );
        continue;
      }

      console.log(
        `[021_backfill_aria_delegator] Creating Aria agent and delegation tools for starship ${starshipId} (template ${ariaTemplate.id}).`
      );

      // Ensure tools from the template are deployed to this starship
      const deployedToolIds: string[] = [];
      for (const toolSlug of toolSlugs) {
        try {
          let tool = await toolRepo.findByTemplateSlugAndStarship(toolSlug, starshipId);
          if (!tool) {
            tool = await toolRepo.createFromTemplate(toolSlug, starshipId);
            console.log(`[021_backfill_aria_delegator] Deployed tool '${toolSlug}' to starship ${starshipId} from template.`);
          } else {
            console.log(
              `[021_backfill_aria_delegator] Tool '${toolSlug}' already deployed to starship ${starshipId}; reusing existing instance.`
            );
          }

          if (tool) {
            deployedToolIds.push(tool.id);
          }
        } catch (err) {
          console.error(`[021_backfill_aria_delegator] Failed to ensure tool '${toolSlug}' for starship ${starshipId}:`, err);
          // Continue with other tools and Aria creation instead of failing the entire migration
        }
      }

      // Create the Aria agent instance from the template for this starship
      let ariaAgentId: string | null = null;
      try {
        const ariaAgent = await agentRepo.createFromTemplate(ariaTemplate.id, starshipId);
        ariaAgentId = ariaAgent.id;
        console.log(
          `[021_backfill_aria_delegator] Created Aria agent ${ariaAgentId} on starship ${starshipId} from template ${ariaTemplate.id}.`
        );
      } catch (err) {
        console.error(
          `[021_backfill_aria_delegator] Failed to create Aria agent on starship ${starshipId} from template ${ariaTemplate.id}:`,
          err
        );
        // Skip tool relationship creation for this starship
        continue;
      }

      // Link deployed tools to the new Aria agent via agent_tools junction table
      if (ariaAgentId && deployedToolIds.length > 0) {
        for (const toolId of deployedToolIds) {
          try {
            await agentRepo.addToolRelationship(ariaAgentId, toolId);
          } catch (err) {
            console.error(
              `[021_backfill_aria_delegator] Failed to link Aria agent ${ariaAgentId} to tool ${toolId} on starship ${starshipId}:`,
              err
            );
          }
        }
      }
    } catch (err) {
      console.error('[021_backfill_aria_delegator] Unexpected error while processing starship during Aria backfill:', err);
      // Continue with the next starship instead of failing the migration globally
    }
  }
}

export async function down(client: Client): Promise<void> {
  // Parameter is required by migration runner signature; mark as intentionally unused.
  void client;
  // Intentionally a no-op: removing Aria agents/tools automatically would be destructive
  // and could delete user-edited agents or conversations that depend on them.
  console.warn('[021_backfill_aria_delegator] down() is a no-op to avoid deleting existing Aria agents or tools from starships.');
}
