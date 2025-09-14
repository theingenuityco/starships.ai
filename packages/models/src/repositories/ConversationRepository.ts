import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, Conversation, ConversationModel, MessageModel, StarshipModel } from '@starships/protocol';
import { ConversationEntity } from '../entities/ConversationEntity';
import { MessageEntity } from '../entities/MessageEntity';

export class ConversationRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('ConversationRepository', connection);
  }

  async findAll(): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: ConversationModel }>('MATCH (c:Conversation) RETURN c ORDER BY c.createdAt DESC');
        return result.map((record) => ConversationEntity.fromDatabaseRecord(record.c as unknown as Record<string, unknown>));
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
        return result.length > 0 ? ConversationEntity.fromDatabaseRecord(result[0].c as unknown as Record<string, unknown>) : null;
      },
      'findById',
      'Conversation',
      id
    );
  }

  async create(entity: Conversation & { starshipId: string; agentId?: string }): Promise<ConversationModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from ConversationEntity
        const { starshipId, agentId, ...conversationInput } = entity;
        await ConversationEntity.validate(conversationInput, 'create');

        const now = new Date().toISOString();

        // Prepare conversation data with defaults and validation
        const conversationEntity = ConversationEntity.createFromRequest({
          ...conversationInput,
          createdAt: now,
          status: entity.status || 'active',
        });

        const conversationData = conversationEntity.toDatabaseFormat();
        // Remove id since it will be auto-generated
        delete (conversationData as { id?: string }).id;

        // Use BaseRepository serialization (the conversationData is already properly prepared)
        const result = await this.createEntityWithAutoId<ConversationModel>('Conversation', conversationData);

        // Create relationship with starship if starshipId is provided
        await this.linkToStarship(result.id, starshipId);

        if (agentId) {
          await this.linkToAgent(result.id, agentId);
        }

        // Use ConversationEntity for consistent mapping
        return ConversationEntity.fromDatabaseRecord(result as unknown as Record<string, unknown>);
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
        return ConversationEntity.fromDatabaseRecord(result[0].c as unknown as Record<string, unknown>);
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
           RETURN c ORDER BY c.createdAt DESC`,
          { starshipId }
        );
        return result.map((record) => ConversationEntity.fromDatabaseRecord(record.c as unknown as Record<string, unknown>));
      },
      'findByStarship',
      'Conversation'
    );
  }

  /**
   * Get the starship associated with a conversation using Neo4j relationships
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ starship: StarshipModel }>(
          `MATCH (starship:Starship)-[:HAS_CONVERSATION]->(c:Conversation {id: $conversationId})
           RETURN starship`,
          { conversationId }
        );
        return result.length > 0 ? result[0].starship : null;
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
           CREATE (s)-[:HAS_CONVERSATION {key: $key}]->(conversation)`,
          {
            starshipId,
            conversationId,
            key: `${starshipId}_${conversationId}`,
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
    orderBy: 'createdAt' = 'createdAt',
    orderDirection: 'asc' | 'desc' = 'asc'
  ): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const orderField = orderBy === 'createdAt' ? 'm.createdAt' : 'm.createdAt';
        const direction = orderDirection.toUpperCase();

        const result = await connection.executeQuery<{ m: MessageModel }>(
          `MATCH (c:Conversation {id: $conversationId})-[:HAS_MESSAGE]->(m:Message)
           RETURN m ORDER BY ${orderField} ${direction}`,
          { conversationId }
        );

        return result.map((record) => MessageEntity.fromDatabaseRecord(record.m as unknown as Record<string, unknown>));
      },
      'getConversationMessages',
      'Conversation'
    );
  }

  /**
   * Create relationship between existing conversation and agent
   */
  async linkToAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (c:Conversation {id: $conversationId}), (a:Agent {id: $agentId})
           CREATE (c)-[:INVOLVES_AGENT {key: $key, linkedAt: $timestamp}]->(a)`,
          {
            conversationId,
            agentId,
            key: `${conversationId}_${agentId}`,
            timestamp: new Date().toISOString(),
          }
        );
      },
      'linkToAgent',
      'Conversation'
    );
  }

  /**
   * Remove relationship between conversation and agent
   */
  async unlinkFromAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (c:Conversation {id: $conversationId})-[r:INVOLVES_AGENT]->(a:Agent {id: $agentId})
           DELETE r`,
          { conversationId, agentId }
        );
      },
      'unlinkFromAgent',
      'Conversation'
    );
  }

  /**
   * Get all agents involved in a conversation using Neo4j relationships
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          `MATCH (c:Conversation {id: $conversationId})-[:INVOLVES_AGENT]->(a:Agent)
           RETURN a`,
          { conversationId }
        );
        return result.map((record) => record.a);
      },
      'getConversationAgents',
      'Conversation'
    );
  }
}
