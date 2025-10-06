import { UsageEntity } from '@/entities/UsageEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { UsageModel, LLMUsage, DailyUsageRow, DailyModelUsageRow } from '@starships/protocol';

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
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
    model?: string;
    createdAt?: string;
  }): Promise<UsageModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Prepare usage data (camelCase - serialization-helper handles DB conversion)
        const usageData = {
          starshipId: data.starshipId,
          conversationId: data.conversationId,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          totalTokens: data.totalTokens,
          cost: data.cost,
          model: data.model || 'unknown',
          createdAt: data.createdAt || now,
        };

        // Validate entity first
        await UsageEntity.validate(usageData, 'create');

        // Create entity instance from plain object, then serialize (automatic snake_case conversion)
        const usageEntity = toEntityInstance(UsageEntity, usageData);
        const databaseFormat = toDatabase(usageEntity);
        const result = await this.createEntity<Record<string, unknown>>('usage', databaseFormat);

        // fromDatabase automatically converts snake_case to camelCase
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

        // DB returns snake_case, convert to camelCase LLMUsage
        return {
          promptTokens: Number(result?.prompt_tokens) || 0,
          completionTokens: Number(result?.completion_tokens) || 0,
          totalTokens: Number(result?.total_tokens) || 0,
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

        // DB returns snake_case, convert to camelCase LLMUsage
        return {
          promptTokens: Number(result?.prompt_tokens) || 0,
          completionTokens: Number(result?.completion_tokens) || 0,
          totalTokens: Number(result?.total_tokens) || 0,
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

        // fromDatabaseArray automatically converts snake_case to camelCase
        return fromDatabaseArray(UsageEntity, result);
      },
      'listByConversation',
      'Usage',
      conversationId
    );
  }

  /**
   * Aggregate totals for a starship including request count
   */
  async getTotalsByStarshipWithCount(starshipId: string): Promise<{ totals: LLMUsage; requestCount: number }> {
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
          request_count: string;
        }>(
          `SELECT
            COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            COALESCE(SUM(cost), 0) AS cost,
            COUNT(id) AS request_count
           FROM usage
           WHERE starship_id = $1`,
          [starshipId]
        );

        return {
          totals: {
            promptTokens: Number(result?.prompt_tokens) || 0,
            completionTokens: Number(result?.completion_tokens) || 0,
            totalTokens: Number(result?.total_tokens) || 0,
            cost: Number(result?.cost) || 0,
          },
          requestCount: Number(result?.request_count) || 0,
        };
      },
      'getTotalsByStarshipWithCount',
      'Usage',
      starshipId
    );
  }

  /**
   * List usage records for a starship (paginated + filters)
   */
  async listByStarship(
    starshipId: string,
    options: { limit?: number; offset?: number; day?: string; model?: string; order?: 'ASC' | 'DESC' } = {}
  ): Promise<UsageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = Math.max(1, Math.min(200, options.limit ?? 100));
        const offset = Math.max(0, options.offset ?? 0);
        const order = options.order === 'ASC' ? 'ASC' : 'DESC';

        const conn = this.getConnection();
        const result = await conn.query<Record<string, unknown>>(
          `SELECT * FROM usage
           WHERE starship_id = $1
             AND ($2::date IS NULL OR DATE(created_at) = $2::date)
             AND ($3::text IS NULL OR model = $3)
           ORDER BY created_at ${order}
           LIMIT $4 OFFSET $5`,
          [starshipId, options.day ?? null, options.model ?? null, limit, offset]
        );

        return fromDatabaseArray(UsageEntity, result);
      },
      'listByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * Count usage records for a starship with optional filters (for pagination totals)
   */
  async countByStarship(starshipId: string, options: { day?: string; model?: string } = {}): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const row = await conn.queryOne<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM usage
           WHERE starship_id = $1
             AND ($2::date IS NULL OR DATE(created_at) = $2::date)
             AND ($3::text IS NULL OR model = $3)`,
          [starshipId, options.day ?? null, options.model ?? null]
        );
        return Number(row?.total) || 0;
      },
      'countByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * List aggregated usage per day for a starship (paginated)
   */
  async listDailyByStarship(
    starshipId: string,
    options: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' } = {}
  ): Promise<DailyUsageRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = Math.max(1, Math.min(200, options.limit ?? 100));
        const offset = Math.max(0, options.offset ?? 0);
        const order = options.order === 'ASC' ? 'ASC' : 'DESC';

        const conn = this.getConnection();
        const result = await conn.query<{
          day: string;
          prompt_tokens: string;
          completion_tokens: string;
          total_tokens: string;
          cost: string;
          request_count: string;
        }>(
          `SELECT
             to_char(DATE(created_at), 'YYYY-MM-DD') AS day,
             COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(SUM(cost), 0) AS cost,
             COUNT(id) AS request_count
           FROM usage
           WHERE starship_id = $1
           GROUP BY 1
           ORDER BY day ${order}
           LIMIT $2 OFFSET $3`,
          [starshipId, limit, offset]
        );

        return (result || []).map((row) => ({
          day: String(row.day),
          totals: {
            promptTokens: Number(row.prompt_tokens) || 0,
            completionTokens: Number(row.completion_tokens) || 0,
            totalTokens: Number(row.total_tokens) || 0,
            cost: Number(row.cost) || 0,
          },
          requestCount: Number(row.request_count) || 0,
        }));
      },
      'listDailyByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * Count distinct days for a starship's usage (for pagination)
   */
  async countDailyByStarship(starshipId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const row = await conn.queryOne<{ total: string }>(
          `SELECT COUNT(DISTINCT DATE(created_at)) AS total
           FROM usage
           WHERE starship_id = $1`,
          [starshipId]
        );
        return Number(row?.total) || 0;
      },
      'countDailyByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * List aggregated usage per day and model for a starship (paginated)
   */
  async listDailyModelByStarship(
    starshipId: string,
    options: { limit?: number; offset?: number; order?: 'ASC' | 'DESC' } = {}
  ): Promise<DailyModelUsageRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const limit = Math.max(1, Math.min(200, options.limit ?? 100));
        const offset = Math.max(0, options.offset ?? 0);
        const order = options.order === 'ASC' ? 'ASC' : 'DESC';

        const conn = this.getConnection();
        const result = await conn.query<{
          day: string;
          model: string | null;
          prompt_tokens: string;
          completion_tokens: string;
          total_tokens: string;
          cost: string;
          request_count: string;
        }>(
          `SELECT
             to_char(DATE(created_at), 'YYYY-MM-DD') AS day,
             model,
             COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
             COALESCE(SUM(total_tokens), 0) AS total_tokens,
             COALESCE(SUM(cost), 0) AS cost,
             COUNT(id) AS request_count
           FROM usage
           WHERE starship_id = $1
           GROUP BY 1, 2
           ORDER BY day ${order}, model ASC
           LIMIT $2 OFFSET $3`,
          [starshipId, limit, offset]
        );

        return (result || []).map((row) => ({
          day: String(row.day),
          model: row.model ?? null,
          totals: {
            promptTokens: Number(row.prompt_tokens) || 0,
            completionTokens: Number(row.completion_tokens) || 0,
            totalTokens: Number(row.total_tokens) || 0,
            cost: Number(row.cost) || 0,
          },
          requestCount: Number(row.request_count) || 0,
        }));
      },
      'listDailyModelByStarship',
      'Usage',
      starshipId
    );
  }

  /**
   * Count distinct (day, model) pairs for a starship's usage (for pagination)
   */
  async countDailyModelByStarship(starshipId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const row = await conn.queryOne<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM (
             SELECT
               DATE(created_at) AS day,
               COALESCE(model, '') AS model_norm
             FROM usage
             WHERE starship_id = $1
             GROUP BY 1, 2
           ) t`,
          [starshipId]
        );
        return Number(row?.total) || 0;
      },
      'countDailyModelByStarship',
      'Usage',
      starshipId
    );
  }
}
