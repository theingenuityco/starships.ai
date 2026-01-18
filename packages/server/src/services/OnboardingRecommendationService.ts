import { AgentTemplateService } from '@/services/AgentTemplateService';
import { ConnectorService } from '@/services/ConnectorService';
import type {
  OnboardingGoal,
  OnboardingRecommendationsResponse,
  OnboardingConnectorSummary,
  AgentTemplateModel,
  ConnectorListResponse,
} from '@starships/protocol';

/**
 * Deterministic onboarding recommendations (no LLM calls).
 *
 * - Lists configured connectors for the starship
 * - Suggests connector providers + marketplace templates based on selected goals
 */
export class OnboardingRecommendationService {
  async getRecommendations(starshipId: string, goals: OnboardingGoal[]): Promise<OnboardingRecommendationsResponse> {
    const connectorService = new ConnectorService();
    const templateService = new AgentTemplateService();

    // Connectors (configured on this starship)
    const connectors = await connectorService.listStarshipConnectors(starshipId);
    const connectorSummaries: OnboardingConnectorSummary[] = (connectors || []).map((c: any) => {
      const provider = String(c?.provider || '');
      return {
        provider,
        status: typeof c?.status === 'string' ? c.status : undefined,
        // These extra fields are not always present on ConnectorModel; keep optional.
        authType: (c?.template?.auth && typeof c.template.auth.type === 'string') ? c.template.auth.type : undefined,
        scopes: Array.isArray(c?.scopes) ? c.scopes : undefined,
        actions: Array.isArray(c?.template?.endpoints)
          ? c.template.endpoints
              .map((e: any) => (e?.name ? { name: String(e.name), schema: e?.parameters && typeof e.parameters === 'object' ? e.parameters : undefined } : null))
              .filter(Boolean)
          : undefined,
      };
    });

    // Deterministic goal → connector provider suggestions
    const recommendedConnectorProviders: string[] = [];
    for (const g of goals || []) {
      switch (g) {
        case 'support':
          recommendedConnectorProviders.push('gmail', 'zendesk', 'intercom');
          break;
        case 'automation':
          recommendedConnectorProviders.push('slack', 'github', 'google-drive');
          break;
        case 'analytics':
          recommendedConnectorProviders.push('google-drive');
          break;
        case 'research':
          // none required
          break;
        case 'tool_building':
          // none required
          break;
      }
    }

    const uniqProviders = Array.from(new Set(recommendedConnectorProviders)).filter(Boolean);

    // Deterministic goal → template searches
    const queries: string[] = [];
    for (const g of goals || []) {
      switch (g) {
        case 'research':
          queries.push('Research');
          break;
        case 'analytics':
          queries.push('Data Analyst');
          break;
        case 'tool_building':
          queries.push('Daedalus');
          break;
        case 'automation':
          queries.push('Aria');
          break;
        case 'support':
          queries.push('support');
          break;
      }
    }

    // Search and merge results; keep a small, stable list.
    const templates: AgentTemplateModel[] = [];
    for (const q of Array.from(new Set(queries))) {
      const found = await templateService.searchTemplates(q);
      for (const t of found || []) templates.push(t);
    }

    const seen = new Set<string>();
    const uniqueTemplates = templates.filter((t) => {
      const id = String((t as any)?.id || '');
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    return {
      connectors: connectorSummaries,
      recommendedConnectorProviders: uniqProviders,
      recommendedAgentTemplates: uniqueTemplates.slice(0, 8),
    };
  }
}

