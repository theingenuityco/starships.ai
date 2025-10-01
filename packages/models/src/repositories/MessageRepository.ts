import { MessageEntity } from '@/entities/MessageEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Message, MessageModel } from '@starships/protocol';

/**
 * PostgreSQL-based message repository following layered architecture
 */
export class MessageRepository extends BaseRepository {
  constructor() {
    super('MessageRepository');
  }

  async findAll(): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('messages', 'created_at DESC');
        return fromDatabaseArray(MessageEntity, result);
      },
      'findAll',
      'Message'
    );
  }

  async findById(id: string): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('messages', id);
        return result ? fromDatabase(MessageEntity, result) : null;
      },
      'findById',
      'Message',
      id
    );
  }

  async findByRole(role: 'system' | 'user' | 'assistant', starshipId?: string): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'SELECT * FROM messages WHERE role = $1';
        const params: unknown[] = [role];

        if (starshipId) {
          query += ' AND starship_id = $2';
          params.push(starshipId);
        }

        query += ' ORDER BY created_at DESC';

        const result = await connection.query<Record<string, unknown>>(query, params);
        return fromDatabaseArray(MessageEntity, result);
      },
      'findByRole',
      'Message'
    );
  }

  async create(entity: Message & { conversationId: string; starshipId?: string }): Promise<MessageModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const conversationId = entity.conversationId;

        // Get starshipId from conversation if not provided
        let starshipId = entity.starshipId;
        if (!starshipId) {
          const connection = this.getConnection();
          const conversation = await connection.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [
            conversationId,
          ]);
          if (!conversation) {
            throw new Error(`Conversation ${conversationId} not found`);
          }
          starshipId = conversation.starship_id;
        }

        // Build message data with all required fields including foreign keys
        const messageData = {
          createdAt: now,
          updatedAt: now,
          conversationId,
          starshipId,
          role: entity.role,
          content: entity.content,
          messageType: entity.messageType || 'user_input',
          ...(entity.reasoning ? { reasoning: entity.reasoning } : {}),
          ...(entity.toolCalls ? { toolCalls: entity.toolCalls } : {}),
          ...(entity.toolCallId ? { toolCallId: entity.toolCallId } : {}),
        };

        // Validate with all required fields present (toolCalls must be an array for validation)
        await MessageEntity.validate(messageData, 'create');

        // Create entity instance from plain object, then serialize
        const messageEntity = toEntityInstance(MessageEntity, messageData);
        const serializedData = toDatabase(messageEntity);

        // CRITICAL: Stringify toolCalls array for JSONB column AFTER validation
        // node-postgres treats top-level Arrays as PostgreSQL arrays, not JSON
        if (serializedData.toolCalls && Array.isArray(serializedData.toolCalls)) {
          serializedData.toolCalls = JSON.stringify(serializedData.toolCalls);
        }

        const result = await this.createEntity<Record<string, unknown>>('messages', serializedData);

        return fromDatabase(MessageEntity, result);
      },
      'create',
      'Message'
    );
  }

  async update(id: string, updates: Partial<MessageModel>): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await MessageEntity.validate(updates, 'update');

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(MessageEntity, updateProps));

        // Filter out protected fields (id, createdAt, conversation_id, starship_id)
        const {
          id: _id,
          created_at: _createdAt,
          conversation_id: _conversationId,
          starship_id: _starshipId,
          ...filteredUpdateData
        } = updateData;
        // Suppress ESLint warnings for unused destructured variables used for filtering
        void _id;
        void _createdAt;
        void _conversationId;
        void _starshipId;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('messages', id, filteredUpdateData);
        return result ? fromDatabase(MessageEntity, result) : null;
      },
      'update',
      'Message',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL CASCADE rules will handle relationships automatically
        return await this.deleteEntity('messages', id);
      },
      'delete',
      'Message',
      id
    );
  }

  /**
   * Link message to conversation using foreign key (conversation_id is set during creation)
   */
  async linkToConversation(messageId: string, conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE messages SET conversation_id = $1, updated_at = NOW() WHERE id = $2', [conversationId, messageId]);
      },
      'linkToConversation',
      'Message'
    );
  }

  /**
   * Remove conversation association from message
   */
  async unlinkFromConversation(messageId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query('UPDATE messages SET conversation_id = NULL, updated_at = NOW() WHERE id = $1', [messageId]);
      },
      'unlinkFromConversation',
      'Message'
    );
  }

  /**
   * Get conversation associated with a message using JOIN
   */
  async getMessageConversation(messageId: string): Promise<{ id: string; title: string; status: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<{ id: string; title: string; status: string }>(
          `SELECT c.id, c.title, c.status
           FROM conversations c
           INNER JOIN messages m ON c.id = m.conversation_id
           WHERE m.id = $1`,
          [messageId]
        );
        return result || null;
      },
      'getMessageConversation',
      'Message'
    );
  }
}
