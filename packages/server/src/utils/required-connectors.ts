import { AgentTemplateRepository, extractRequiredConnectorProviders } from '@starships/models';

/**
 * Get required connector provider ids for an agent template (from its tool templates' blueprints).
 * Excludes 'starships'. Used for deploy modal connector suggestion.
 * Falls back to extracting from blueprint when requiredConnectorProviders is empty (e.g. pre-migration templates).
 */
export async function getRequiredConnectorProviderIdsForTemplate(templateId: string): Promise<string[]> {
  const agentTemplateRepo = new AgentTemplateRepository();
  const template = await agentTemplateRepo.findById(templateId);
  if (!template) return [];

  const toolTemplates = await agentTemplateRepo.getToolTemplates(templateId);
  const providers = new Set<string>();
  for (const tt of toolTemplates) {
    let list = tt.requiredConnectorProviders;
    if (!Array.isArray(list) || list.length === 0) {
      list = extractRequiredConnectorProviders(tt.blueprint ?? undefined);
    }
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
