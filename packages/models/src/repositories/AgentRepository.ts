import { getConnection } from '../helpers/database';
import type { AgentModel } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../helpers/database';

export class AgentRepository extends BaseRepository {
  constructor() {
    super('AgentRepository');
  }

  /** Serialize complex objects for Neo4j storage */
  private serializeComplexFields(agent: AgentModel | any): any {
    return {
      ...agent,
      blueprint: agent.blueprint ? JSON.stringify(agent.blueprint) : null,
      memory: agent.memory ? JSON.stringify(agent.memory) : null,
    };
  }

  /** Get value or default, handling empty objects from Neo4j */
  private getSafeValue<T>(value: T | {} | null | undefined, defaultValue: T): T {
    if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value as any).length === 0)) {
      return defaultValue;
    }
    return value as T;
  }

  /** Deserialize complex objects from Neo4j storage */
  private deserializeComplexFields(agent: any): AgentModel {
    try {
      return {
        ...agent,
        blueprint: agent.blueprint ? JSON.parse(agent.blueprint) : undefined,
        memory: agent.memory ? JSON.parse(agent.memory) : undefined,
      };
    } catch (error) {
      console.warn(`Failed to deserialize agent ${agent.id} complex fields:`, error);
      return {
        ...agent,
        blueprint: undefined,
        memory: undefined,
      };
    }
  }
  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ a: AgentModel }>(
        'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => record.a));
    }, 'findAll', 'Agent');
  }

  async findById(id: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ a: AgentModel }>(
        'MATCH (a:Agent) WHERE a.id = $id RETURN a',
        { id }
      );
      const agent = result[0]?.a || null;
      return agent ? convertNeo4jIntsInObject(agent) : null;
    }, 'findById', 'Agent', id);
  }


  async findByUser(userId: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
      { userId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.a)));
  }

  async findByStarship(starshipId: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.a)));
  }

  async findByStarshipId(starshipId: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => this.deserializeComplexFields(record.a)));
  }

  async updateStarshipId(agentId: string, starshipId: string): Promise<void> {
    const connection = getConnection();
    
    // Validate starshipId exists
    const starshipCheck = await connection.executeQuery(
      'MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count',
      { starshipId }
    );
    
    if (!starshipCheck[0] || starshipCheck[0].count === 0) {
      this.handleNotFound('Starship', starshipId, 'updateStarshipId');
    }
    
    // Update agent's starshipId
    const result = await connection.executeWrite<{ count: number }>(
      `MATCH (a:Agent) WHERE a.id = $agentId
       SET a.starshipId = $starshipId, a.updatedAt = $timestamp
       RETURN count(a) as count`,
      {
        agentId,
        starshipId,
        timestamp: new Date().toISOString()
      }
    );
    
    if (!result[0] || result[0].count === 0) {
      this.handleNotFound('Agent', agentId, 'updateStarshipId');
    }

    // For backward compatibility, update Neo4j relationship during transition
    try {
      // Remove existing DEPLOYED_ON relationships
      await connection.executeWrite(
        'MATCH (a:Agent {id: $agentId})-[r:DEPLOYED_ON]->() DELETE r',
        { agentId }
      );
      
      // Create new DEPLOYED_ON relationship
      await connection.executeWrite(
        `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
         CREATE (a)-[:DEPLOYED_ON {
           deployedAt: $timestamp,
           isActive: true
         }]->(s)`,
        {
          starshipId,
          agentId,
          timestamp: new Date().toISOString()
        }
      );
    } catch (error) {
      // Log but don't fail - Neo4j relationship is optional during transition
      console.warn('Failed to update Neo4j relationship for agent deployment:', error);
    }
  }

  async findUndeployedAgents(): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
      {}
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async create(
    entity: Omit<AgentModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<AgentModel> {
    return this.executeWithErrorHandling(async () => {
      // Validate required starshipId field
      if (!entity.starshipId) {
        this.handleValidationError([{ field: 'starshipId', message: 'starshipId is required when creating an agent' }], 'create');
      }

      const connection = getConnection();
      const now = new Date().toISOString();
      
      // Create agent properties without ID (Neo4j will generate it)
      const agentProps = {
        // Core AgentNodeParameters fields
        name: entity.name as string,
        description: entity.description as string | undefined,
        model: entity.model as string,
        temperature: entity.temperature as number | undefined,
        maxTokens: entity.maxTokens as number | undefined,
        timeout: this.getSafeValue(entity.timeout, 30000) as number,
        memory: entity.memory as any, // AgentMemoryState
        blueprint: entity.blueprint as any, // BaseBlueprint
        
        // Database-specific fields
        createdAt: now,
        updatedAt: now,
        version: this.getSafeValue(entity.version, '1.0.0') as string,
        category: entity.category as AgentModel['category'],
        usageCount: 0,
        templateId: entity.templateId as string | undefined,
        starshipId: entity.starshipId as string,
      };

      // Serialize complex objects for Neo4j storage
      const agentForStorage = this.serializeComplexFields(agentProps);

      // Use automatic ID generation
      const agent = await this.createEntityWithAutoId<AgentModel>('Agent', agentForStorage);
      
      // For backward compatibility, also create Neo4j relationship during transition
      try {
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
           CREATE (a)-[:DEPLOYED_ON {
             deployedAt: $timestamp,
             isActive: true
           }]->(s)`,
          {
            starshipId: agent.starshipId,
            agentId: agent.id,
            timestamp: now
          }
        );
      } catch (error) {
        // Log but don't fail - Neo4j relationship is optional during transition
        console.warn('Failed to create Neo4j relationship for agent deployment:', error);
      }
      
      return convertNeo4jIntsInObject(agent);
    }, 'create', 'Agent');
  }

  async update(id: string, updates: Partial<AgentModel>): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const result = await connection.executeWrite<{ a: AgentModel }>(
        'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
        { id, updates: updateProps }
      );

      const agent = result[0]?.a || null;
      return agent ? convertNeo4jIntsInObject(agent) : null;
    }, 'update', 'Agent', id);
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeWrite<{ deletedCount: number }>(
        'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
        { id }
      );

      return result[0]?.deletedCount > 0;
    }, 'delete', 'Agent', id);
  }

  async findByAuthor(authorId: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
      { authorId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByCategory(category: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
      { category }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByTags(tags: string[]): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
      { tags }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel }>(
      'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
      {
        limit: int(limit),
        offset: int(offset),
      }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async searchAgents(query: string): Promise<AgentModel[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: AgentModel; score: number }>(
      'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
      { query }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async incrementUsageCount(id: string): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      'MATCH (a:Agent) WHERE a.id = $id SET a.usageCount = a.usageCount + 1, a.updatedAt = $timestamp',
      { id, timestamp: new Date().toISOString() }
    );
  }

  async updateRating(id: string, rating: number): Promise<void> {
    const connection = getConnection();
    await connection.executeWrite(
      'MATCH (a:Agent) WHERE a.id = $id SET a.rating = $rating, a.updatedAt = $timestamp',
      { id, rating, timestamp: new Date().toISOString() }
    );
  }

  async findWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<AgentModel[]> {
    const connection = getConnection();
    let query = 'MATCH (a:Agent) WHERE 1=1';
    const params: any = {};

    if (filters.category) {
      query += ' AND a.category = $category';
      params.category = filters.category;
    }

    if (filters.tags && filters.tags.length > 0) {
      query += ' AND ANY(tag IN $tags WHERE tag IN a.tags)';
      params.tags = filters.tags;
    }

    if (filters.isPublic !== undefined) {
      query += ' AND a.isPublic = $isPublic';
      params.isPublic = filters.isPublic;
    }

    if (filters.authorId) {
      query += ' AND a.authorId = $authorId';
      params.authorId = filters.authorId;
    }

    if (filters.starshipClass) {
      query += ' AND $starshipClass IN a.allowedStarshipClasses';
      params.starshipClass = filters.starshipClass;
    }

    query += ' RETURN a ORDER BY a.updatedAt DESC';

    const result = await connection.executeQuery<{ a: AgentModel }>(query, params);
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }
}
