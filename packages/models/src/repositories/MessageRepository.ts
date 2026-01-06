import { MessageEntity } from '@/entities/MessageEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Message, MessageModel } from '@starships/protocol';
import { nanoid } from 'nanoid';

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

  async create(entity: Message & { conversationId: string; starshipId?: string; attachmentIds?: string[] }): Promise<MessageModel> {
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
          // messages.id is a NOT NULL primary key with no DB default; provide one for the insert path.
          id: nanoid(),
          createdAt: now,
          updatedAt: now,
          conversationId,
          starshipId,
          role: entity.role,
          content: entity.content,
          messageType: entity.messageType || 'user_input',
          ...(typeof entity.turnId === 'string' ? { turnId: entity.turnId } : {}),
          ...(typeof entity.turnSeq === 'number' ? { turnSeq: entity.turnSeq } : {}),
          ...(entity.reasoning ? { reasoning: entity.reasoning } : {}),
          ...(entity.toolCalls ? { toolCalls: entity.toolCalls } : {}),
          ...(entity.toolCallId ? { toolCallId: entity.toolCallId } : {}),
          ...(entity.agentId ? { agentId: entity.agentId } : {}),
          ...(entity.agentName ? { agentName: entity.agentName } : {}),
          ...(entity.attachmentIds ? { attachmentIds: entity.attachmentIds } : {}),
        };

        // Validate with all required fields present (toolCalls must be an array for validation)
        await MessageEntity.validate(messageData, 'create');

        // Create entity instance from plain object, then serialize
        const messageEntity = toEntityInstance(MessageEntity, messageData);
        const serializedData = toDatabase(messageEntity);

        // CRITICAL: Stringify toolCalls array for JSONB column AFTER validation
        // node-postgres treats top-level Arrays as PostgreSQL arrays, not JSON
        // Note: After toDatabase(), property names are in snake_case
        if (serializedData.tool_calls && Array.isArray(serializedData.tool_calls)) {
          serializedData.tool_calls = JSON.stringify(serializedData.tool_calls);
        }

        const result = await this.createEntity<Record<string, unknown>>('messages', serializedData);
        return fromDatabase(MessageEntity, result);
      },
      'create',
      'Message'
    );
  }

  /**
   * Upsert a message into a stable turn slot (turn_id, turn_seq).
   * This is the core primitive for idempotent chat persistence under retries/races.
   *
   * Requires:
   * - messages.turn_id + messages.turn_seq columns
   * - unique index on (turn_id, turn_seq)
   */
  async upsertByTurnSlot(
    entity: Message & { conversationId: string; turnId: string; turnSeq: number; starshipId?: string; attachmentIds?: string[] }
  ): Promise<MessageModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const conversationId = entity.conversationId;
        const turnId = String(entity.turnId || '');
        const turnSeq = Number(entity.turnSeq);

        if (!turnId) {
          throw new Error('turnId is required');
        }
        if (!Number.isFinite(turnSeq) || !Number.isInteger(turnSeq) || turnSeq < 0 || turnSeq > 1_000_000) {
          throw new Error('turnSeq must be a non-negative integer <= 1,000,000');
        }

        // Validate turnId belongs to the same conversationId (prevents cross-conversation message attachment).
        const connection = this.getConnection();
        const turnRow = await connection.queryOne<{ conversation_id: string }>('SELECT conversation_id FROM turns WHERE id = $1', [turnId]);
        if (!turnRow) {
          throw new Error(`Turn ${turnId} not found`);
        }
        if (String(turnRow.conversation_id) !== conversationId) {
          throw new Error(`Turn ${turnId} does not belong to conversation ${conversationId}`);
        }

        // Get starshipId from conversation if not provided
        let starshipId = entity.starshipId;
        if (!starshipId) {
          const conversation = await connection.queryOne<{ starship_id: string }>('SELECT starship_id FROM conversations WHERE id = $1', [
            conversationId,
          ]);
          if (!conversation) {
            throw new Error(`Conversation ${conversationId} not found`);
          }
          starshipId = conversation.starship_id;
        }

        const messageData = {
          // messages.id is a NOT NULL primary key with no DB default; provide one for the insert path.
          id: nanoid(),
          createdAt: now,
          updatedAt: now,
          conversationId,
          starshipId,
          role: entity.role,
          content: entity.content,
          messageType: entity.messageType || 'user_input',
          turnId,
          turnSeq,
          ...(entity.reasoning ? { reasoning: entity.reasoning } : {}),
          ...(entity.toolCalls ? { toolCalls: entity.toolCalls } : {}),
          ...(entity.toolCallId ? { toolCallId: entity.toolCallId } : {}),
          ...(entity.agentId ? { agentId: entity.agentId } : {}),
          ...(entity.agentName ? { agentName: entity.agentName } : {}),
          ...(entity.attachmentIds ? { attachmentIds: entity.attachmentIds } : {}),
        };

        await MessageEntity.validate(messageData, 'create');
        const messageEntity = toEntityInstance(MessageEntity, messageData);
        const serializedData = toDatabase(messageEntity);

        // JSONB tool_calls must be stringified if an array
        if (serializedData.tool_calls && Array.isArray(serializedData.tool_calls)) {
          serializedData.tool_calls = JSON.stringify(serializedData.tool_calls);
        }

        const conn = this.getConnection();
        const columns = Object.keys(serializedData);
        const values = Object.values(serializedData);
        const placeholders = columns.map((_, i) => `$${i + 1}`);

        // Create a stable id on first insert; on conflict we keep existing id/created_at.
        const insertSql = `
          INSERT INTO messages (${columns.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT ON CONSTRAINT uq_messages_turn_id_turn_seq
          DO UPDATE SET
            updated_at = NOW(),
            role = EXCLUDED.role,
            content = EXCLUDED.content,
            message_type = EXCLUDED.message_type,
            reasoning = EXCLUDED.reasoning,
            tool_calls = EXCLUDED.tool_calls,
            tool_call_id = EXCLUDED.tool_call_id,
            agent_id = EXCLUDED.agent_id,
            agent_name = EXCLUDED.agent_name,
            attachment_ids = EXCLUDED.attachment_ids
          RETURNING *;
        `;

        const row = await conn.queryOne<Record<string, unknown>>(insertSql, values);
        if (!row) {
          throw new Error('Failed to upsert message');
        }
        return fromDatabase(MessageEntity, row);
      },
      'upsertByTurnSlot',
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

  /**
   * Find the latest tool message for a conversation by toolCallId.
   * Used to update placeholder tool results (e.g., approval-required → actual result).
   */
  async findLatestToolMessageByToolCallId(conversationId: string, toolCallId: string): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `
          SELECT *
          FROM messages
          WHERE conversation_id = $1
            AND role = 'tool'
            AND tool_call_id = $2
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [conversationId, toolCallId]
        );
        return row ? fromDatabase(MessageEntity, row) : null;
      },
      'findLatestToolMessageByToolCallId',
      'Message'
    );
  }
}
