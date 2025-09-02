import { getConnection } from '../helpers/database';
import type { MessageModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';

/**
 * Neo4j-based message repository
 */
export class MessageRepository extends BaseRepository {
  constructor() {
    super('MessageRepository');
  }

  /**
   * Serialize complex objects for Neo4j storage
   */
  private serializeComplexFields(message: MessageModel): any {
    return {
      ...message,
      metadata: message.metadata ? JSON.stringify(message.metadata) : null,
      processingMetadata: message.processingMetadata ? JSON.stringify(message.processingMetadata) : null,
    };
  }

  /**
   * Deserialize complex objects from Neo4j storage
   */
  private deserializeComplexFields(message: any): MessageModel {
    try {
      return {
        ...message,
        metadata: message.metadata ? JSON.parse(message.metadata) : undefined,
        processingMetadata: message.processingMetadata ? JSON.parse(message.processingMetadata) : undefined,
      };
    } catch (error) {
      console.warn(`Failed to deserialize message ${message.id} complex fields:`, error);
      return {
        ...message,
        metadata: undefined,
        processingMetadata: undefined,
      };
    }
  }

  async findAll(): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MessageModel }>(
        'MATCH (m:Message) RETURN m ORDER BY m.timestamp DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findAll', 'Message');
  }

  async findById(id: string): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MessageModel }>(
        'MATCH (m:Message) WHERE m.id = $id RETURN m',
        { id }
      );
      const message = result[0]?.m || null;
      return message ? convertNeo4jIntsInObject(this.deserializeComplexFields(message)) : null;
    }, 'findById', 'Message', id);
  }

  async findByStarshipId(starshipId: string): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MessageModel }>(
        'MATCH (m:Message) WHERE m.starshipId = $starshipId RETURN m ORDER BY m.timestamp DESC',
        { starshipId }
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByStarshipId', 'Message');
  }

  async findByAgentId(agentId: string): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MessageModel }>(
        'MATCH (m:Message) WHERE m.agentId = $agentId RETURN m ORDER BY m.timestamp DESC',
        { agentId }
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByAgentId', 'Message');
  }

  async findByMemoryId(memoryId: string): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MessageModel }>(
        'MATCH (m:Message) WHERE m.memoryId = $memoryId RETURN m ORDER BY m.timestamp ASC',
        { memoryId }
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByMemoryId', 'Message');
  }

  async findByConversationId(conversationId: string, limit?: number, offset?: number): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Message) WHERE m.conversationId = $conversationId RETURN m ORDER BY m.timestamp ASC';
      const params: any = { conversationId };

      if (limit) {
        cypher += ' SKIP $offset LIMIT $limit';
        params.offset = int(offset || 0);
        params.limit = int(limit);
      }

      const result = await connection.executeQuery<{ m: MessageModel }>(cypher, params);
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByConversationId', 'Message');
  }

  async findByRole(role: 'system' | 'user' | 'assistant', starshipId?: string): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Message) WHERE m.role = $role';
      const params: any = { role };

      if (starshipId) {
        cypher += ' AND m.starshipId = $starshipId';
        params.starshipId = starshipId;
      }

      cypher += ' RETURN m ORDER BY m.timestamp DESC';

      const result = await connection.executeQuery<{ m: MessageModel }>(cypher, params);
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByRole', 'Message');
  }

  async create(
    entity: Omit<MessageModel, 'id' | 'createdAt' | 'updatedAt' | 'contentLength'>
  ): Promise<MessageModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate required fields
      this.validateRequired(entity, ['role', 'content', 'starshipId'], 'create');
      this.validateEnums(entity, { role: ['system', 'user', 'assistant'] }, 'create');

      const connection = getConnection();
      const now = new Date().toISOString();
      
      const message: MessageModel = {
        // From base Message interface
        id: uuidv4(),
        timestamp: entity.timestamp || now,
        role: entity.role,
        content: entity.content,
        metadata: entity.metadata,
        
        // Additional database fields
        createdAt: now,
        updatedAt: now,
        version: entity.version || '1.0.0',
        starshipId: entity.starshipId,
        agentId: entity.agentId,
        memoryId: entity.memoryId,
        conversationId: entity.conversationId,
        parentMessageId: entity.parentMessageId,
        threadDepth: entity.threadDepth || 0,
        processingStatus: entity.processingStatus || 'pending',
        processingMetadata: entity.processingMetadata,
        messageType: entity.messageType || 'user_input',
        importance: entity.importance || 'medium',
        contentHash: entity.contentHash,
        contentLength: entity.content.length,
        hasAttachments: entity.hasAttachments || false,
        tokenCount: entity.tokenCount,
        processingTimeMs: entity.processingTimeMs,
      };

      const messageForStorage = this.serializeComplexFields(message);

      await connection.executeWrite(
        'CREATE (m:Message $props) RETURN m',
        { props: messageForStorage }
      );
      
      return convertNeo4jIntsInObject(message);
    }, 'create', 'Message');
  }

  async update(id: string, updates: Partial<MessageModel>): Promise<MessageModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Update content length if content is being updated
      if (updates.content) {
        updateProps.contentLength = updates.content.length;
      }

      // Serialize complex fields in updates
      const serializedUpdates = this.serializeComplexFields(updateProps as any);

      const result = await connection.executeWrite<{ m: MessageModel }>(
        'MATCH (m:Message) WHERE m.id = $id SET m += $updates RETURN m',
        { id, updates: serializedUpdates }
      );

      const message = result[0]?.m || null;
      return message ? convertNeo4jIntsInObject(this.deserializeComplexFields(message)) : null;
    }, 'update', 'Message', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (m:Message) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'Message', id);
  }

  async getMessageThread(messageId: string, includeParents = true, includeChildren = true, maxDepth = 10): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const thread: MessageModel[] = [];

      // Get the root message
      const rootMessage = await this.findById(messageId);
      if (!rootMessage) {
        return [];
      }
      thread.push(rootMessage);

      // Get parent messages if requested
      if (includeParents && rootMessage.parentMessageId) {
        const parents = await this.getParentMessages(rootMessage.parentMessageId, maxDepth);
        thread.unshift(...parents);
      }

      // Get child messages if requested
      if (includeChildren) {
        const children = await this.getChildMessages(messageId, maxDepth);
        thread.push(...children);
      }

      return thread;
    }, 'getMessageThread', 'Message', messageId);
  }

  private async getParentMessages(parentId: string, maxDepth: number, currentDepth = 0, visited: Set<string> = new Set()): Promise<MessageModel[]> {
    if (currentDepth >= maxDepth || visited.has(parentId)) return [];
    
    visited.add(parentId);
    
    const parent = await this.findById(parentId);
    if (!parent) return [];
    
    const parents = [parent];
    if (parent.parentMessageId) {
      const grandParents = await this.getParentMessages(parent.parentMessageId, maxDepth, currentDepth + 1, visited);
      parents.unshift(...grandParents);
    }
    
    return parents;
  }

  private async getChildMessages(parentId: string, maxDepth: number, currentDepth = 0, visited: Set<string> = new Set()): Promise<MessageModel[]> {
    if (currentDepth >= maxDepth || visited.has(parentId)) return [];
    
    visited.add(parentId);
    
    const connection = getConnection();
    const result = await connection.executeQuery<{ m: MessageModel }>(
      'MATCH (m:Message) WHERE m.parentMessageId = $parentId RETURN m ORDER BY m.timestamp ASC',
      { parentId }
    );
    
    const children = result.map((record) => this.deserializeComplexFields(record.m));
    const allChildren: MessageModel[] = [];
    const seenIds = new Set<string>();
    
    // Process each child
    for (const child of children) {
      // Skip if we've already processed this message ID
      if (seenIds.has(child.id)) continue;
      
      seenIds.add(child.id);
      allChildren.push(child);
      
      // Recursively get grandchildren
      const grandChildren = await this.getChildMessages(child.id, maxDepth, currentDepth + 1, visited);
      
      // Add grandchildren, avoiding duplicates
      for (const grandChild of grandChildren) {
        if (!seenIds.has(grandChild.id)) {
          seenIds.add(grandChild.id);
          allChildren.push(grandChild);
        }
      }
    }
    
    return allChildren;
  }

  async searchMessages(query: string, filters?: {
    starshipId?: string;
    agentId?: string;
    memoryId?: string;
    conversationId?: string;
    role?: 'system' | 'user' | 'assistant';
    messageType?: string;
    importance?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Message) WHERE m.content CONTAINS $query';
      const params: any = { query };

      // Add filters
      if (filters?.starshipId) {
        cypher += ' AND m.starshipId = $starshipId';
        params.starshipId = filters.starshipId;
      }

      if (filters?.agentId) {
        cypher += ' AND m.agentId = $agentId';
        params.agentId = filters.agentId;
      }

      if (filters?.memoryId) {
        cypher += ' AND m.memoryId = $memoryId';
        params.memoryId = filters.memoryId;
      }

      if (filters?.conversationId) {
        cypher += ' AND m.conversationId = $conversationId';
        params.conversationId = filters.conversationId;
      }

      if (filters?.role) {
        cypher += ' AND m.role = $role';
        params.role = filters.role;
      }

      if (filters?.messageType) {
        cypher += ' AND m.messageType = $messageType';
        params.messageType = filters.messageType;
      }

      if (filters?.importance) {
        cypher += ' AND m.importance = $importance';
        params.importance = filters.importance;
      }

      if (filters?.dateFrom) {
        cypher += ' AND m.timestamp >= $dateFrom';
        params.dateFrom = filters.dateFrom;
      }

      if (filters?.dateTo) {
        cypher += ' AND m.timestamp <= $dateTo';
        params.dateTo = filters.dateTo;
      }

      cypher += ' RETURN m ORDER BY m.timestamp DESC';

      if (filters?.limit) {
        cypher += ' SKIP $offset LIMIT $limit';
        params.offset = int(filters.offset || 0);
        params.limit = int(filters.limit);
      } else {
        cypher += ' LIMIT 100'; // Default limit
      }

      const result = await connection.executeQuery<{ m: MessageModel }>(cypher, params);
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'searchMessages', 'Message');
  }

  async getConversationMessages(conversationId: string, orderBy: 'timestamp' | 'created_at' = 'timestamp', orderDirection: 'asc' | 'desc' = 'asc'): Promise<MessageModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const orderField = orderBy === 'timestamp' ? 'm.timestamp' : 'm.createdAt';
      const direction = orderDirection.toUpperCase();
      
      const result = await connection.executeQuery<{ m: MessageModel }>(
        `MATCH (m:Message) WHERE m.conversationId = $conversationId 
         RETURN m ORDER BY ${orderField} ${direction}`,
        { conversationId }
      );
      
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'getConversationMessages', 'Message');
  }

  async bulkDelete(messageIds: string[]): Promise<{ processed: number; failed: number; errors: Array<{ messageId: string; error: string }> }> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (m:Message) WHERE m.id IN $messageIds DETACH DELETE m RETURN count(m) as deletedCount',
        { messageIds }
      );

      const deletedCount = result[0]?.deletedCount || 0;
      
      return {
        processed: deletedCount,
        failed: messageIds.length - deletedCount,
        errors: [] // Neo4j batch delete doesn't provide individual errors
      };
    }, 'bulkDelete', 'Message');
  }

  async getMessageStats(filters?: {
    starshipId?: string;
    agentId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{
    total: number;
    byRole: { system: number; user: number; assistant: number };
    byType: Record<string, number>;
    byImportance: Record<string, number>;
    averageContentLength: number;
    averageProcessingTime?: number;
  }> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Message) WHERE 1=1';
      const params: any = {};

      // Apply filters
      if (filters?.starshipId) {
        cypher += ' AND m.starshipId = $starshipId';
        params.starshipId = filters.starshipId;
      }

      if (filters?.agentId) {
        cypher += ' AND m.agentId = $agentId';
        params.agentId = filters.agentId;
      }

      if (filters?.dateFrom) {
        cypher += ' AND m.timestamp >= $dateFrom';
        params.dateFrom = filters.dateFrom;
      }

      if (filters?.dateTo) {
        cypher += ' AND m.timestamp <= $dateTo';
        params.dateTo = filters.dateTo;
      }

      cypher += ` RETURN 
        count(m) as total,
        collect(m.role) as roles,
        collect(m.messageType) as messageTypes,
        collect(m.importance) as importances,
        avg(m.contentLength) as avgContentLength,
        avg(m.processingTimeMs) as avgProcessingTime`;

      const result = await connection.executeQuery<{
        total: number;
        roles: string[];
        messageTypes: string[];
        importances: string[];
        avgContentLength: number;
        avgProcessingTime: number;
      }>(cypher, params);

      const record = result[0];
      if (!record) {
        return {
          total: 0,
          byRole: { system: 0, user: 0, assistant: 0 },
          byType: {},
          byImportance: {},
          averageContentLength: 0,
        };
      }

      // Count by role
      const byRole = { system: 0, user: 0, assistant: 0 };
      record.roles.forEach(role => {
        if (Object.prototype.hasOwnProperty.call(byRole, role)) {
          byRole[role as keyof typeof byRole]++;
        }
      });

      // Count by type
      const byType: Record<string, number> = {};
      record.messageTypes.forEach(type => {
        if (type) {
          byType[type] = (byType[type] || 0) + 1;
        }
      });

      // Count by importance
      const byImportance: Record<string, number> = {};
      record.importances.forEach(importance => {
        if (importance) {
          byImportance[importance] = (byImportance[importance] || 0) + 1;
        }
      });

      return {
        total: Number(record.total),
        byRole,
        byType,
        byImportance,
        averageContentLength: Number(record.avgContentLength) || 0,
        averageProcessingTime: record.avgProcessingTime ? Number(record.avgProcessingTime) : undefined,
      };
    }, 'getMessageStats', 'Message');
  }
}