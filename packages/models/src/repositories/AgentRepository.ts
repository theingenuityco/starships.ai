import { AgentEntity } from '@/entities/AgentEntity';
import { ToolEntity } from '@/entities/ToolEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, ToolModel } from '@starships/protocol';

export class AgentRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('AgentRepository', connection);
  }

  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>('MATCH (a:Agent) RETURN a ORDER BY a.createdAt DESC');
        return fromDatabaseArray(
          AgentEntity,
          result.map((record) => record.a)
        );
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
        return agent ? fromDatabase(AgentEntity, agent) : null;
      },
      'findById',
      'Agent',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel }>(
          'MATCH (a:Agent)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN a',
          { starshipId }
        );
        return result && result.length > 0
          ? fromDatabaseArray(
              AgentEntity,
              result.map((record) => record.a)
            )
          : [];
      },
      'findByStarship',
      'Agent'
    );
  }

  async updateStarship(agentId: string, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Validate starshipId exists
        const starshipCheck = await connection.executeQuery('MATCH (s:Starship) WHERE s.id = $starshipId RETURN count(s) as count', {
          starshipId,
        });

        if (!starshipCheck[0] || starshipCheck[0].count === 0) {
          this.handleNotFound('Starship', starshipId);
        }

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

        // update updatedAt
        const result = await connection.executeWrite<{ a: AgentModel }>(
          `MATCH (a:Agent) WHERE a.id = $agentId
          SET a.updatedAt = $timestamp
          RETURN a`,
          {
            agentId,
            starshipId,
            timestamp: new Date().toISOString(),
          }
        );

        if (!result[0].a) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0].a);
      },
      'updateStarshipId',
      'Agent',
      agentId
    );
  }

  async create(data: CreateAgentRequest, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using data
        await AgentEntity.validate(data, 'create');

        const now = new Date().toISOString();

        // Create agent properties without ID (Neo4j will generate it)
        const agentProps = {
          // Core AgentParams fields
          name: data.name,
          description: data.description,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          timeout: data.timeout,
          memoryState: data.memoryState,
          blueprint: data.blueprint,
          assignedToolSlugs: data.assignedToolSlugs, // Tool assignment via slugs

          // Database-specific fields
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const agentEntity = toEntityInstance(AgentEntity, agentProps);
        const agent = await this.createEntityWithAutoId<AgentModel>('Agent', toDatabase(agentEntity));

        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (a:Agent {id: $agentId})
          CREATE (a)-[:DEPLOYED_ON { key: $key }]->(s)`,
          {
            starshipId: starshipId,
            agentId: agent.id,
            key: `${agent.id}_${starshipId}`,
          }
        );

        return fromDatabase(AgentEntity, agent);
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const result = await connection.executeWrite<{ a: AgentModel }>('MATCH (a:Agent) WHERE a.id = $id SET a += $updates RETURN a', {
          id,
          updates: toDatabase(toEntityInstance(AgentEntity, updateProps)),
        });

        const agent = result[0]?.a || null;
        return agent ? fromDatabase(AgentEntity, agent) : null;
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

  async searchAgents(query: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ a: AgentModel; score: number }>(
          'CALL db.index.fulltext.queryNodes("agentSearch", $query) YIELD node as a, score RETURN a, score ORDER BY score DESC LIMIT 20',
          { query }
        );
        return result && result.length > 0
          ? fromDatabaseArray(
              AgentEntity,
              result.map((record) => record.a)
            )
          : [];
      },
      'searchAgents',
      'Agent'
    );
  }

  async assignToolSlugs(agentId: string, toolSlugs: string[]): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ a: AgentModel }>(
          `MATCH (a:Agent) WHERE a.id = $agentId
           SET a.assignedToolSlugs = $toolSlugs, a.updatedAt = $timestamp
           RETURN a`,
          {
            agentId,
            toolSlugs,
            timestamp: new Date().toISOString(),
          }
        );

        if (!result[0]?.a) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0].a);
      },
      'assignToolSlugs',
      'Agent',
      agentId
    );
  }

  async addToolSlug(agentId: string, toolSlug: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ a: AgentModel }>(
          `MATCH (a:Agent) WHERE a.id = $agentId
           SET a.assignedToolSlugs = CASE
             WHEN a.assignedToolSlugs IS NULL THEN [$toolSlug]
             WHEN NOT $toolSlug IN a.assignedToolSlugs THEN a.assignedToolSlugs + [$toolSlug]
             ELSE a.assignedToolSlugs
           END,
           a.updatedAt = $timestamp
           RETURN a`,
          {
            agentId,
            toolSlug,
            timestamp: new Date().toISOString(),
          }
        );

        if (!result[0]?.a) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0].a);
      },
      'addToolSlug',
      'Agent',
      agentId
    );
  }

  async removeToolSlug(agentId: string, toolSlug: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ a: AgentModel }>(
          `MATCH (a:Agent) WHERE a.id = $agentId
           SET a.assignedToolSlugs = [slug IN a.assignedToolSlugs WHERE slug <> $toolSlug],
           a.updatedAt = $timestamp
           RETURN a`,
          {
            agentId,
            toolSlug,
            timestamp: new Date().toISOString(),
          }
        );

        if (!result[0]?.a) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0].a);
      },
      'removeToolSlug',
      'Agent',
      agentId
    );
  }

  async getAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // First get the agent with its assigned tool slugs
        const agentResult = await connection.executeQuery<{ a: AgentModel }>('MATCH (a:Agent) WHERE a.id = $agentId RETURN a', { agentId });

        if (!agentResult[0]?.a) {
          this.handleNotFound('Agent', agentId);
        }

        const agent = agentResult[0].a;
        if (!agent.assignedToolSlugs || agent.assignedToolSlugs.length === 0) {
          return [];
        }

        // Get tools by slugs for the specific starship using relationships
        const toolsResult = await connection.executeQuery<{ t: ToolModel }>(
          'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE t.slug IN $slugs AND s.id = $starshipId RETURN t ORDER BY t.createdAt DESC',
          { slugs: agent.assignedToolSlugs, starshipId }
        );

        return toolsResult && toolsResult.length > 0
          ? fromDatabaseArray(
              ToolEntity,
              toolsResult.map((record) => record.t)
            )
          : [];
      },
      'getAgentTools',
      'Agent',
      agentId
    );
  }
}
