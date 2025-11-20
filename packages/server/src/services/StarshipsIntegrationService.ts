import { ToolRepository } from '@starships/models';
/**
 * Execute an internal starships-ai operation for a given starship.
 *
 * Currently supported operations:
 * - tools.list
 * - tools.get
 * - docs.get
 * - docs.search
 * - models.list
 */
import { NotFoundError } from '@starships/errors';

/**
 * Starships Integration Service
 *
 * Handles internal "starships-ai" connector operations invoked from Autopilot
 * integration nodes. This keeps ConversationService slim and centralizes the
 * mapping from logical operations to repository calls.
 */
export class StarshipsIntegrationService {
  private toolRepository: ToolRepository;

  constructor() {
    this.toolRepository = new ToolRepository();
  }

  /**
   * Execute an internal starships-ai operation for a given starship.
   *
   * Currently supported operations:
   * - tools.list
   * - tools.get
   */
  async execute(starshipId: string, payload: Record<string, unknown>): Promise<unknown> {
    const operation = typeof payload.operation === 'string' ? payload.operation : '';
    const opPayload = (payload.payload ?? {}) as Record<string, unknown>;

    switch (operation) {
      case 'tools.list': {
        const tools = await this.toolRepository.findByStarship(starshipId);
        return tools;
      }
      case 'tools.get': {
        const slugRaw = opPayload.slug;
        const slug = typeof slugRaw === 'string' ? slugRaw.trim() : '';
        if (!slug) {
          throw new Error('tools.get requires a non-empty slug');
        }
        const tool = await this.toolRepository.findBySlugAndStarship(slug, starshipId);
        if (!tool) {
          throw new NotFoundError('Tool', `${slug} on starship ${starshipId}`);
        }
        return tool;
      }
      case 'docs.get': {
        const slugRaw = opPayload.slug;
        const slug = typeof slugRaw === 'string' ? slugRaw.trim() : '';
        if (!slug) {
          throw new Error('docs.get requires a non-empty slug');
        }
        // For now, delegate to the public-docs endpoint via server routes.
        // The docs service already handles slug resolution and content loading.
        const { DocsService } = await import('@/services/DocsService');
        const docsService = new DocsService();
        const doc = await docsService.getDoc(slug);
        if (!doc) {
          throw new NotFoundError('Doc', slug);
        }
        return doc;
      }
      case 'docs.search': {
        const q = typeof opPayload.q === 'string' ? opPayload.q : '';
        const limit =
          typeof opPayload.limit === 'number' && Number.isFinite(opPayload.limit) && opPayload.limit > 0
            ? Math.min(opPayload.limit, 100)
            : 20;
        const { DocsService } = await import('@/services/DocsService');
        const docsService = new DocsService();
        return await docsService.searchDocs({ q, limit });
      }
      case 'models.list': {
        // Reuse the existing OpenRouter route logic indirectly by calling its core function.
        const { getEnvConfig } = await import('@starships/env');
        const env = getEnvConfig();
        const apiKey = env.OPENROUTER_API_KEY;
        if (!apiKey) {
          throw new Error('OPENROUTER_API_KEY not configured on server');
        }

        const endpoint = 'https://openrouter.ai/api/v1/models/user';
        const resp = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          throw new Error(`OpenRouter responded with ${resp.status}: ${body || resp.statusText}`);
        }

        const payload: unknown = await resp.json();
        const models = Array.isArray((payload as { data?: unknown }).data)
          ? ((payload as { data: unknown[] }).data as unknown[])
          : Array.isArray(payload)
            ? (payload as unknown[])
            : [];

        // Mirror the /openrouter/models response shape: return filtered list directly
        return models;
      }
      default:
        throw new Error(`Unsupported starships-ai operation: ${operation || '<missing>'}`);
    }
  }
}
