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

        const now = new Date().toISOString();

        // Prepare conversation data with defaults and validation
        const conversationEntity = ConversationEntity.deserialize({
          ...entity,
          createdAt: now,
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
        if (updates.status !== undefined) {
          setFields.push('c.status = $status');
          params.status = updates.status;
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
          this.handleNotFound('Conversation', id);
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
}
