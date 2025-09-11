import { convertNeo4jIntsInArray, convertNeo4jIntsInObject, Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { MemoryModel } from '@starships/protocol';
import { int } from 'neo4j-driver';

/**
 * Neo4j-based memory repository
 */
export class MemoryRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('MemoryRepository', connection);
  }

  /**
   * Serialize complex objects for Neo4j storage
   */
  private serializeComplexFields(memory: MemoryModel): Record<string, unknown> {
    const serialized = {
      ...memory,
      state: memory.state ? JSON.stringify(memory.state) : '{}',
    };

    return serialized;
  }

  /**
   * Deserialize complex objects from Neo4j storage
   */
  private deserializeComplexFields(memory: Record<string, unknown>): MemoryModel {
    try {
      const deserialized = {
        ...memory,
        state: memory.state && typeof memory.state === 'string' ? JSON.parse(memory.state) : memory.state || {},
      } as MemoryModel;

      return deserialized;
    } catch (error) {
      console.warn(`Failed to deserialize memory ${memory.id} complex fields:`, error);
      return {
        ...memory,
        state: {},
      } as MemoryModel;
    }
  }

  async findAll(): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>('MATCH (m:Memory) RETURN m ORDER BY m.createdAt DESC');
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'findAll',
      'Memory'
    );
  }

  async findById(id: string): Promise<MemoryModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>('MATCH (m:Memory) WHERE m.id = $id RETURN m', { id });
        const memory = result[0]?.m || null;
        return memory ? convertNeo4jIntsInObject(this.deserializeComplexFields(memory as unknown as Record<string, unknown>)) : null;
      },
      'findById',
      'Memory',
      id
    );
  }

  async findByStarshipId(starshipId: string): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>(
          'MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory) RETURN m ORDER BY m.updatedAt DESC',
          { starshipId }
        );
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'findByStarshipId',
      'Memory'
    );
  }

  async findByAgentId(agentId: string): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>(
          'MATCH (a:Agent {id: $agentId})-[:HAS_MEMORY]->(m:Memory) RETURN m ORDER BY m.updatedAt DESC',
          { agentId }
        );
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'findByAgentId',
      'Memory'
    );
  }

  async findByTags(tags: string[]): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>(
          'MATCH (m:Memory) WHERE any(tag IN $tags WHERE tag IN m.tags) RETURN m ORDER BY m.updatedAt DESC',
          { tags }
        );
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'findByTags',
      'Memory'
    );
  }

  async create(
    entity: Omit<MemoryModel, 'id' | 'createdAt' | 'updatedAt' | 'messageCount'> & {
      starshipId: string;
    }
  ): Promise<MemoryModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const now = new Date().toISOString();
        const { starshipId, ...memoryData } = entity;

        const memoryCreateData = {
          createdAt: now,
          updatedAt: now,
          version: memoryData.version || '1.0.0',
          messageCount: 0, // Will be computed based on stored messages separately
          state: memoryData.state || {},
        };

        // Handle AgentMemory specific fields if they exist
        const memoryForStorage = this.serializeComplexFields(memoryCreateData as MemoryModel);

        const memory = await this.createEntityWithAutoId<MemoryModel>('Memory', memoryForStorage);

        // Create relationship with starship
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (m:Memory {id: $memoryId})
         CREATE (s)-[:HAS_MEMORY {createdAt: $createdAt}]->(m)`,
          {
            starshipId,
            memoryId: memory.id,
            createdAt: now,
          }
        );

        // Deserialize complex fields before returning
        return convertNeo4jIntsInObject(this.deserializeComplexFields(memory as unknown as Record<string, unknown>));
      },
      'create',
      'Memory'
    );
  }

  async update(id: string, updates: Partial<MemoryModel>): Promise<MemoryModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Serialize complex fields in updates
        const serializedUpdates = this.serializeComplexFields(updateProps as MemoryModel);

        const result = await connection.executeWrite<{ m: MemoryModel }>('MATCH (m:Memory) WHERE m.id = $id SET m += $updates RETURN m', {
          id,
          updates: serializedUpdates,
        });

        const memory = result[0]?.m || null;
        return memory ? convertNeo4jIntsInObject(this.deserializeComplexFields(memory as unknown as Record<string, unknown>)) : null;
      },
      'update',
      'Memory',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (m:Memory) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Memory',
      id
    );
  }

  async searchMemories(
    query: string,
    filters?: {
      starshipId?: string;
      agentId?: string;
      tags?: string[];
    }
  ): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let cypher = 'MATCH (m:Memory) WHERE m.id IS NOT NULL';
        const params: Record<string, unknown> = {};

        // Add starship filter using relationship
        if (filters?.starshipId) {
          cypher = 'MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory) WHERE m.id IS NOT NULL';
          params.starshipId = filters.starshipId;
        }

        cypher += ' RETURN m ORDER BY m.updatedAt DESC LIMIT 50';

        const result = await connection.executeQuery<{ m: MemoryModel }>(cypher, params);
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'searchMemories',
      'Memory'
    );
  }

  async getMemoryStats(id: string): Promise<{
    totalMessages: number;
    messagesByRole: { system: number; user: number; assistant: number };
    sizeInBytes: number;
    lastUpdated: string;
  } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ m: MemoryModel }>('MATCH (m:Memory) WHERE m.id = $id RETURN m', { id });

        if (!result[0]?.m) {
          return null;
        }

        const memory = this.deserializeComplexFields(result[0].m as unknown as Record<string, unknown>);
        const messages = Array.isArray((memory.state as Record<string, unknown>)?.messages)
          ? ((memory.state as Record<string, unknown>).messages as Record<string, unknown>[])
          : [];

        // Calculate statistics
        const messagesByRole = { system: 0, user: 0, assistant: 0 };
        messages.forEach((msg: Record<string, unknown>) => {
          if (msg.role && typeof msg.role === 'string' && Object.prototype.hasOwnProperty.call(messagesByRole, msg.role)) {
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
      },
      'getMemoryStats',
      'Memory',
      id
    );
  }

  async findWithFilters(filters: {
    starshipId?: string;
    agentId?: string;
    tags?: string[];
    hasMessages?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<MemoryModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let cypher = 'MATCH (m:Memory) WHERE 1=1';
        const params: Record<string, unknown> = {};

        // Use relationship for starship filtering
        if (filters.starshipId) {
          cypher = 'MATCH (s:Starship {id: $starshipId})-[:HAS_MEMORY]->(m:Memory) WHERE 1=1';
          params.starshipId = filters.starshipId;
        }

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

        const result = await connection.executeQuery<{ m: MemoryModel }>(cypher, params);
        return convertNeo4jIntsInArray(
          result.map((record) => this.deserializeComplexFields(record.m as unknown as Record<string, unknown>))
        );
      },
      'findWithFilters',
      'Memory'
    );
  }
}
