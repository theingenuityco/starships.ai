import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentTemplateModel, CreateAgentTemplateRequest, UpdateAgentTemplateRequest, ToolTemplateModel } from '@starships/protocol';

export class AgentTemplateRepository extends BaseRepository {
  constructor() {
    super('AgentTemplateRepository');
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agent_templates', 'created_at DESC');
        return fromDatabaseArray(AgentTemplateEntity, result);
      },
      'findAll',
      'AgentTemplate'
    );
  }

  async findById(id: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for findById operation');
        }

        const result = await super.findEntityById<Record<string, unknown>>('agent_templates', id);
        if (!result) {
          return null;
        }

        const baseTemplate = fromDatabase(AgentTemplateEntity, result);

        // Get assigned tool template slugs from junction table
        const connection = this.getConnection();
        const toolResults = await connection.query<{ slug: string }>(
          `SELECT tt.slug
           FROM tool_templates tt
           JOIN agent_template_tool_templates attt ON tt.id = attt.tool_template_id
           WHERE attt.agent_template_id = $1
           ORDER BY tt.name`,
          [id]
        );

        const assignedToolSlugs = toolResults.map((result) => result.slug);

        return {
          ...baseTemplate,
          assignedToolSlugs,
        };
      },
      'findById',
      'AgentTemplate',
      id
    );
  }

  async findBySlug(slug: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!slug?.trim()) {
          throw new Error('Slug is required for findBySlug operation');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agent_templates WHERE slug = $1', [slug]);
        return result ? fromDatabase(AgentTemplateEntity, result) : null;
      },
      'findBySlug',
      'AgentTemplate',
      slug
    );
  }

  async create(data: CreateAgentTemplateRequest): Promise<AgentTemplateModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Use provided slug or generate from name
        const slug = data.slug || generateSlug(data.name);

        // Build template data for database storage
        const templateProps = {
          // Explicit primitive fields
          name: data.name,
          slug: slug,
          description: data.description,
          category: data.category,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          timeout: data.timeout,
          icon: data.icon,
          previewPrompts: data.previewPrompts,
          systemPrompt: data.systemPrompt,
          state: data.state,
          blueprint: data.blueprint,
          usageCount: 0,

          // Database fields
          createdAt: now,
          updatedAt: now,
        };

        // validate using data
        await AgentTemplateEntity.validate(templateProps, 'create');

        // Create entity instance from plain object, then serialize
        const templateEntity = toEntityInstance(AgentTemplateEntity, templateProps);

        // DEBUG: Log serialization process
        console.log(
          '🔍 [DEBUG] Before toDatabase - state:',
          typeof templateEntity.state,
          JSON.stringify(templateEntity.state).substring(0, 100)
        );
        console.log(
          '🔍 [DEBUG] Before toDatabase - blueprint:',
          typeof templateEntity.blueprint,
          JSON.stringify(templateEntity.blueprint).substring(0, 100)
        );

        const databaseFormat = toDatabase(templateEntity);

        console.log('🔍 [DEBUG] After toDatabase - state field:', typeof databaseFormat.state, databaseFormat.state);
        console.log('🔍 [DEBUG] After toDatabase - blueprint field:', typeof databaseFormat.blueprint, databaseFormat.blueprint);
        console.log('🔍 [DEBUG] All database format keys:', Object.keys(databaseFormat));

        const result = await this.createEntity<Record<string, unknown>>('agent_templates', databaseFormat);

        const template = fromDatabase(AgentTemplateEntity, result);

        // Create relationships for assigned tool templates
        if (data.assignedToolSlugs && data.assignedToolSlugs.length > 0) {
          const connection = this.getConnection();

          for (const toolSlug of data.assignedToolSlugs) {
            // Find tool template by slug
            const toolTemplateResult = await connection.queryOne<{ id: string }>('SELECT id FROM tool_templates WHERE slug = $1', [
              toolSlug,
            ]);

            if (toolTemplateResult) {
              // Create relationship using junction table
              await this.addToolTemplateRelationship(template.id, toolTemplateResult.id);
            }
          }
        }

        return template;
      },
      'create',
      'AgentTemplate'
    );
  }

  async update(id: string, updates: UpdateAgentTemplateRequest): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        await AgentTemplateEntity.validate(updates, 'update');

        const connection = this.getConnection();

        // Handle tool template relationships if assignedToolSlugs is being updated
        if (updates.assignedToolSlugs !== undefined) {
          // Remove existing relationships
          await connection.query('DELETE FROM agent_template_tool_templates WHERE agent_template_id = $1', [id]);

          // Add new relationships
          if (updates.assignedToolSlugs.length > 0) {
            for (const toolSlug of updates.assignedToolSlugs) {
              // Find tool template by slug
              const toolTemplateResult = await connection.queryOne<{ id: string }>('SELECT id FROM tool_templates WHERE slug = $1', [
                toolSlug,
              ]);

              if (toolTemplateResult) {
                // Create relationship using junction table
                await this.addToolTemplateRelationship(id, toolTemplateResult.id);
              }
            }
          }
        }

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Remove assignedToolSlugs from updates since we handle it via relationships
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assignedToolSlugs: _, ...propsWithoutToolSlugs } = updateProps;

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(AgentTemplateEntity, propsWithoutToolSlugs));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agent_templates', id, filteredUpdateData);
        return result ? fromDatabase(AgentTemplateEntity, result) : null;
      },
      'update',
      'AgentTemplate',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for delete operation');
        }

        // Delete will cascade to remove relationships via foreign key constraints
        return await this.deleteEntity('agent_templates', id);
      },
      'delete',
      'AgentTemplate',
      id
    );
  }

  async findByCategory(category: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!category?.trim()) {
          throw new Error('Category is required for findByCategory operation');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM agent_templates WHERE category = $1 AND is_public = true ORDER BY usage_count DESC',
          [category]
        );
        return fromDatabaseArray(AgentTemplateEntity, result);
      },
      'findByCategory',
      'AgentTemplate'
    );
  }

  async searchTemplates(query: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!query?.trim()) {
          throw new Error('Search query is required');
        }

        if (query.length > 200) {
          throw new Error('Search query cannot exceed 200 characters');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT *,
           CASE
             WHEN LOWER(name) LIKE LOWER($1) THEN 3
             WHEN LOWER(description) LIKE LOWER($1) THEN 2
             ELSE 1
           END as relevance
           FROM agent_templates
           WHERE LOWER(name) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1)
           ORDER BY relevance DESC, usage_count DESC`,
          [`%${query}%`]
        );
        return fromDatabaseArray(AgentTemplateEntity, result);
      },
      'searchTemplates',
      'AgentTemplate'
    );
  }

  async incrementUsageCount(id: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for incrementUsageCount operation');
        }

        const connection = this.getConnection();
        await connection.query('UPDATE agent_templates SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1', [
          id,
          new Date().toISOString(),
        ]);
      },
      'incrementUsageCount',
      'AgentTemplate',
      id
    );
  }

  // ============================================================================
  // RELATIONSHIP MANAGEMENT
  // ============================================================================

  /**
   * Create a USES_TOOL_TEMPLATE relationship between AgentTemplate and ToolTemplate
   */
  async addToolTemplateRelationship(agentTemplateId: string, toolTemplateId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentTemplateId?.trim() || !toolTemplateId?.trim()) {
          throw new Error('Both agentTemplateId and toolTemplateId are required');
        }

        const connection = this.getConnection();

        // Insert into junction table (ON CONFLICT DO NOTHING to avoid duplicates)
        await connection.query(
          `INSERT INTO agent_template_tool_templates (agent_template_id, tool_template_id, created_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (agent_template_id, tool_template_id) DO NOTHING`,
          [agentTemplateId, toolTemplateId, new Date().toISOString()]
        );
      },
      'addToolTemplateRelationship',
      'AgentTemplate',
      agentTemplateId
    );
  }

  /**
   * Remove a USES_TOOL_TEMPLATE relationship between AgentTemplate and ToolTemplate
   */
  async removeToolTemplateRelationship(agentTemplateId: string, toolTemplateId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentTemplateId?.trim() || !toolTemplateId?.trim()) {
          throw new Error('Both agentTemplateId and toolTemplateId are required');
        }

        const connection = this.getConnection();
        await connection.query('DELETE FROM agent_template_tool_templates WHERE agent_template_id = $1 AND tool_template_id = $2', [
          agentTemplateId,
          toolTemplateId,
        ]);
      },
      'removeToolTemplateRelationship',
      'AgentTemplate',
      agentTemplateId
    );
  }

  /**
   * Get all ToolTemplates used by an AgentTemplate
   */
  async getToolTemplates(agentTemplateId: string): Promise<ToolTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentTemplateId?.trim()) {
          throw new Error('agentTemplateId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT tt.*
           FROM tool_templates tt
           JOIN agent_template_tool_templates attt ON tt.id = attt.tool_template_id
           WHERE attt.agent_template_id = $1
           ORDER BY tt.name`,
          [agentTemplateId]
        );

        return fromDatabaseArray(ToolTemplateEntity, result);
      },
      'getToolTemplates',
      'AgentTemplate',
      agentTemplateId
    );
  }
}
