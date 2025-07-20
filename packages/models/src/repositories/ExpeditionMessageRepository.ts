import { getConnection } from '../connection';
import {
  ExpeditionMessage,
  ExpeditionMessageRepository as ExpeditionMessageRepositoryInterface,
  MessageRole,
  MessageType
} from '../types';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';

/**
 * Neo4j-based expedition message repository
 * 
 * Handles all database operations for expedition messages including CRUD operations,
 * message threading, role-based filtering, and chat history management.
 */
export class ExpeditionMessageRepository implements ExpeditionMessageRepositoryInterface {
  
  /**
   * Find all messages (admin use only)
   */
  async findAll(): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      'MATCH (m:ExpeditionMessage) RETURN m ORDER BY m.timestamp DESC'
    );
    return result.map(record => record.m);
  }

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<ExpeditionMessage | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      'MATCH (m:ExpeditionMessage) WHERE m.id = $id RETURN m',
      { id }
    );
    return result[0]?.m || null;
  }

  /**
   * Find all messages for a specific expedition with pagination
   */
  async findByExpedition(expeditionId: string, limit?: number, offset?: number): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    
    let query = `
      MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
      RETURN m ORDER BY m.timestamp ASC
    `;
    
    const params: any = { expeditionId };
    
    if (limit !== undefined) {
      if (offset !== undefined) {
        query += ' SKIP $offset';
        params.offset = int(offset);
      }
      query += ' LIMIT $limit';
      params.limit = int(limit);
    }
    
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(query, params);
    return result.map(record => record.m);
  }

  /**
   * Find messages by role for an expedition
   */
  async findByRole(expeditionId: string, role: MessageRole): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       WHERE m.role = $role
       RETURN m ORDER BY m.timestamp ASC`,
      { expeditionId, role }
    );
    return result.map(record => record.m);
  }

  /**
   * Find messages by type for an expedition
   */
  async findByType(expeditionId: string, messageType: MessageType): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       WHERE m.messageType = $messageType
       RETURN m ORDER BY m.timestamp ASC`,
      { expeditionId, messageType }
    );
    return result.map(record => record.m);
  }

  /**
   * Find messages in a specific thread
   */
  async findByThread(threadId: string): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (m:ExpeditionMessage) 
       WHERE m.threadId = $threadId
       RETURN m ORDER BY m.timestamp ASC`,
      { threadId }
    );
    return result.map(record => record.m);
  }

  /**
   * Find messages from a specific agent in an expedition
   */
  async findByAgent(expeditionId: string, agentId: string): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       WHERE m.agentId = $agentId
       RETURN m ORDER BY m.timestamp ASC`,
      { expeditionId, agentId }
    );
    return result.map(record => record.m);
  }

  /**
   * Create a new message
   */
  async create(entity: Omit<ExpeditionMessage, 'id' | 'createdAt'>): Promise<ExpeditionMessage> {
    const connection = getConnection();
    const now = new Date().toISOString();
    
    const message: ExpeditionMessage = {
      ...entity,
      id: uuidv4(),
      timestamp: entity.timestamp || now,
      metadata: entity.metadata || {}
    };

    // Create message node
    await connection.executeWrite(
      'CREATE (m:ExpeditionMessage $props) RETURN m',
      { props: message }
    );

    // Create relationship with expedition
    await connection.executeWrite(
      `MATCH (e:Expedition {id: $expeditionId}), (m:ExpeditionMessage {id: $messageId})
       CREATE (e)-[:HAS_MESSAGE {timestamp: $timestamp}]->(m)`,
      {
        expeditionId: message.expeditionId,
        messageId: message.id,
        timestamp: message.timestamp
      }
    );

    // Create relationship with parent message if it's a reply
    if (message.parentMessageId) {
      await connection.executeWrite(
        `MATCH (parent:ExpeditionMessage {id: $parentId}), (child:ExpeditionMessage {id: $childId})
         CREATE (child)-[:REPLIES_TO {timestamp: $timestamp}]->(parent)`,
        {
          parentId: message.parentMessageId,
          childId: message.id,
          timestamp: message.timestamp
        }
      );
    }

    // Create relationship with agent if it's an agent message
    if (message.agentId) {
      await connection.executeWrite(
        `MATCH (a:Agent {id: $agentId}), (m:ExpeditionMessage {id: $messageId})
         CREATE (a)-[:SENT_MESSAGE {timestamp: $timestamp}]->(m)`,
        {
          agentId: message.agentId,
          messageId: message.id,
          timestamp: message.timestamp
        }
      );
    }

    // Create relationship with user if it's a user message
    if (message.userId) {
      await connection.executeWrite(
        `MATCH (u:User {id: $userId}), (m:ExpeditionMessage {id: $messageId})
         CREATE (u)-[:SENT_MESSAGE {timestamp: $timestamp}]->(m)`,
        {
          userId: message.userId,
          messageId: message.id,
          timestamp: message.timestamp
        }
      );
    }

    return message;
  }

  /**
   * Update a message
   */
  async update(id: string, updates: Partial<ExpeditionMessage>): Promise<ExpeditionMessage | null> {
    const connection = getConnection();
    
    const result = await connection.executeWrite<{ m: ExpeditionMessage }>(
      'MATCH (m:ExpeditionMessage) WHERE m.id = $id SET m += $updates RETURN m',
      { id, updates }
    );

    return result[0]?.m || null;
  }

  /**
   * Delete a message
   */
  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (m:ExpeditionMessage) WHERE m.id = $id 
       DETACH DELETE m 
       RETURN count(m) as deletedCount`,
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Get total message count for an expedition
   */
  async getMessageCount(expeditionId: string): Promise<number> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ count: number }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       RETURN count(m) as count`,
      { expeditionId }
    );
    return Number(result[0]?.count || 0);
  }

  /**
   * Get the latest messages for an expedition
   */
  async getLatestMessages(expeditionId: string, limit: number): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       RETURN m ORDER BY m.timestamp DESC LIMIT $limit`,
      { expeditionId, limit: int(limit) }
    );
    return result.map(record => record.m).reverse(); // Return in chronological order
  }

  /**
   * Search messages by content
   */
  async searchMessages(expeditionId: string, query: string): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       WHERE toLower(m.content) CONTAINS toLower($query)
       RETURN m ORDER BY m.timestamp ASC`,
      { expeditionId, query }
    );
    return result.map(record => record.m);
  }

  /**
   * Get message statistics for an expedition
   */
  async getMessageStats(expeditionId: string): Promise<{
    total: number;
    byRole: Record<MessageRole, number>;
    byType: Record<MessageType, number>;
    threaded: number;
    replies: number;
  }> {
    const connection = getConnection();
    
    // Get total and role/type counts
    const result = await connection.executeQuery<{
      total: number;
      userMessages: number;
      firstOfficerMessages: number;
      agentMessages: number;
      systemMessages: number;
      coordinationMessages: number;
      taskWorkMessages: number;
      userInputMessages: number;
      statusUpdateMessages: number;
      resultMessages: number;
      questionMessages: number;
      notificationMessages: number;
      threadedMessages: number;
      replyMessages: number;
    }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       WITH count(m) as total,
            count(CASE WHEN m.role = 'user' THEN 1 END) as userMessages,
            count(CASE WHEN m.role = 'first-officer' THEN 1 END) as firstOfficerMessages,
            count(CASE WHEN m.role = 'agent' THEN 1 END) as agentMessages,
            count(CASE WHEN m.role = 'system' THEN 1 END) as systemMessages,
            count(CASE WHEN m.messageType = 'coordination' THEN 1 END) as coordinationMessages,
            count(CASE WHEN m.messageType = 'task-work' THEN 1 END) as taskWorkMessages,
            count(CASE WHEN m.messageType = 'user-input' THEN 1 END) as userInputMessages,
            count(CASE WHEN m.messageType = 'status-update' THEN 1 END) as statusUpdateMessages,
            count(CASE WHEN m.messageType = 'result' THEN 1 END) as resultMessages,
            count(CASE WHEN m.messageType = 'question' THEN 1 END) as questionMessages,
            count(CASE WHEN m.messageType = 'notification' THEN 1 END) as notificationMessages,
            count(CASE WHEN m.threadId IS NOT NULL THEN 1 END) as threadedMessages,
            count(CASE WHEN m.parentMessageId IS NOT NULL THEN 1 END) as replyMessages
       RETURN total, userMessages, firstOfficerMessages, agentMessages, systemMessages,
              coordinationMessages, taskWorkMessages, userInputMessages, statusUpdateMessages,
              resultMessages, questionMessages, notificationMessages, threadedMessages, replyMessages`,
      { expeditionId }
    );

    const rawStats = result[0];
    
    // Handle case where no results are returned
    if (!rawStats) {
      return {
        total: 0,
        byRole: {
          user: 0,
          'first-officer': 0,
          agent: 0,
          system: 0
        },
        byType: {
          coordination: 0,
          'task-work': 0,
          'user-input': 0,
          'status-update': 0,
          result: 0,
          question: 0,
          notification: 0
        },
        threaded: 0,
        replies: 0
      };
    }

    // Convert BigInt values to numbers
    const totalNum = Number(rawStats.total);
    const userMessagesNum = Number(rawStats.userMessages);
    const firstOfficerMessagesNum = Number(rawStats.firstOfficerMessages);
    const agentMessagesNum = Number(rawStats.agentMessages);
    const systemMessagesNum = Number(rawStats.systemMessages);
    const coordinationMessagesNum = Number(rawStats.coordinationMessages);
    const taskWorkMessagesNum = Number(rawStats.taskWorkMessages);
    const userInputMessagesNum = Number(rawStats.userInputMessages);
    const statusUpdateMessagesNum = Number(rawStats.statusUpdateMessages);
    const resultMessagesNum = Number(rawStats.resultMessages);
    const questionMessagesNum = Number(rawStats.questionMessages);
    const notificationMessagesNum = Number(rawStats.notificationMessages);
    const threadedMessagesNum = Number(rawStats.threadedMessages);
    const replyMessagesNum = Number(rawStats.replyMessages);

    return {
      total: totalNum,
      byRole: {
        user: userMessagesNum,
        'first-officer': firstOfficerMessagesNum,
        agent: agentMessagesNum,
        system: systemMessagesNum
      },
      byType: {
        coordination: coordinationMessagesNum,
        'task-work': taskWorkMessagesNum,
        'user-input': userInputMessagesNum,
        'status-update': statusUpdateMessagesNum,
        result: resultMessagesNum,
        question: questionMessagesNum,
        notification: notificationMessagesNum
      },
      threaded: threadedMessagesNum,
      replies: replyMessagesNum
    };
  }

  /**
   * Delete all messages for an expedition
   */
  async deleteByExpedition(expeditionId: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      `MATCH (e:Expedition {id: $expeditionId})-[:HAS_MESSAGE]->(m:ExpeditionMessage)
       DETACH DELETE m
       RETURN count(m) as deletedCount`,
      { expeditionId }
    );

    return result[0]?.deletedCount > 0;
  }

  /**
   * Find message thread starting from a root message
   */
  async findThread(messageId: string): Promise<ExpeditionMessage[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: ExpeditionMessage }>(
      `MATCH (root:ExpeditionMessage {id: $messageId})
       OPTIONAL MATCH (root)<-[:REPLIES_TO*]-(reply:ExpeditionMessage)
       WITH root, collect(reply) as replies
       RETURN root as m
       UNION ALL
       MATCH (root:ExpeditionMessage {id: $messageId})
       MATCH (root)<-[:REPLIES_TO*]-(reply:ExpeditionMessage)
       RETURN reply as m
       ORDER BY m.timestamp ASC`,
      { messageId }
    );
    return result.map(record => record.m);
  }
}