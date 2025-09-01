import { getConnection } from '../helpers/database';
import type { MemoryStateModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';

/**
 * Neo4j-based memory repository
 */
export class MemoryRepository extends BaseRepository {
  constructor() {
    super('MemoryRepository');
  }

  /**
   * Serialize complex objects for Neo4j storage
   */
  private serializeComplexFields(memory: MemoryStateModel): any {
    const serialized = {
      ...memory,
      messages: memory.messages ? JSON.stringify(memory.messages) : null,
    };

    // Handle AgentMemory specific fields
    if ('identity' in memory && memory.identity) {
      (serialized as any).identity = JSON.stringify(memory.identity);
    }
    if ('purpose' in memory && memory.purpose) {
      (serialized as any).purpose = JSON.stringify(memory.purpose);
    }
    if ('space' in memory && memory.space) {
      (serialized as any).space = JSON.stringify(memory.space);
    }

    return serialized;
  }

  /**
   * Deserialize complex objects from Neo4j storage
   */
  private deserializeComplexFields(memory: any): MemoryStateModel {
    try {
      const deserialized = {
        ...memory,
        messages: memory.messages ? JSON.parse(memory.messages) : [],
      };

      // Handle AgentMemory specific fields if they exist
      if (memory.identity) {
        deserialized.identity = JSON.parse(memory.identity);
      }
      if (memory.purpose) {
        deserialized.purpose = JSON.parse(memory.purpose);
      }
      if (memory.space) {
        deserialized.space = JSON.parse(memory.space);
      }

      return deserialized;
    } catch (error) {
      console.warn(`Failed to deserialize memory ${memory.id} complex fields:`, error);
      return {
        ...memory,
        messages: [],
        identity: undefined,
        purpose: undefined,
        space: undefined,
      };
    }
  }

  async findAll(): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) RETURN m ORDER BY m.createdAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findAll', 'Memory');
  }

  async findById(id: string): Promise<MemoryStateModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) WHERE m.id = $id RETURN m',
        { id }
      );
      const memory = result[0]?.m || null;
      return memory ? convertNeo4jIntsInObject(this.deserializeComplexFields(memory)) : null;
    }, 'findById', 'Memory', id);
  }

  async findByStarshipId(starshipId: string): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) RETURN m ORDER BY m.updatedAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByStarshipId', 'Memory');
  }

  async findByAgentId(agentId: string): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) RETURN m ORDER BY m.updatedAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByAgentId', 'Memory');
  }

  async findByTags(tags: string[]): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) RETURN m ORDER BY m.updatedAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findByTags', 'Memory');
  }


  async create(
    entity: Omit<MemoryStateModel, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<MemoryStateModel> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const now = new Date().toISOString();
      
      const messages = entity.messages || [];
      const memory: MemoryStateModel = {
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
        version: entity.version || '1.0.0',
        messages: messages,
        messageCount: messages.length,
        ...entity, // Include all other fields including AgentMemory-specific ones
      };

      // Handle AgentMemory specific fields if they exist
      const memoryForStorage = this.serializeComplexFields(memory);

      await connection.executeWrite(
        'CREATE (m:Memory $props) RETURN m',
        { props: memoryForStorage }
      );
      
      return convertNeo4jIntsInObject(memory);
    }, 'create', 'Memory');
  }


  async update(id: string, updates: Partial<MemoryStateModel>): Promise<MemoryStateModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      // Serialize complex fields in updates
      const serializedUpdates = this.serializeComplexFields(updateProps as any);

      const result = await connection.executeWrite<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) WHERE m.id = $id SET m += $updates RETURN m',
        { id, updates: serializedUpdates }
      );

      const memory = result[0]?.m || null;
      return memory ? convertNeo4jIntsInObject(this.deserializeComplexFields(memory)) : null;
    }, 'update', 'Memory', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (m:Memory) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'Memory', id);
  }

  async searchMemories(query: string, filters?: {
    starshipId?: string;
    agentId?: string;
    tags?: string[];
  }): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Memory) WHERE m.id IS NOT NULL';
      const params: any = {};

      cypher += ' RETURN m ORDER BY m.updatedAt DESC LIMIT 50';

      const result = await connection.executeQuery<{ m: MemoryStateModel }>(cypher, params);
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'searchMemories', 'Memory');
  }

  async getMemoryStats(id: string): Promise<{
    totalMessages: number;
    messagesByRole: { system: number; user: number; assistant: number };
    sizeInBytes: number;
    lastUpdated: string;
  } | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ m: MemoryStateModel }>(
        'MATCH (m:Memory) WHERE m.id = $id RETURN m',
        { id }
      );

      if (!result[0]?.m) {
        return null;
      }

      const memory = this.deserializeComplexFields(result[0].m);
      const messages = memory.messages || [];
      
      // Calculate statistics
      const messagesByRole = { system: 0, user: 0, assistant: 0 };
      messages.forEach((msg: any) => {
        if (msg.role && Object.prototype.hasOwnProperty.call(messagesByRole, msg.role)) {
          messagesByRole[msg.role as keyof typeof messagesByRole]++;
        }
      });

      const sizeInBytes = JSON.stringify(messages).length;

      return {
        totalMessages: messages.length,
        messagesByRole,
        sizeInBytes,
        lastUpdated: memory.updatedAt,
      };
    }, 'getMemoryStats', 'Memory', id);
  }

  async findWithFilters(filters: {
    starshipId?: string;
    agentId?: string;
    tags?: string[];
    hasMessages?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<MemoryStateModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      let cypher = 'MATCH (m:Memory) WHERE 1=1';
      const params: any = {};

      if (filters.hasMessages !== undefined) {
        if (filters.hasMessages) {
          cypher += ' AND m.messageCount > 0';
        } else {
          cypher += ' AND (m.messageCount = 0 OR m.messageCount IS NULL)';
        }
      }

      cypher += ' RETURN m ORDER BY m.updatedAt DESC';

      if (filters.limit) {
        cypher += ' SKIP $offset LIMIT $limit';
        params.offset = int(filters.offset || 0);
        params.limit = int(filters.limit);
      }

      const result = await connection.executeQuery<{ m: MemoryStateModel }>(cypher, params);
      return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.m)));
    }, 'findWithFilters', 'Memory');
  }
}