import { MessageEntity } from '@/entities/MessageEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Message, MessageModel } from '@starships/protocol';

/**
 * Neo4j-based message repository following layered architecture
 */
export class MessageRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('MessageRepository', connection);
  }

  async findAll(): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MessageModel }>('MATCH (m:Message) RETURN m ORDER BY m.timestamp DESC');
        return fromDatabaseArray(
          MessageEntity,
          result.map((record) => record.m)
        );
      },
      'findAll',
      'Message'
    );
  }

  async findById(id: string): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MessageModel }>('MATCH (m:Message) WHERE m.id = $id RETURN m', { id });
        const message = result[0]?.m || null;
        return message ? fromDatabase(MessageEntity, message) : null;
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
        let cypher = 'MATCH (m:Message) WHERE m.role = $role';
        const params: Record<string, unknown> = { role };

        if (starshipId) {
          cypher += ' AND m.starshipId = $starshipId';
          params.starshipId = starshipId;
        }

        cypher += ' RETURN m ORDER BY m.timestamp DESC';

        const result = await connection.executeQuery<{ m: MessageModel }>(cypher, params);
        return fromDatabaseArray(
          MessageEntity,
          result.map((record) => record.m)
        );
      },
      'findByRole',
      'Message'
    );
  }

  async create(entity: Message & { conversationId: string }): Promise<MessageModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Extract conversationId before validation since it's not part of MessageEntity
        const { conversationId, ...messageInput } = entity;

        // Validate using Entity (without conversationId)
        await MessageEntity.validate(messageInput, 'create');

        const now = new Date().toISOString();

        const messageData = {
          // Additional database fields
          createdAt: now,
          updatedAt: now,
          // From base Message interface
          role: entity.role,
          content: entity.content,
          messageType: entity.messageType || 'user_input',
          ...(entity.reasoning ? { reasoning: entity.reasoning } : {}),
          // Persist tool_calls when provided (assistant function calling)
          ...(entity.tool_calls ? { tool_calls: entity.tool_calls } : {}),
          // Persist tool_call_id when provided (tool_result linking)
          ...(entity.tool_call_id ? { tool_call_id: entity.tool_call_id } : {}),
          // Persist provider-reported usage/cost metadata when provided
          ...(entity.usage ? { usage: entity.usage } : {}),
        };

        // Create entity instance from plain object, then serialize
        const messageEntity = toEntityInstance(MessageEntity, messageData);
        const result = await this.createEntityWithAutoId<MessageModel>('Message', toDatabase(messageEntity));

        // Create explicit Neo4j relationship with conversation if conversationId is provided
        await this.linkToConversation(result.id, conversationId);

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

        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Create entity instance from plain object, then serialize
        const updateEntity = toEntityInstance(MessageEntity, updateProps);
        const result = await connection.executeWrite<{ m: MessageModel }>('MATCH (m:Message) WHERE m.id = $id SET m += $updates RETURN m', {
          id,
          updates: toDatabase(updateEntity),
        });

        const message = result[0]?.m || null;
        return message ? fromDatabase(MessageEntity, message) : null;
      },
      'update',
      'Message',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (m:Message) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Message',
      id
    );
  }

  /**
   * Create explicit Neo4j relationship between message and conversation
   */
  async linkToConversation(messageId: string, conversationId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (c:Conversation {id: $conversationId}), (m:Message {id: $messageId})
           CREATE (c)-[:HAS_MESSAGE {key: $key}]->(m)`,
          {
            conversationId,
            messageId,
            key: `${conversationId}_${messageId}`,
          }
        );
      },
      'linkToConversation',
      'Message'
    );
  }

  /**
   * Remove explicit Neo4j relationship between message and conversation
   */
  async unlinkFromConversation(messageId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (c:Conversation)-[r:HAS_MESSAGE]->(m:Message {id: $messageId})
           DELETE r`,
          { messageId }
        );
      },
      'unlinkFromConversation',
      'Message'
    );
  }

  /**
   * Get conversation associated with a message using Neo4j relationship
   */
  async getMessageConversation(messageId: string): Promise<{ id: string; title: string; status: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ c: { id: string; title: string; status: string } }>(
          `MATCH (c:Conversation)-[:HAS_MESSAGE]->(m:Message {id: $messageId})
           RETURN c`,
          { messageId }
        );
        return result.length > 0
          ? {
              id: result[0].c.id,
              title: result[0].c.title,
              status: result[0].c.status,
            }
          : null;
      },
      'getMessageConversation',
      'Message'
    );
  }
}
