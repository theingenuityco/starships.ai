import { AgentEntity } from '@/entities/AgentEntity';
import { Neo4jConnection } from '@/helpers/database';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel } from '@starships/protocol';
import { int } from 'neo4j-driver';

export class AgentRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('AgentRepository', connection);
  }

  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>('MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC');
        return result.map((record) => AgentEntity.deserialize(record.a));
      },
      'findAll',
      'Agent'
    );
  }

  async findById(id: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>('MATCH (a:Agent) WHERE a.id = $id RETURN a', { id });
        const agent = result[0]?.a || null;
        return agent ? AgentEntity.deserialize(agent) : null;
      },
      'findById',
      'Agent',
      id
    );
  }

  async findByUser(userId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN a',
          { userId }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByUser',
      'Agent'
    );
  }

  async findByStarship(starshipId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a ORDER BY a.name',
          { starshipId }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByStarship',
      'Agent'
    );
  }

  async findByStarshipId(starshipId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE a.starshipId = $starshipId RETURN a ORDER BY a.name',
          { starshipId }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByStarshipId',
      'Agent'
    );
  }

  async updateStarshipId(agentId: string, starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Validate starshipId exists
        const starshipCheck = await connection.executeQuery('MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count', {
          starshipId,
        });

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
            timestamp: new Date().toISOString(),
          }
        );

        if (!result[0] || result[0].count === 0) {
          this.handleNotFound('Agent', agentId, 'updateStarshipId');
        }

        // For backward compatibility, update Neo4j relationship during transition
        try {
          // Remove existing DEPLOYED_ON relationships
          await connection.executeWrite('MATCH (a:Agent {id: $agentId})-[r:DEPLOYED_ON]->() DELETE r', { agentId });

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
              timestamp: new Date().toISOString(),
            }
          );
        } catch (error) {
          // Log but don't fail - Neo4j relationship is optional during transition
          console.warn('Failed to update Neo4j relationship for agent deployment:', error);
        }
      },
      'updateStarshipId',
      'Agent',
      agentId
    );
  }

  async findUndeployedAgents(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE a.starshipId IS NULL OR a.starshipId = "" RETURN a ORDER BY a.createdAt DESC',
          {}
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findUndeployedAgents',
      'Agent'
    );
  }

  async create(entity: Omit<AgentModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using Entity
        await AgentEntity.validate(entity, 'create');

        const now = new Date().toISOString();

        // Create agent properties without ID (Neo4j will generate it)
        const agentProps = {
          // Core AgentNodeParameters fields
          name: entity.name,
          description: entity.description,
          model: entity.model,
          temperature: entity.temperature,
          maxTokens: entity.maxTokens,
          timeout: entity.timeout || 30000,
          memory: entity.memory,
          blueprint: entity.blueprint,

          // Database-specific fields
          createdAt: now,
          updatedAt: now,
          version: entity.version || '1.0.0',
          category: entity.category,
          usageCount: 0,
          isPublic: entity.isPublic,
          authorId: entity.authorId,
          templateId: entity.templateId,
          starshipId: entity.starshipId,
        };

        // Transform using Entity
        const agentEntity = AgentEntity.deserialize(agentProps);

        // Use base repository for database operation
        const agent = await this.createEntityWithAutoId<AgentModel>('Agent', agentEntity.serialize());

        // For backward compatibility, also create Neo4j relationship during transition
        try {
          const connection = this.getConnection();
          await connection.executeWrite(
            `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
           CREATE (a)-[:DEPLOYED_ON {
             deployedAt: $timestamp,
             isActive: true
           }]->(s)`,
            {
              starshipId: agent.starshipId,
              agentId: agent.id,
              timestamp: now,
            }
          );
        } catch (error) {
          // Log but don't fail - Neo4j relationship is optional during transition
          console.warn('Failed to create Neo4j relationship for agent deployment:', error);
        }

        return AgentEntity.deserialize(agent);
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: Partial<AgentModel>): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Transform using Entity
        const updateEntity = AgentEntity.deserialize(updateProps);

        const result = await connection.executeWrite<{ a: AgentModel }>('MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a', {
          id,
          updates: updateEntity.serialize(),
        });

        const agent = result[0]?.a || null;
        return agent ? AgentEntity.deserialize(agent) : null;
      },
      'update',
      'Agent',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (a:Agent) WHERE a.id = $id DETACH DELETE a RETURN count(a) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Agent',
      id
    );
  }

  async findByAuthor(authorId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE a.authorId = $authorId RETURN a ORDER BY a.updatedAt DESC',
          { authorId }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByAuthor',
      'Agent'
    );
  }

  async findByCategory(category: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE a.category = $category RETURN a ORDER BY a.name',
          { category }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByCategory',
      'Agent'
    );
  }

  async findByTags(tags: string[]): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE ANY(tag IN $tags WHERE tag IN a.tags) RETURN a ORDER BY a.name',
          { tags }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findByTags',
      'Agent'
    );
  }

  async findPublic(limit: number = 50, offset: number = 0): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent) WHERE a.isPublic = true RETURN a ORDER BY a.usageCount DESC, a.rating DESC SKIP $offset LIMIT $limit',
          {
            limit: int(limit),
            offset: int(offset),
          }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findPublic',
      'Agent'
    );
  }

  async searchAgents(query: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel; score: number }>(
          'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
          { query }
        );
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'searchAgents',
      'Agent'
    );
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite('MATCH (a:Agent) WHERE a.id = $id SET a.usageCount = a.usageCount + 1, a.updatedAt = $timestamp', {
          id,
          timestamp: new Date().toISOString(),
        });
      },
      'incrementUsageCount',
      'Agent',
      id
    );
  }

  async updateRating(id: string, rating: number): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.executeWrite('MATCH (a:Agent) WHERE a.id = $id SET a.rating = $rating, a.updatedAt = $timestamp', {
          id,
          rating,
          timestamp: new Date().toISOString(),
        });
      },
      'updateRating',
      'Agent',
      id
    );
  }

  async findWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
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
        return result?.map((record) => AgentEntity.deserialize(record.a)) || [];
      },
      'findWithFilters',
      'Agent'
    );
  }
}
