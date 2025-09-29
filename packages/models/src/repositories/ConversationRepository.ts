import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, Conversation, ConversationModel, MessageModel, StarshipModel } from '@starships/protocol';
import { AgentEntity } from '../entities/AgentEntity';
import { ConversationEntity } from '../entities/ConversationEntity';
import { MessageEntity } from '../entities/MessageEntity';
import { StarshipEntity } from '../entities/StarshipEntity';

export class ConversationRepository extends BaseRepository {
  constructor() {
    super('ConversationRepository');
  }

  async findAll(): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('conversations', 'created_at DESC');
        return fromDatabaseArray(ConversationEntity, result);
      },
      'findAll',
      'Conversation'
    );
  }

  async findById(id: string): Promise<ConversationModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('conversations', id);
        return result ? fromDatabase(ConversationEntity, result) : null;
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
        const conversationData = {
          ...conversationInput,
          starshipId, // Add starship_id foreign key directly
          status: entity.status || 'active',
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const conversationEntity = toEntityInstance(ConversationEntity, conversationData);
        const result = await this.createEntity<Record<string, unknown>>('conversations', toDatabase(conversationEntity));
        const conversation = fromDatabase(ConversationEntity, result);

        // Create junction table relationship with agent if provided
        if (agentId) {
          await this.linkToAgent(conversation.id, agentId);
        }

        return conversation;
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

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(ConversationEntity, updateProps));

        // Filter out protected fields (id, createdAt, starship_id)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, starship_id: _starshipId, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('conversations', id, filteredUpdateData);
        return result ? fromDatabase(ConversationEntity, result) : null;
      },
      'update',
      'Conversation',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL CASCADE rules will handle relationships automatically
        return await this.deleteEntity('conversations', id);
      },
      'delete',
      'Conversation',
      id
    );
  }

  /**
   * Find all conversations for a specific starship using foreign key
   */
  async findByStarship(starshipId: string): Promise<ConversationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM conversations WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(ConversationEntity, result);
      },
      'findByStarship',
      'Conversation'
    );
  }

  /**
   * Get the starship associated with a conversation using JOIN
   */
  async getConversationStarship(conversationId: string): Promise<StarshipModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT s.* FROM starships s
           INNER JOIN conversations c ON s.id = c.starship_id
           WHERE c.id = $1`,
          [conversationId]
        );
        return result ? fromDatabase(StarshipEntity, result) : null;
      },
      'getConversationStarship',
      'Conversation'
    );
  }

  /**
   * Update conversation's starship assignment (foreign key)
   */
  async linkToStarship(conversationId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE conversations SET starship_id = $1, updated_at = NOW() WHERE id = $2', [starshipId, conversationId]);
      },
      'linkToStarship',
      'Conversation'
    );
  }

  /**
   * Remove starship assignment from conversation
   */
  async unlinkFromStarship(conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE conversations SET starship_id = NULL, updated_at = NOW() WHERE id = $1', [conversationId]);
      },
      'unlinkFromStarship',
      'Conversation'
    );
  }

  /**
   * Get messages for a conversation using foreign key
   */
  async getConversationMessages(conversationId: string, orderDirection: 'asc' | 'desc' = 'asc'): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const direction = orderDirection.toUpperCase();

        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM messages
           WHERE conversation_id = $1
           ORDER BY created_at ${direction}`,
          [conversationId]
        );

        return fromDatabaseArray(MessageEntity, result);
      },
      'getConversationMessages',
      'Conversation'
    );
  }

  /**
   * Create relationship between conversation and agent using junction table
   */
  async linkToAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `INSERT INTO conversation_agents (conversation_id, agent_id, linked_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (conversation_id, agent_id) DO NOTHING`,
          [conversationId, agentId]
        );
      },
      'linkToAgent',
      'Conversation'
    );
  }

  /**
   * Remove relationship between conversation and agent from junction table
   */
  async unlinkFromAgent(conversationId: string, agentId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('DELETE FROM conversation_agents WHERE conversation_id = $1 AND agent_id = $2', [conversationId, agentId]);
      },
      'unlinkFromAgent',
      'Conversation'
    );
  }

  /**
   * Get all agents involved in a conversation using junction table
   */
  async getConversationAgents(conversationId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT a.* FROM agents a
           INNER JOIN conversation_agents ca ON a.id = ca.agent_id
           WHERE ca.conversation_id = $1
           ORDER BY a.name`,
          [conversationId]
        );

        return fromDatabaseArray(AgentEntity, result);
      },
      'getConversationAgents',
      'Conversation'
    );
  }
}
