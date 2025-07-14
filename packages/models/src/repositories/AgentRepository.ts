import { getConnection } from '../connection';
import { Agent, AgentRepository as AgentRepositoryInterface } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Neo4j-based agent repository
 */
export class AgentRepository implements AgentRepositoryInterface {
  async findAll(): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC'
    );
    return result.map((record) => record.a);
  }

  async findById(id: string): Promise<Agent | null> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.id = $id RETURN a',
      { id }
    );
    return result[0]?.a || null;
  }

  async findByChannel(channelId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:ACTIVE_IN]->(c:Channel) WHERE c.id = $channelId RETURN a',
      { channelId }
    );
    return result.map((record) => record.a);
  }

  async findByUser(userId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
      { userId }
    );
    return result.map((record) => record.a);
  }

  async findByStarship(starshipId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
      { starshipId }
    );
    return result.map((record) => record.a);
  }

  async create(
    entity: Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>
  ): Promise<Agent> {
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
    };

    await connection.executeWrite('CREATE (a:Agent $props) RETURN a', { props: agent });

    return agent;
  }

  async update(id: string, updates: Partial<Agent>): Promise<Agent | null> {
    const connection = getConnection();
    const updateProps = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    const result = await connection.executeWrite<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a',
      { id, updates: updateProps }
    );

    return result[0]?.a || null;
  }

  async delete(id: string): Promise<boolean> {
    const connection = getConnection();
    const result = await connection.executeWrite<{ deletedCount: number }>(
      'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
      { id }
    );

    return result[0]?.deletedCount > 0;
  }

  // ADD: New enhanced query methods
  async findByAuthor(authorId: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
      { authorId }
    );
    return result.map((record) => record.a);
  }

  async findByCategory(category: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
      { category }
    );
    return result.map((record) => record.a);
  }

  async findByTags(tags: string[]): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
      { tags }
    );
    return result.map((record) => record.a);
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent }>(
      'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
      {
        limit: Math.floor(Number(limit)),
        offset: Math.floor(Number(offset)),
      }
    );
    return result.map((record) => record.a);
  }

  async searchAgents(query: string): Promise<Agent[]> {
    const connection = getConnection();
    const result = await connection.executeQuery<{ a: Agent; score: number }>(
      'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
      { query }
    );
    return result.map((record) => record.a);
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
    return result.map((record) => record.a);
  }
}
