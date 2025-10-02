import { AgentEntity } from '@/entities/AgentEntity';
import { ToolEntity } from '@/entities/ToolEntity';
import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, ToolModel, AgentTemplateModel } from '@starships/protocol';

export class AgentRepository extends BaseRepository {
  constructor() {
    super('AgentRepository');
  }

  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agents', 'created_at DESC');
        return fromDatabaseArray(AgentEntity, result);
      },
      'findAll',
      'Agent'
    );
  }

  async findById(id: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('agents', id);
        return result ? fromDatabase(AgentEntity, result) : null;
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
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM agents WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(AgentEntity, result);
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
        const starshipCheck = await connection.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM starships WHERE id = $1', [
          starshipId,
        ]);

        if (!starshipCheck || starshipCheck.count === '0') {
          this.handleNotFound('Starship', starshipId);
        }

        // Update agent's starship_id and deployed_at
        const result = await connection.query<Record<string, unknown>>(
          `UPDATE agents
           SET starship_id = $1, deployed_at = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [starshipId, new Date().toISOString(), agentId]
        );

        if (!result || result.length === 0) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0]);
      },
      'updateStarship',
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

        // Create agent properties for PostgreSQL
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

          // PostgreSQL specific fields
          starshipId: starshipId, // Direct foreign key
          deployedAt: now, // Agent is deployed immediately upon creation
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const agentEntity = toEntityInstance(AgentEntity, agentProps);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        const agent = fromDatabase(AgentEntity, result);

        // Create tool relationships if assignedToolSlugs provided
        if (toolSlugsForRelationships.length > 0) {
          await this.assignToolsToAgent(agent.id, toolSlugsForRelationships, starshipId);
        }

        return agent;
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        // Use lean validation from AgentEntity for updates
        await AgentEntity.validate(updates, 'update');

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(AgentEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agents', id, filteredUpdateData);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'update',
      'Agent',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL CASCADE rules will handle relationships automatically
        return await this.deleteEntity('agents', id);
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
        // Use PostgreSQL full-text search
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM agents
           WHERE to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')) @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')), plainto_tsquery('english', $1)) DESC
           LIMIT 20`,
          [query]
        );
        return fromDatabaseArray(AgentEntity, result);
      },
      'searchAgents',
      'Agent'
    );
  }

  async getAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Get tools related to agent through junction table, filtered by starship
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1 AND t.starship_id = $2
           ORDER BY t.created_at DESC`,
          [agentId, starshipId]
        );
        return fromDatabaseArray(ToolEntity, result);
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
        // Use AgentTemplateRepository to get template
        const templateRepository = new AgentTemplateRepository();
        const template = await templateRepository.findById(templateId);

        if (!template) {
          this.handleNotFound('AgentTemplate', templateId);
        }

        // Create agent from template with optional customizations
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

        // Create agent with template_id foreign key
        const now = new Date().toISOString();
        const agentProps = {
          ...agentData,
          starshipId: starshipId,
          templateId: templateId, // Set template_id foreign key
          deployedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        const agentEntity = toEntityInstance(AgentEntity, agentProps);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        const agent = fromDatabase(AgentEntity, result);

        // Increment template usage count
        const connection = this.getConnection();
        await connection.query('UPDATE agent_templates SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1', [templateId]);

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
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT at.* FROM agent_templates at
           INNER JOIN agents a ON a.template_id = at.id
           WHERE a.id = $1`,
          [agentId]
        );
        return result ? fromDatabase(AgentTemplateEntity, result) : null;
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
   * Create a relationship between Agent and Tool using junction table
   */
  async addToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();

        // Check if both entities exist
        const agentExists = await connection.queryOne('SELECT id FROM agents WHERE id = $1', [agentId]);
        const toolExists = await connection.queryOne('SELECT id FROM tools WHERE id = $1', [toolId]);

        if (!agentExists || !toolExists) {
          throw new Error('Agent or Tool not found');
        }

        // Insert into junction table (ON CONFLICT DO NOTHING to avoid duplicates)
        await connection.query(
          `INSERT INTO agent_tools (agent_id, tool_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (agent_id, tool_id) DO NOTHING`,
          [agentId, toolId]
        );
      },
      'addToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Remove a relationship between Agent and Tool from junction table
   */
  async removeToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1 AND tool_id = $2', [agentId, toolId]);
      },
      'removeToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Get all Tools that an Agent uses via junction table relationships
   */
  async getAgentToolsByRelationships(agentId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1
           ORDER BY t.name`,
          [agentId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'getAgentToolsByRelationships',
      'Agent',
      agentId
    );
  }

  /**
   * Assign tools to an agent by their slugs and starship - creates junction table relationships
   */
  async assignToolsToAgent(agentId: string, toolSlugs: string[], starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Remove existing tool relationships for this agent
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1', [agentId]);

        // Create new relationships for each tool slug
        for (const toolSlug of toolSlugs) {
          // Find the tool by slug and starship
          const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
            toolSlug,
            starshipId,
          ]);

          if (toolResult) {
            // Create relationship via junction table
            await this.addToolRelationship(agentId, toolResult.id);
          }
        }
      },
      'assignToolsToAgent',
      'Agent',
      agentId
    );
  }
}
