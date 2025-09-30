import { UsageEntity } from '@/entities/UsageEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { UsageModel, LLMUsage } from '@starships/protocol';

/**
 * UsageRepository
 *
 * Persists per-turn usage records linked to both Starship and Conversation via foreign keys
 */
export class UsageRepository extends BaseRepository {
  constructor() {
    super('UsageRepository');
  }

  /**
   * Create a Usage record linked to Starship and Conversation
   */
  async createAndLink(data: {
    starshipId: string;
    conversationId: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    model?: string;
    createdAt?: string;
  }): Promise<UsageModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare usage data
        const usageData = {
          starshipId: data.starshipId,
          conversationId: data.conversationId,
          prompt_tokens: data.prompt_tokens,
          completion_tokens: data.completion_tokens,
          total_tokens: data.total_tokens,
          cost: data.cost,
          model: data.model || 'unknown',
          createdAt: data.createdAt || now,
        };

        // Validate entity first
        await UsageEntity.validate(usageData, 'create');

        // Create entity instance from plain object, then serialize
        const usageEntity = toEntityInstance(UsageEntity, usageData);
        const databaseFormat = toDatabase(usageEntity);
        const result = await this.createEntity<Record<string, unknown>>('usage', databaseFormat);

        return fromDatabase(UsageEntity, result);
      },
      'createAndLink',
      'Usage'
    );
  }

  /**
   * Aggregate totals for a conversation
   */
  async getTotalsByConversation(conversationId: string): Promise<LLMUsage> {
    return this.executeWithErrorHandling(
      async () => {
        if (!conversationId?.trim()) {
          throw new Error('conversationId is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{
          prompt_tokens: string;
          completion_tokens: string;
          total_tokens: string;
          cost: string;
        }>(
          `SELECT
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost), 0) AS cost
           FROM usage
           WHERE conversation_id = $1`,
          [conversationId]
        );

        return {
          prompt_tokens: Number(result?.prompt_tokens) || 0,
          completion_tokens: Number(result?.completion_tokens) || 0,
          total_tokens: Number(result?.total_tokens) || 0,
          cost: Number(result?.cost) || 0,
        };
      },
      'getTotalsByConversation',
      'Usage',
      conversationId
    );
  }

  /**
   * Aggregate totals for a starship
   */
  async getTotalsByStarship(starshipId: string): Promise<LLMUsage> {
    return this.executeWithErrorHandling(
      async () => {
        if (!starshipId?.trim()) {
          throw new Error('starshipId is required');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<{
          prompt_tokens: string;
          completion_tokens: string;
          total_tokens: string;
          cost: string;
        }>(
          `SELECT
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost), 0) AS cost
           FROM usage
           WHERE starship_id = $1`,
          [starshipId]
        );

        return {
          prompt_tokens: Number(result?.prompt_tokens) || 0,
          completion_tokens: Number(result?.completion_tokens) || 0,
          total_tokens: Number(result?.total_tokens) || 0,
          cost: Number(result?.cost) || 0,
        };
      },
      'getTotalsByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * List all usage records for a conversation (paginated)
   */
  async listByConversation(conversationId: string, options: { limit?: number; offset?: number } = {}): Promise<UsageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!conversationId?.trim()) {
          throw new Error('conversationId is required');
        }

        const limit = Math.max(1, Math.min(200, options.limit ?? 100));
        const offset = Math.max(0, options.offset ?? 0);

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM usage
           WHERE conversation_id = $1
           ORDER BY created_at ASC
           LIMIT $2 OFFSET $3`,
          [conversationId, limit, offset]
        );

        return fromDatabaseArray(UsageEntity, result);
      },
      'listByConversation',
      'Usage',
      conversationId
    );
  }
}
