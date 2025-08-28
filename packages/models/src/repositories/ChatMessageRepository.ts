import { getConnection } from '../helpers/database';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, ContentBlock, UsageStats } from '@starships/protocol';

export class ChatMessageRepository extends BaseRepository {
  constructor() {
    super('ChatMessageRepository');
  }

  /**
   * Create a new chat message
   */
  async create(data: {
    session_id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    structured_content?: ContentBlock[];
    stream_id?: string;
  }): Promise<ChatMessage> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired(data, ['session_id', 'role', 'content'], 'create');
      this.validateEnums(data, { role: ['user', 'assistant', 'system'] }, 'create');

      const connection = getConnection();
      const id = uuidv4();
      const now = new Date().toISOString();

      const messageData = {
        id,
        session_id: data.session_id,
        role: data.role,
        content: data.content,
        structured_content: data.structured_content ? JSON.stringify(data.structured_content) : null,
        timestamp: now,
        stream_id: data.stream_id || null
      };

      await connection.executeWrite(
        'CREATE (m:ChatMessage $props) RETURN m',
        { props: messageData }
      );

      // Create relationship with session
      await connection.executeWrite(
        `MATCH (cs:ChatSession {id: $sessionId}), (m:ChatMessage {id: $messageId})
         CREATE (m)-[:BELONGS_TO]->(cs)`,
        {
          sessionId: data.session_id,
          messageId: id
        }
      );

      return {
        ...messageData,
        structured_content: data.structured_content
      } as ChatMessage;
    }, 'create', 'ChatMessage');
  }

  /**
   * Find chat message by ID
   */
  async findById(id: string): Promise<ChatMessage | null> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'findById');

      const connection = getConnection();
      const result = await connection.executeQuery<{ m: any }>(
        'MATCH (m:ChatMessage {id: $id}) RETURN m',
        { id }
      );

      if (!result || result.length === 0) {
        return null;
      }

      const message = result[0].m;
      return this.parseChatMessageFromRecord(message);
    }, 'findById', 'ChatMessage', id);
  }

  /**
   * Find messages by session ID
   */
  async findBySession(sessionId: string, limit: number = 50, offset: number = 0): Promise<ChatMessage[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'findBySession');

      const connection = getConnection();
      const result = await connection.executeQuery<{ m: any }>(
        `MATCH (m:ChatMessage)-[:BELONGS_TO]->(cs:ChatSession {id: $sessionId})
         RETURN m
         ORDER BY m.timestamp ASC
         SKIP $offset
         LIMIT $limit`,
        { sessionId, limit, offset }
      );

      return result.map(record => this.parseChatMessageFromRecord(record.m));
    }, 'findBySession', 'ChatMessage');
  }

  /**
   * Get recent messages from a session
   */
  async getRecentMessages(sessionId: string, count: number = 10): Promise<ChatMessage[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'getRecentMessages');

      const connection = getConnection();
      const result = await connection.executeQuery<{ m: any }>(
        `MATCH (m:ChatMessage)-[:BELONGS_TO]->(cs:ChatSession {id: $sessionId})
         RETURN m
         ORDER BY m.timestamp DESC
         LIMIT $count`,
        { sessionId, count }
      );

      // Return in chronological order (oldest first)
      return result.reverse().map(record => this.parseChatMessageFromRecord(record.m));
    }, 'getRecentMessages', 'ChatMessage');
  }

  /**
   * Get conversation context (user/assistant pairs)
   */
  async getConversationContext(sessionId: string, messageLimit: number = 20): Promise<ChatMessage[]> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'getConversationContext');

      const connection = getConnection();
      const result = await connection.executeQuery<{ m: any }>(
        `MATCH (m:ChatMessage)-[:BELONGS_TO]->(cs:ChatSession {id: $sessionId})
         WHERE m.role IN ['user', 'assistant']
         RETURN m
         ORDER BY m.timestamp DESC
         LIMIT $messageLimit`,
        { sessionId, messageLimit }
      );

      // Return in chronological order for conversation flow
      return result.reverse().map(record => this.parseChatMessageFromRecord(record.m));
    }, 'getConversationContext', 'ChatMessage');
  }

  /**
   * Count messages in a session
   */
  async countBySession(sessionId: string): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'countBySession');

      const connection = getConnection();
      const result = await connection.executeQuery<{ count: number }>(
        `MATCH (m:ChatMessage)-[:BELONGS_TO]->(cs:ChatSession {id: $sessionId})
         RETURN count(m) as count`,
        { sessionId }
      );

      return Number(result[0]?.count || 0);
    }, 'countBySession', 'ChatMessage');
  }

  /**
   * Delete a chat message
   */
  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ id }, ['id'], 'delete');

      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (m:ChatMessage {id: $id}) DETACH DELETE m RETURN count(m) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'ChatMessage', id);
  }

  /**
   * Delete all messages for a session
   */
  async deleteBySession(sessionId: string): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      this.validateRequired({ sessionId }, ['sessionId'], 'deleteBySession');

      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        `MATCH (m:ChatMessage)-[:BELONGS_TO]->(cs:ChatSession {id: $sessionId})
         DETACH DELETE m 
         RETURN count(m) as deletedCount`,
        { sessionId }
      );

      return Number(result[0]?.deletedCount || 0);
    }, 'deleteBySession', 'ChatMessage');
  }

  /**
   * Parse chat message from Neo4j record, handling JSON fields
   */
  private parseChatMessageFromRecord(record: any): ChatMessage {
    return {
      id: record.id,
      session_id: record.session_id,
      role: record.role,
      content: record.content,
      structured_content: record.structured_content ? JSON.parse(record.structured_content) : undefined,
      timestamp: record.timestamp,
      stream_id: record.stream_id || undefined
    };
  }
}