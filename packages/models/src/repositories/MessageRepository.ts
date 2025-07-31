import { BaseRepository } from './BaseRepository';
import { getConnection } from '../connection';
import { v4 as uuidv4 } from 'uuid';
import { convertNeo4jIntsInObject } from '../utils/neo4j-helpers';
import type { ChatMessage } from '@starships/protocol';

export class MessageRepository extends BaseRepository {
  constructor() {
    super('message');
  }

  async create(data: Omit<ChatMessage, 'id'>): Promise<ChatMessage> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const id = uuidv4();
        
        const messageData = {
          id,
          expeditionId: data.expeditionId,
          content: data.content,
          sender: data.sender,
          senderName: data.senderName || null,
          timestamp: data.timestamp,
          metadata: data.metadata ? JSON.stringify(data.metadata) : null
        };

        await connection.executeWrite(
          `
          MATCH (e:Expedition {id: $expeditionId})
          CREATE (m:Message {
            id: $id,
            expeditionId: $expeditionId,
            content: $content,
            sender: $sender,
            senderName: $senderName,
            timestamp: $timestamp,
            metadata: $metadata
          })
          CREATE (m)-[:BELONGS_TO]->(e)
          `,
          messageData
        );

        // Return the created message
        return {
          id,
          expeditionId: data.expeditionId,
          content: data.content,
          sender: data.sender,
          senderName: data.senderName,
          timestamp: data.timestamp,
          metadata: data.metadata
        } as ChatMessage;
      },
      'create',
      'Message'
    );
  }

  async findByExpeditionId(expeditionId: string, options?: { limit?: number }): Promise<ChatMessage[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        const limit = Math.floor(options?.limit || 50); // Ensure it's an integer
        
        const result = await connection.executeQuery<{ message: any }>(
          `
          MATCH (m:Message {expeditionId: $expeditionId})
          RETURN m as message
          ORDER BY m.timestamp DESC
          LIMIT toInteger($limit)
          `,
          { expeditionId, limit }
        );

        return result
          .map((record: any) => {
            const message = convertNeo4jIntsInObject(record.message);
            return {
              ...message,
              metadata: message.metadata ? JSON.parse(message.metadata) : undefined
            };
          })
          .reverse(); // Reverse to get chronological order
      },
      'findByExpeditionId',
      'Message'
    );
  }

  async findById(id: string): Promise<ChatMessage | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        const result = await connection.executeQuery<{ message: any }>(
          'MATCH (m:Message {id: $id}) RETURN m as message',
          { id }
        );

        if (!result.length) {
          return null;
        }

        const message = convertNeo4jIntsInObject(result[0].message);
        return {
          ...message,
          metadata: message.metadata ? JSON.parse(message.metadata) : undefined
        };
      },
      'findById',
      'Message'
    );
  }

  async updateStatus(id: string, status: 'pending' | 'sent' | 'failed'): Promise<ChatMessage | null> {
    return this.executeWithErrorHandling(
      async () => {
        const message = await this.findById(id);
        if (!message) return null;

        const connection = getConnection();
        const updatedMetadata = {
          ...(message.metadata || {}),
          status
        };

        await connection.executeWrite(
          `
          MATCH (m:Message {id: $id})
          SET m.metadata = $metadata
          `,
          {
            id,
            metadata: JSON.stringify(updatedMetadata)
          }
        );

        // Return the updated message
        return {
          ...message,
          metadata: updatedMetadata
        };
      },
      'updateStatus',
      'Message'
    );
  }

  async deleteByExpeditionId(expeditionId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = getConnection();
        
        // First count the messages
        const countResult = await connection.executeQuery<{ count: number }>(
          `MATCH (m:Message {expeditionId: $expeditionId}) RETURN count(m) as count`,
          { expeditionId }
        );
        
        const count = countResult[0]?.count || 0;
        
        if (count > 0) {
          // Then delete them
          await connection.executeWrite(
            `MATCH (m:Message {expeditionId: $expeditionId}) DETACH DELETE m`,
            { expeditionId }
          );
        }
        
        return count;
      },
      'deleteByExpeditionId',
      'Message'
    );
  }
}