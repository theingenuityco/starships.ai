import { AgentEntity } from '@/entities/AgentEntity';
import { ToolEntity } from '@/entities/ToolEntity';
import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, ToolModel, AgentTemplateModel } from '@starships/protocol';

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
        // Extract assignedToolSlugs for relationship creation
        const toolSlugsForRelationships = data.assignedToolSlugs || [];

        // Remove assignedToolSlugs from data before validation since AgentEntity doesn't have this field
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assignedToolSlugs: _, ...dataWithoutToolSlugs } = data;

        // Validate using cleaned data
        await AgentEntity.validate(dataWithoutToolSlugs, 'create');

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
          systemPrompt: data.systemPrompt,
          state: data.state,
          blueprint: data.blueprint,

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

        // Create tool relationships if assignedToolSlugs provided
        if (toolSlugsForRelationships.length > 0) {
          await this.assignToolsToAgent(agent.id, toolSlugsForRelationships, starshipId);
        }

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

        // Clean up relationships first, then delete the agent
        // DETACH DELETE will automatically remove all relationships
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

  async getAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        // Use relationship-based approach instead of slug matching
        const tools = await this.getAgentToolsByRelationships(agentId);

        // Filter tools that are deployed on the specified starship
        const connection = this.getConnection();
        if (tools.length === 0) {
          return [];
        }

        const toolIds = tools.map((t) => t.id);
        const deployedToolsResult = await connection.executeQuery<{ t: ToolModel }>(
          'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE t.id IN $toolIds AND s.id = $starshipId RETURN t ORDER BY t.createdAt DESC',
          { toolIds, starshipId }
        );

        return deployedToolsResult && deployedToolsResult.length > 0
          ? fromDatabaseArray(
              ToolEntity,
              deployedToolsResult.map((record) => record.t)
            )
          : [];
      },
      'getAgentTools',
      'Agent',
      agentId
    );
  }

  // ============================================================================
  // AGENT TEMPLATE RELATIONSHIPS
  // ============================================================================

  /**
   * Create Agent from AgentTemplate with proper relationship
   */
  async createFromTemplate(templateId: string, starshipId: string, customizations?: Partial<CreateAgentRequest>): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Use AgentTemplateRepository to get template with relationships populated
        const templateRepository = new AgentTemplateRepository(connection);
        const template = await templateRepository.findById(templateId);

        if (!template) {
          this.handleNotFound('AgentTemplate', templateId);
        }

        // Create agent from template with optional customizations (without assignedToolSlugs)
        const agentData = {
          name: customizations?.name || template.name,
          description: customizations?.description || template.description,
          model: customizations?.model || template.model,
          temperature: customizations?.temperature ?? template.temperature,
          maxTokens: customizations?.maxTokens ?? template.maxTokens,
          timeout: customizations?.timeout ?? template.timeout,
          systemPrompt: customizations?.systemPrompt || template.systemPrompt,
          state: customizations?.state || template.state,
          blueprint: customizations?.blueprint || template.blueprint,
        };

        const agent = await this.create(agentData, starshipId);

        // Create CREATED_FROM relationship
        await connection.executeWrite(
          `MATCH (a:Agent {id: $agentId}), (at:AgentTemplate {id: $templateId})
           CREATE (a)-[:CREATED_FROM {createdAt: $createdAt}]->(at)`,
          {
            agentId: agent.id,
            templateId: templateId,
            createdAt: new Date().toISOString(),
          }
        );

        // Note: Tool relationships are already created in the create() method
        // No need to assign them again here to avoid duplicates

        // Increment template usage count
        await connection.executeWrite('MATCH (at:AgentTemplate) WHERE at.id = $templateId SET at.usageCount = at.usageCount + 1', {
          templateId,
        });

        return agent;
      },
      'createFromTemplate',
      'Agent'
    );
  }

  /**
   * Get the AgentTemplate that this Agent was created from
   */
  async getSourceTemplate(agentId: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const query = `
          MATCH (a:Agent {id: $agentId})-[:CREATED_FROM]->(at:AgentTemplate)
          RETURN at
        `;

        const result = await connection.executeQuery<{ at: AgentTemplateModel }>(query, { agentId });
        const template = result[0]?.at || null;
        return template ? fromDatabase(AgentTemplateEntity, template) : null;
      },
      'getSourceTemplate',
      'Agent',
      agentId
    );
  }

  // ============================================================================
  // AGENT→TOOL DIRECT RELATIONSHIPS
  // ============================================================================

  /**
   * Create a USES_TOOL relationship between Agent and Tool
   */
  async addToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();

        // Check if both entities exist
        const checkQuery = `
          MATCH (a:Agent {id: $agentId})
          MATCH (t:Tool {id: $toolId})
          RETURN a.id, t.id
        `;

        const checkResult = await connection.executeQuery<{ 'a.id': string; 't.id': string }>(checkQuery, { agentId, toolId });

        if (!checkResult || checkResult.length === 0) {
          throw new Error('Agent or Tool not found');
        }

        // Create relationship if it doesn't exist with required key
        const relationshipQuery = `
          MATCH (a:Agent {id: $agentId})
          MATCH (t:Tool {id: $toolId})
          MERGE (a)-[:USES_TOOL {key: $key, createdAt: $createdAt}]->(t)
        `;

        await connection.executeWrite(relationshipQuery, {
          agentId,
          toolId,
          key: `${agentId}_${toolId}`,
          createdAt: new Date().toISOString(),
        });
      },
      'addToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Remove a USES_TOOL relationship between Agent and Tool
   */
  async removeToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();
        const query = `
          MATCH (a:Agent {id: $agentId})-[r:USES_TOOL]->(t:Tool {id: $toolId})
          DELETE r
        `;

        await connection.executeWrite(query, { agentId, toolId });
      },
      'removeToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Get all Tools that an Agent uses via relationships (replaces slug-based matching)
   */
  async getAgentToolsByRelationships(agentId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }

        const connection = this.getConnection();
        const query = `
          MATCH (a:Agent {id: $agentId})-[:USES_TOOL]->(t:Tool)
          RETURN t
          ORDER BY t.name
        `;

        const result = await connection.executeQuery<{ t: ToolModel }>(query, { agentId });
        return fromDatabaseArray(
          ToolEntity,
          result.map((record) => record.t)
        );
      },
      'getAgentToolsByRelationships',
      'Agent',
      agentId
    );
  }

  /**
   * Assign tools to an agent by their slugs and starship - creates USES_TOOL relationships
   */
  async assignToolsToAgent(agentId: string, toolSlugs: string[], starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Remove existing tool relationships for this agent
        await connection.executeWrite('MATCH (a:Agent {id: $agentId})-[r:USES_TOOL]->() DELETE r', { agentId });

        // Create new relationships for each tool slug
        for (const toolSlug of toolSlugs) {
          // Find the tool by slug and starship
          const toolResult = await connection.executeQuery<{ id: string }>(
            'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE t.slug = $toolSlug AND s.id = $starshipId RETURN t.id as id',
            { toolSlug, starshipId }
          );

          if (toolResult.length > 0) {
            // Create USES_TOOL relationship
            await this.addToolRelationship(agentId, toolResult[0].id);
          }
        }
      },
      'assignToolsToAgent',
      'Agent',
      agentId
    );
  }
}
