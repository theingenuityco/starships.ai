import { getConnection } from '../connection';
import { Agent, AgentRepository as AgentRepositoryInterface } from '../types';
import { BaseRepository } from './BaseRepository';
import { v4 as uuidv4 } from 'uuid';
import { int } from 'neo4j-driver';
import { convertNeo4jIntsInObject, convertNeo4jIntsInArray } from '../utils/neo4j-helpers';

/**
 * Neo4j-based agent repository
 */
export class AgentRepository extends BaseRepository implements AgentRepositoryInterface {
  constructor() {
    super('AgentRepository');
  }
  async findAll(): Promise<Agent[]> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ a: Agent }>(
        'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
      );
      return convertNeo4jIntsInArray(result.map((record) => record.a));
    }, 'findAll', 'Agent');
  }

  async findById(id: string): Promise<Agent | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const result = await connection.executeQuery<{ a: Agent }>(
        'MATCH (a:Agent) WHERE a.id = $id RETURN a',
        { id }
      );
      const agent = result[0]?.a || null;
      return agent ? convertNeo4jIntsInObject(agent) : null;
    }, 'findById', 'Agent', id);
  }

  async findByChannel(channelId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:ACTIVE_IN]->(c:Channel) WHERE c.id = $channelId RETURN a',
      { channelId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByUser(userId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
      { userId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByStarship(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  // NEW: FK-based query methods for starshipId relationship
  async findByStarshipId(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
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

  async findUndeployedAgents(): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
      {}
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async create(
    entity: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<Agent> {
    return this.executeWithErrorHandling(async () => {
      // Validate required starshipId field
      if (!entity.starshipId) {
        this.handleValidationError([{ field: 'starshipId', message: 'starshipId is required when creating an agent' }], 'create', 'Agent');
      }

      const connection = getConnection();
      const now = new Date().toISOString();
      const agent: Agent = {
        ...entity,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        tags: entity.tags || [],
        category: entity.category || 'general',
        isPublic: entity.isPublic || false,
        version: entity.version || '1.0.0',
        starshipId: entity.starshipId, // Ensure starshipId is included
      };

      await connection.executeWrite('CREATE (a:Agent $props) RETURN a', { props: agent });

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

  async update(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    return this.executeWithErrorHandling(async () => {
      const connection = getConnection();
      const updateProps = {
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      const result = await connection.executeWrite<{ a: Agent }>(
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

  // ADD: New enhanced query methods
  async findByAuthor(authorId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
      { authorId }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByCategory(category: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
      { category }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findByTags(tags: string[]): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
      { tags }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
      {
        limit: int(limit),
        offset: int(offset),
      }
    );
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }

  async searchAgents(query: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent; score: number }>(
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
  }): Promise<Agent[]> {
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

    const result = await connection.executeQuery<{ a: Agent }>(query, params);
    return convertNeo4jIntsInArray(result.map((record) => record.a));
  }
}
