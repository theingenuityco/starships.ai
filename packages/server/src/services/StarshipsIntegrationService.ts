import { ToolRepository } from '@starships/models';
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
      default:
        throw new Error(`Unsupported starships-ai operation: ${operation || '<missing>'}`);
    }
  }
}


