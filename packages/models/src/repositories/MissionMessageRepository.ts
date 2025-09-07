import { convertNeo4jIntsInArray, convertNeo4jIntsInObject, getConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import { MissionMessageModel, MissionMessageRole } from '@starships/protocol';
import { int } from 'neo4j-driver';

export class MissionMessageRepository extends BaseRepository {
  constructor() {
    super('MissionMessageRepository');
  }

  async saveMessage(message: Omit<MissionMessageModel, 'id'>): Promise<MissionMessageModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!message.missionId || !message.role || !message.content || !message.timestamp) {
          this.handleValidationError(
            [{ field: 'message', message: 'missionId, role, content, and timestamp are required' }],
            'saveMessage'
          );
        }

        // Validate field types
        if (
          typeof message.missionId !== 'string' ||
          typeof message.role !== 'string' ||
          typeof message.content !== 'string' ||
          typeof message.timestamp !== 'string'
        ) {
          this.handleValidationError([{ field: 'message', message: 'Invalid field types' }], 'saveMessage');
        }

        // Validate role
        const validRoles: MissionMessageRole[] = ['user', 'orchestrator', 'system'];
        if (!validRoles.includes(message.role as MissionMessageRole)) {
          this.handleValidationError(
            [
              {
                field: 'role',
                message: `Role must be one of: ${validRoles.join(', ')}`,
                value: message.role,
              },
            ],
            'saveMessage'
          );
        }

        // Validate string lengths
        if (message.content.length < 1 || message.content.length > 10000) {
          this.handleValidationError([{ field: 'content', message: 'Content must be between 1 and 10000 characters' }], 'saveMessage');
        }

        if (message.senderName && (message.senderName.length < 1 || message.senderName.length > 200)) {
          this.handleValidationError([{ field: 'senderName', message: 'Sender name must be between 1 and 200 characters' }], 'saveMessage');
        }

        const connection = getConnection();

        // Check if mission exists
        const missionCheck = await connection.executeQuery<{ id: string }>('MATCH (m:Mission {id: $missionId}) RETURN m.id as id', {
          missionId: message.missionId,
        });

        if (!missionCheck || missionCheck.length === 0) {
          this.handleNotFound('Mission', message.missionId, 'saveMessage');
        }

        // Create message with auto-generated ID
        const createdMessage = await this.createEntityWithAutoId<MissionMessageModel>('MissionMessageModel', message);

        // Create relationships
        if (message.role === 'user' && message.userId) {
          // Create user relationship
          await connection.executeWrite(
            `MATCH (u:User {id: $userId}), (msg:MissionMessageModel {id: $messageId})
           CREATE (u)-[:SENT]->(msg)`,
            { userId: message.userId, messageId: createdMessage.id }
          );
        }

        // Create mission relationship
        await connection.executeWrite(
          `MATCH (m:Mission {id: $missionId}), (msg:MissionMessageModel {id: $messageId})
         CREATE (msg)-[:BELONGS_TO]->(m)`,
          { missionId: message.missionId, messageId: createdMessage.id }
        );

        return convertNeo4jIntsInObject(createdMessage);
      },
      'saveMessage',
      'MissionMessageModel'
    );
  }

  async getMessagesByMission(missionId: string, limit?: number, offset?: number): Promise<MissionMessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!missionId) {
          this.handleValidationError([{ field: 'missionId', message: 'missionId is required' }], 'getMessagesByMission');
        }

        const connection = getConnection();

        // Build query with optional LIMIT and SKIP
        let query = `
        MATCH (msg:MissionMessageModel)-[:BELONGS_TO]->(m:Mission {id: $missionId})
        RETURN msg
        ORDER BY msg.timestamp ASC
      `;

        const params: any = { missionId };

        if (limit !== undefined && limit > 0) {
          if (offset !== undefined && offset > 0) {
            query += ` SKIP $offset`;
            params.offset = int(Math.floor(offset));
          }
          query += ` LIMIT $limit`;
          params.limit = int(Math.floor(limit));
        }

        const result = await connection.executeQuery<{ msg: MissionMessageModel }>(query, params);

        return convertNeo4jIntsInArray(result?.map((record) => record.msg) || []);
      },
      'getMessagesByMission',
      'MissionMessageModel'
    );
  }

  async getMessageCount(missionId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!missionId) {
          this.handleValidationError([{ field: 'missionId', message: 'missionId is required' }], 'getMessageCount');
        }

        const connection = getConnection();

        const result = await connection.executeQuery<{ count: number }>(
          `MATCH (msg:MissionMessageModel)-[:BELONGS_TO]->(m:Mission {id: $missionId})
         RETURN count(msg) as count`,
          { missionId }
        );

        const count = result?.[0]?.count || 0;
        // Convert Neo4j integer to regular number
        return convertNeo4jIntsInObject({ count }).count;
      },
      'getMessageCount',
      'MissionMessageModel'
    );
  }

  async getMessagesByMissionWithPagination(
    missionId: string,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{
    messages: MissionMessageModel[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!missionId) {
          this.handleValidationError([{ field: 'missionId', message: 'missionId is required' }], 'getMessagesByMissionWithPagination');
        }

        // Validate pagination parameters
        if (page < 1) {
          this.handleValidationError(
            [
              {
                field: 'page',
                message: 'Page must be >= 1',
                value: page,
              },
            ],
            'getMessagesByMissionWithPagination'
          );
        }

        if (pageSize < 1 || pageSize > 200) {
          this.handleValidationError(
            [
              {
                field: 'pageSize',
                message: 'Page size must be between 1 and 200',
                value: pageSize,
              },
            ],
            'getMessagesByMissionWithPagination'
          );
        }

        // Calculate offset as regular number
        const offset = (page - 1) * pageSize;

        // Get total count and messages in parallel
        const [total, messages] = await Promise.all([
          this.getMessageCount(missionId),
          this.getMessagesByMission(missionId, pageSize, offset),
        ]);

        const totalPages = Math.ceil(total / pageSize);

        return {
          messages,
          total,
          page,
          pageSize,
          totalPages,
        };
      },
      'getMessagesByMissionWithPagination',
      'MissionMessageModel'
    );
  }

  async deleteMessagesByMission(missionId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!missionId) {
          this.handleValidationError([{ field: 'missionId', message: 'missionId is required' }], 'deleteMessagesByMission');
        }

        const connection = getConnection();

        // Check if mission exists
        const missionCheck = await connection.executeQuery<{ id: string }>('MATCH (m:Mission {id: $missionId}) RETURN m.id as id', {
          missionId,
        });

        if (!missionCheck || missionCheck.length === 0) {
          this.handleNotFound('Mission', missionId, 'deleteMessagesByMission');
        }

        // Delete all messages belonging to the mission
        await connection.executeWrite(
          `MATCH (msg:MissionMessageModel)-[:BELONGS_TO]->(m:Mission {id: $missionId})
         DETACH DELETE msg`,
          { missionId }
        );
      },
      'deleteMessagesByMission',
      'MissionMessageModel'
    );
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!messageId) {
          this.handleValidationError([{ field: 'messageId', message: 'messageId is required' }], 'deleteMessage');
        }

        const connection = getConnection();

        // Check if message exists
        const existingResult = await connection.executeQuery<{ msg: MissionMessageModel }>(
          'MATCH (msg:MissionMessageModel {id: $messageId}) RETURN msg',
          { messageId }
        );

        if (!existingResult || existingResult.length === 0) {
          this.handleNotFound('MissionMessageModel', messageId, 'deleteMessage');
        }

        // Delete the message
        await connection.executeWrite('MATCH (msg:MissionMessageModel {id: $messageId}) DETACH DELETE msg', { messageId });

        return true;
      },
      'deleteMessage',
      'MissionMessageModel',
      messageId
    );
  }

  async findMessageById(messageId: string): Promise<MissionMessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Basic validation - entities handle detailed validation
        if (!messageId) {
          this.handleValidationError([{ field: 'messageId', message: 'messageId is required' }], 'findMessageById');
        }

        const connection = getConnection();

        const result = await connection.executeQuery<{ msg: MissionMessageModel }>(
          'MATCH (msg:MissionMessageModel {id: $messageId}) RETURN msg',
          { messageId }
        );

        if (!result || result.length === 0) {
          return null;
        }

        return convertNeo4jIntsInObject(result[0].msg);
      },
      'findMessageById',
      'MissionMessageModel',
      messageId
    );
  }
}
