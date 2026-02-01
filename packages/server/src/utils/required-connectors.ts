import { AgentRepository, AgentTemplateRepository } from '@starships/models';

/**
 * Get required connector provider ids for an agent template (from its tool templates' blueprints).
 * Excludes 'starships'. Used for deploy modal and first-conversation connector suggestion.
 */
export async function getRequiredConnectorProviderIdsForTemplate(templateId: string): Promise<string[]> {
  const agentTemplateRepo = new AgentTemplateRepository();
  const template = await agentTemplateRepo.findById(templateId);
  if (!template) return [];

  const toolTemplates = await agentTemplateRepo.getToolTemplates(templateId);
  const providers = new Set<string>();
  for (const tt of toolTemplates) {
    const list = (tt as { requiredConnectorProviders?: string[] }).requiredConnectorProviders;
    if (Array.isArray(list)) {
      for (const p of list) {
        if (p && typeof p === 'string' && p.trim() && p.toLowerCase() !== 'starships') {
          providers.add(p.trim().toLowerCase());
        }
      }
    }
  }
  return Array.from(providers);
}

/**
 * Get required connector provider ids for an agent (from its source template).
 * Returns [] if the agent has no sourceTemplateId.
 */
export async function getRequiredConnectorProviderIdsForAgent(agentId: string): Promise<string[]> {
  const agentRepo = new AgentRepository();
  const agent = await agentRepo.findById(agentId);
  if (!agent) return [];
  const sourceTemplateId = (agent as { sourceTemplateId?: string }).sourceTemplateId;
  if (!sourceTemplateId || typeof sourceTemplateId !== 'string' || !sourceTemplateId.trim()) {
    return [];
  }
  return getRequiredConnectorProviderIdsForTemplate(sourceTemplateId);
}
