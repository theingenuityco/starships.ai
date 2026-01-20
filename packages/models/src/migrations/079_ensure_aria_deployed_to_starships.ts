type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

/**
 * Migration 079: Ensure Aria is deployed to starships (from marketplace) and reconcile tools.
 *
 * Goal:
 * - For every existing starship, ensure there is an Aria agent deployed from the marketplace
 *   template (agents.source_template_id -> agent_templates.id where agent_templates.slug='aria').
 *
 * Reconciliation:
 * - After ensuring Aria exists for a starship, run reconciliation exactly like the manual
 *   "Update from template" flow:
 *   1) AgentRepository.updateFromTemplate(ariaAgentId) (sync agent + tool relationships, deploy/unlink tools)
 *   2) ToolRepository.updateFromTemplate(toolId) for each attached template-sourced tool instance
 *
 * Idempotency:
 * - Safe to run multiple times; we only create Aria when missing, and reconciliation is
 *   template-owned field sync.
 *
 * Concurrency:
 * - Uses a per-starship PostgreSQL advisory lock to avoid duplicates if multiple instances
 *   run migrations concurrently.
 *
 * Down migration:
 * - No-op (non-destructive). We do not delete Aria agents/tools.
 */
import { AgentRepository } from '@/repositories/AgentRepository';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { StarshipRepository } from '@/repositories/StarshipRepository';
import { ToolRepository } from '@/repositories/ToolRepository';

export async function up(client: DbClient): Promise<void> {
  const templateRepo = new AgentTemplateRepository();
  const agentRepo = new AgentRepository();
  const toolRepo = new ToolRepository();
  const starshipRepo = new StarshipRepository();

  const ariaTemplate = await templateRepo.findBySlug('aria');
  if (!ariaTemplate?.id) {
    console.warn('[079_ensure_aria_deployed_to_starships] Aria agent template not found (slug="aria"); skipping.');
    return;
  }

  const starships = await starshipRepo.findAll();
  let deployed = 0;
  let reconciled = 0;
  let toolsReconciled = 0;
  let errors = 0;

  for (const starship of starships) {
    const starshipId = starship?.id;
    if (!starshipId) continue;

    try {
      // Serialize per-starship across concurrent migration runners.
      try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [starshipId]);
      } catch (lockErr) {
        console.error(`[079_ensure_aria_deployed_to_starships] Failed to acquire advisory lock for starship ${starshipId}; skipping.`, lockErr);
        errors++;
        continue;
      }

      // Ensure Aria agent exists from template
      const agents = await agentRepo.findByStarship(starshipId);
      const ariaAgent = agents.find((a) => a.sourceTemplateId === ariaTemplate.id);
      let ariaAgentId = ariaAgent?.id;

      if (!ariaAgentId) {
        const created = await agentRepo.createFromTemplate(ariaTemplate.id, starshipId);
        ariaAgentId = created.id;
        deployed++;
      }

      // Reconcile agent + tools just like manual update
      await agentRepo.updateFromTemplate(ariaAgentId);
      reconciled++;

      const attachedTools = await agentRepo.getAgentToolsByRelationships(ariaAgentId);
      for (const tool of attachedTools) {
        if (!tool?.sourceTemplateId) continue;
        await toolRepo.updateFromTemplate(tool.id);
        toolsReconciled++;
      }
    } catch (err) {
      errors++;
      console.error('[079_ensure_aria_deployed_to_starships] Failed while processing starship:', {
        starshipId,
        starshipSlug: starship?.slug,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Best-effort unlock
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [starshipId]);
      } catch {
        // ignore
      }
    }
  }

  console.log(
    `[MIGRATION-079] Aria ensured: deployed=${deployed}, reconciled=${reconciled}, toolsReconciled=${toolsReconciled}, errors=${errors}`
  );
}

export async function down(client: DbClient): Promise<void> {
  void client;
  console.warn('[079_ensure_aria_deployed_to_starships] down() is a no-op to avoid deleting Aria agents/tools.');
}

