import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConversationModel } from '@starships/protocol';
import { ConversationEntity } from '../entities/ConversationEntity';

export class ConversationRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('ConversationRepository', connection);
  }

  async findAll(): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>(
          'MATCH (c:Conversation) RETURN c ORDER BY c.lastActivityAt DESC'
        );
        return result.map((record) => ConversationEntity.deserialize(record.c as unknown as Record<string, unknown>));
      },
      'findAll',
      'Conversation'
    );
  }

  async findById(id: string): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>('MATCH (c:Conversation) WHERE c.id = $id RETURN c', { id });
        return result.length > 0 ? ConversationEntity.deserialize(result[0].c as unknown as Record<string, unknown>) : null;
      },
      'findById',
      'Conversation',
      id
    );
  }

  async create(entity: Omit<ConversationModel, 'id' | 'createdAt' | 'updatedAt'>, starshipId?: string): Promise<ConversationModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from ConversationEntity
        await ConversationEntity.validate(entity, 'create');

        const connection = this.getConnection();
        const now = new Date().toISOString();

        // Prepare conversation data with defaults and validation
        const conversationEntity = ConversationEntity.deserialize({
          ...entity,
          createdAt: now,
          lastActivityAt: entity.lastActivityAt || now,
          messageCount: entity.messageCount || 0,
          totalTokens: entity.totalTokens || 0,
          status: entity.status || 'active',
        });

        const conversationData = conversationEntity.serialize();
        // Remove id since it will be auto-generated
        delete (conversationData as { id?: string }).id;

        // Use BaseRepository serialization (the conversationData is already properly prepared)
        const result = await this.createEntityWithAutoId<ConversationModel>('Conversation', conversationData);

        // Create relationship with starship if starshipId is provided
        if (starshipId) {
          await this.linkToStarship(result.id, starshipId);
        }

        // Use ConversationEntity for consistent mapping
        return ConversationEntity.deserialize(result as unknown as Record<string, unknown>);
      },
      'create',
      'Conversation'
    );
  }

  async update(id: string, updates: Partial<ConversationModel>): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from ConversationEntity for updates
        await ConversationEntity.validate(updates, 'update');

        const connection = this.getConnection();
        const setFields = [];
        const params: Record<string, unknown> = { id };

        // Handle updatable fields with proper serialization
        if (updates.lastActivityAt !== undefined) {
          setFields.push('c.lastActivityAt = $lastActivityAt');
          params.lastActivityAt = updates.lastActivityAt;
        }
        if (updates.messageCount !== undefined) {
          setFields.push('c.messageCount = $messageCount');
          params.messageCount = updates.messageCount;
        }
        if (updates.totalTokens !== undefined) {
          setFields.push('c.totalTokens = $totalTokens');
          params.totalTokens = updates.totalTokens;
        }
        if (updates.status !== undefined) {
          setFields.push('c.status = $status');
          params.status = updates.status;
        }
        if (updates.metadata !== undefined) {
          setFields.push('c.metadata = $metadata');
          // Use ConversationEntity to handle metadata serialization
          const tempEntity = ConversationEntity.deserialize({ metadata: updates.metadata });
          const serialized = tempEntity.serialize();
          params.metadata = serialized.metadata;
        }

        if (setFields.length === 0) {
          return this.findById(id);
        }

        // Always update the updatedAt field
        setFields.push('c.updatedAt = $updatedAt');
        params.updatedAt = new Date().toISOString();

        const result = await connection.executeWrite<{ c: ConversationModel }>(
          `MATCH (c:Conversation) WHERE c.id = $id
         SET ${setFields.join(', ')}
         RETURN c`,
          params
        );

        if (result.length === 0) {
          this.handleNotFound('Conversation', id, 'update');
        }

        // Use ConversationEntity for consistent mapping
        return ConversationEntity.deserialize(result[0].c as unknown as Record<string, unknown>);
      },
      'update',
      'Conversation',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (c:Conversation) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Conversation',
      id
    );
  }

  /**
   * Find all conversations for a specific starship using Neo4j relationships
   */
  async findByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>(
          `MATCH (starship:Starship {id: $starshipId})-[:HAS_CONVERSATION]->(c:Conversation)
           RETURN c ORDER BY c.lastActivityAt DESC`,
          { starshipId }
        );
        return result.map((record) => ConversationEntity.deserialize(record.c as unknown as Record<string, unknown>));
      },
      'findByStarship',
      'Conversation'
    );
  }

  /**
   * Get the starship associated with a conversation using Neo4j relationships
   */
  async getConversationStarship(conversationId: string): Promise<{ id: string; name: string; slug: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ starship: { id: string; name: string; slug: string } }>(
          `MATCH (starship:Starship)-[:HAS_CONVERSATION]->(c:Conversation {id: $conversationId})
           RETURN starship`,
          { conversationId }
        );
        return result.length > 0
          ? {
              id: result[0].starship.id,
              name: result[0].starship.name,
              slug: result[0].starship.slug,
            }
          : null;
      },
      'getConversationStarship',
      'Conversation'
    );
  }

  /**
   * Create relationship between existing conversation and starship
   */
  async linkToStarship(conversationId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (conversation:Conversation {id: $conversationId})
           CREATE (s)-[:HAS_CONVERSATION {id: $id}]->(conversation)`,
          {
            starshipId,
            conversationId,
            id: `${starshipId}_${conversationId}`,
          }
        );
      },
      'linkToStarship',
      'Conversation'
    );
  }

  /**
   * Remove relationship between conversation and starship
   */
  async unlinkFromStarship(conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship)-[r:HAS_CONVERSATION]->(conversation:Conversation {id: $conversationId})
           DELETE r`,
          { conversationId }
        );
      },
      'unlinkFromStarship',
      'Conversation'
    );
  }

  /**
   * Get messages for a conversation using Neo4j relationship
   */
  async getConversationMessages(
    conversationId: string,
    orderBy: 'timestamp' | 'created_at' = 'timestamp',
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Promise<Record<string, unknown>[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const orderField = orderBy === 'timestamp' ? 'm.timestamp' : 'm.createdAt';
        const direction = orderDirection.toUpperCase();

        const result = await connection.executeQuery<{ m: Record<string, unknown> }>(
          `MATCH (c:Conversation {id: $conversationId})-[:HAS_MESSAGE]->(m:Message)
           RETURN m ORDER BY ${orderField} ${direction}`,
          { conversationId }
        );

        return result.map((record) => record.m);
      },
      'getConversationMessages',
      'Conversation'
    );
  }

  /**
   * Update conversation statistics when messages are added/removed
   */
  async updateMessageStats(conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (c:Conversation {id: $conversationId})-[:HAS_MESSAGE]->(m:Message)
           WITH c, count(m) as messageCount, sum(m.tokenCount) as totalTokens, max(m.timestamp) as lastActivity
           SET c.messageCount = messageCount,
               c.totalTokens = COALESCE(totalTokens, 0),
               c.lastActivityAt = COALESCE(lastActivity, c.lastActivityAt),
               c.updatedAt = $updatedAt`,
          {
            conversationId,
            updatedAt: new Date().toISOString(),
          }
        );
      },
      'updateMessageStats',
      'Conversation'
    );
  }

  /**
   * Delete all messages in a conversation via relationships
   */
  async deleteAllMessages(conversationId: string): Promise<{ deletedCount: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          `MATCH (c:Conversation {id: $conversationId})-[r:HAS_MESSAGE]->(m:Message)
           DETACH DELETE m, r
           RETURN count(m) as deletedCount`,
          { conversationId }
        );

        // Update conversation stats after deleting messages
        await this.updateMessageStats(conversationId);

        return {
          deletedCount: result[0]?.deletedCount || 0,
        };
      },
      'deleteAllMessages',
      'Conversation'
    );
  }

  /**
   * Get conversation statistics using Neo4j relationships
   */
  async getConversationStats(conversationId: string): Promise<{
    messageCount: number;
    totalTokens: number;
    byRole: { system: number; user: number; assistant: number };
    lastMessageAt: string | null;
  }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{
          messageCount: number;
          totalTokens: number;
          roles: string[];
          lastMessageAt: string;
        }>(
          `MATCH (c:Conversation {id: $conversationId})-[:HAS_MESSAGE]->(m:Message)
           RETURN count(m) as messageCount,
                  sum(m.tokenCount) as totalTokens,
                  collect(m.role) as roles,
                  max(m.timestamp) as lastMessageAt`,
          { conversationId }
        );

        const record = result[0];
        if (!record || record.messageCount === 0) {
          return {
            messageCount: 0,
            totalTokens: 0,
            byRole: { system: 0, user: 0, assistant: 0 },
            lastMessageAt: null,
          };
        }

        // Count by role
        const byRole = { system: 0, user: 0, assistant: 0 };
        record.roles.forEach((role: string) => {
          if (Object.prototype.hasOwnProperty.call(byRole, role)) {
            byRole[role as keyof typeof byRole]++;
          }
        });

        return {
          messageCount: Number(record.messageCount),
          totalTokens: Number(record.totalTokens) || 0,
          byRole,
          lastMessageAt: record.lastMessageAt,
        };
      },
      'getConversationStats',
      'Conversation'
    );
  }
}
