import { UsageEntity } from '@/entities/UsageEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from './BaseRepository';
import type { UsageModel, UsageTotals } from '@starships/protocol';

/**
 * UsageRepository
 *
 * Persists per-turn usage records and links them to both Starship and Conversation:
 *   (Starship)-[:HAS_USAGE]->(Usage)<-[:HAS_USAGE]-(Conversation)
 */
export class UsageRepository extends BaseRepository {
  constructor(connection?: any) {
    super('UsageRepository', connection);
  }

  /**
   * Create a Usage node and link it to Starship and Conversation
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
    updatedAt?: string;
  }): Promise<UsageModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate entity first
        await UsageEntity.validate(
          {
            starshipId: data.starshipId,
            conversationId: data.conversationId,
            promptTokens: data.promptTokens,
            completionTokens: data.completionTokens,
            totalTokens: data.totalTokens,
            cost: data.cost,
            model: data.model,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          },
          'create'
        );

        // Serialize and create Usage node with auto id
        const usageEntity = toEntityInstance(UsageEntity, {
          ...data,
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
        });
        const created = await this.createEntityWithAutoId<UsageModel>('Usage', toDatabase(usageEntity));

        // Link to Starship and Conversation
        const conn = this.getConnection();
        const linkKey = `${data.starshipId}_${data.conversationId}_${created.id}`;

        await conn.executeWrite(
          `
        MATCH (s:Starship {id: $starshipId}), (c:Conversation {id: $conversationId}), (u:Usage {id: $usageId})
        CREATE (s)-[:HAS_USAGE {key: $key}]->(u)
        CREATE (c)-[:HAS_USAGE {key: $key2}]->(u)
        `,
          {
            starshipId: data.starshipId,
            conversationId: data.conversationId,
            usageId: created.id,
            key: linkKey,
            key2: linkKey,
          }
        );

        return fromDatabase(UsageEntity, created);
      },
      'createAndLink',
      'Usage'
    );
  }

  /**
   * Aggregate totals for a conversation
   */
  async getTotalsByConversation(conversationId: string): Promise<UsageTotals> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const result = await conn.executeQuery<{
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          cost: number;
        }>(
          `
        MATCH (:Conversation {id: $conversationId})-[:HAS_USAGE]->(u:Usage)
        RETURN
          coalesce(sum(u.promptTokens), 0) AS promptTokens,
          coalesce(sum(u.completionTokens), 0) AS completionTokens,
          coalesce(sum(u.totalTokens), 0) AS totalTokens,
          coalesce(sum(u.cost), 0) AS cost
        `,
          { conversationId }
        );

        const row = result?.[0] || ({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 } as any);

        return {
          promptTokens: Number(row.promptTokens) || 0,
          completionTokens: Number(row.completionTokens) || 0,
          totalTokens: Number(row.totalTokens) || 0,
          cost: Number(row.cost) || 0,
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
  async getTotalsByStarship(starshipId: string): Promise<UsageTotals> {
    return this.executeWithErrorHandling(
      async () => {
        const conn = this.getConnection();
        const result = await conn.executeQuery<{
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          cost: number;
        }>(
          `
        MATCH (:Starship {id: $starshipId})-[:HAS_USAGE]->(u:Usage)
        RETURN
          coalesce(sum(u.promptTokens), 0) AS promptTokens,
          coalesce(sum(u.completionTokens), 0) AS completionTokens,
          coalesce(sum(u.totalTokens), 0) AS totalTokens,
          coalesce(sum(u.cost), 0) AS cost
        `,
          { starshipId }
        );

        const row = result?.[0] || ({ promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 } as any);

        return {
          promptTokens: Number(row.promptTokens) || 0,
          completionTokens: Number(row.completionTokens) || 0,
          totalTokens: Number(row.totalTokens) || 0,
          cost: Number(row.cost) || 0,
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
        const limit = Math.max(1, Math.min(200, options.limit ?? 100));
        const offset = Math.max(0, options.offset ?? 0);

        const conn = this.getConnection();
        const result = await conn.executeQuery<{ u: UsageModel }>(
          `
        MATCH (:Conversation {id: $conversationId})-[:HAS_USAGE]->(u:Usage)
        RETURN u
        ORDER BY u.createdAt ASC
        SKIP $offset LIMIT $limit
        `,
          { conversationId, offset, limit }
        );

        return fromDatabaseArray(
          UsageEntity,
          result.map((r) => r.u)
        );
      },
      'listByConversation',
      'Usage',
      conversationId
    );
  }
}
