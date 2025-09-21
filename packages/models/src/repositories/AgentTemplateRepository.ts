import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { AgentTemplateModel, CreateAgentTemplateRequest, UpdateAgentTemplateRequest, ToolTemplateModel } from '@starships/protocol';

export class AgentTemplateRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('AgentTemplateRepository', connection);
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const query = `MATCH (t:AgentTemplate) RETURN t ORDER BY t.createdAt DESC`;
        const result = await connection.executeQuery<{ t: AgentTemplateModel }>(query);
        return fromDatabaseArray(
          AgentTemplateEntity,
          result.map((record) => record.t)
        );
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

        const query = `
        MATCH (t:AgentTemplate {id: $id})
        RETURN t
      `;
        const connection = this.getConnection();
        const results = await connection.executeQuery<{ t: AgentTemplateModel }>(query, { id });
        const template = results.length > 0 ? results[0].t : null;

        if (!template) {
          return null;
        }

        const baseTemplate = fromDatabase(AgentTemplateEntity, template);

        // Get assigned tool template slugs from relationships
        const toolTemplatesQuery = `
          MATCH (at:AgentTemplate {id: $id})-[:USES_TOOL_TEMPLATE]->(tt:ToolTemplate)
          RETURN tt.slug as slug
          ORDER BY tt.name
        `;

        const toolResults = await connection.executeQuery<{ slug: string }>(toolTemplatesQuery, { id });
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

        const query = `
        MATCH (t:AgentTemplate {slug: $slug})
        RETURN t
      `;

        const results = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(query, { slug });
        const template = results.length > 0 ? results[0].t : null;
        return template ? fromDatabase(AgentTemplateEntity, template) : null;
      },
      'findBySlug',
      'AgentTemplate',
      slug
    );
  }

  async create(data: CreateAgentTemplateRequest): Promise<AgentTemplateModel> {
    return this.executeWithErrorHandling(
      async () => {
        // validate using data
        await AgentTemplateEntity.validate(data, 'create');

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

        // Create entity instance from plain object, then serialize
        const templateEntity = toEntityInstance(AgentTemplateEntity, templateProps);
        const template = await this.createEntityWithAutoId<AgentTemplateModel>('AgentTemplate', toDatabase(templateEntity));

        // Create relationships for assigned tool templates
        if (data.assignedToolSlugs && data.assignedToolSlugs.length > 0) {
          const connection = this.getConnection();

          for (const toolSlug of data.assignedToolSlugs) {
            // Find tool template by slug
            const toolTemplateResult = await connection.executeQuery<{ id: string }>(
              'MATCH (tt:ToolTemplate {slug: $toolSlug}) RETURN tt.id as id',
              { toolSlug }
            );

            if (toolTemplateResult.length > 0) {
              // Create relationship

              await this.addToolTemplateRelationship(template.id, toolTemplateResult[0].id);
            }
          }
        } else {
          console.log(`[AGENT-TEMPLATE-REPO] No assignedToolSlugs provided for agent template ${template.id}`);
        }

        // Transform database result back to domain model
        return fromDatabase(AgentTemplateEntity, template);
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
          await connection.executeWrite('MATCH (at:AgentTemplate {id: $id})-[r:USES_TOOL_TEMPLATE]->() DELETE r', { id });

          // Add new relationships
          if (updates.assignedToolSlugs.length > 0) {
            for (const toolSlug of updates.assignedToolSlugs) {
              // Find tool template by slug
              const toolTemplateResult = await connection.executeQuery<{ id: string }>(
                'MATCH (tt:ToolTemplate {slug: $toolSlug}) RETURN tt.id as id',
                { toolSlug }
              );

              if (toolTemplateResult.length > 0) {
                // Create relationship
                await this.addToolTemplateRelationship(id, toolTemplateResult[0].id);
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

        const result = await connection.executeWrite<{ t: AgentTemplateModel }>(
          'MATCH (t:AgentTemplate) WHERE t.id = $id SET t += $updates RETURN t',
          {
            id,
            updates: toDatabase(toEntityInstance(AgentTemplateEntity, propsWithoutToolSlugs)),
          }
        );

        const template = result[0]?.t || null;
        return template ? fromDatabase(AgentTemplateEntity, template) : null;
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

        const connection = this.getConnection();

        // Clean up all relationships:
        // - AgentTemplate-[:USES_TOOL_TEMPLATE]->ToolTemplate
        // - Agent-[:CREATED_FROM]->AgentTemplate
        // DETACH DELETE will automatically remove all relationships
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (t:AgentTemplate) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
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

        const query = `
        MATCH (t:AgentTemplate {category: $category})
        WHERE t.isPublic = true
        RETURN t
        ORDER BY t.usageCount DESC
      `;

        const result = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(query, { category });
        return fromDatabaseArray(
          AgentTemplateEntity,
          result.map((record) => record.t)
        );
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

        const searchQuery = `
        MATCH (t:AgentTemplate)
        WHERE (
          toLower(t.name) CONTAINS toLower($query) OR
          toLower(t.description) CONTAINS toLower($query)
        )
        RETURN t,
          CASE
            WHEN toLower(t.name) CONTAINS toLower($query) THEN 3
            WHEN toLower(t.description) CONTAINS toLower($query) THEN 2
            ELSE 1
          END as relevance
        ORDER BY relevance DESC, t.usageCount DESC, t.rating DESC
      `;

        const result = await this.getConnection().executeQuery<{ t: AgentTemplateModel }>(searchQuery, {
          query,
        });
        return fromDatabaseArray(
          AgentTemplateEntity,
          result.map((record) => record.t)
        );
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

        const query = `
        MATCH (t:AgentTemplate {id: $id})
        SET t.usageCount = t.usageCount + 1, t.updatedAt = $now
      `;

        await this.getConnection().executeWrite(query, { id, now: new Date().toISOString() });
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

        // Check if both entities exist
        const checkQuery = `
          MATCH (at:AgentTemplate {id: $agentTemplateId})
          MATCH (tt:ToolTemplate {id: $toolTemplateId})
          RETURN at.id, tt.id
        `;

        const checkResult = await connection.executeQuery<{ 'at.id': string; 'tt.id': string }>(checkQuery, {
          agentTemplateId,
          toolTemplateId,
        });

        if (!checkResult || checkResult.length === 0) {
          throw new Error('AgentTemplate or ToolTemplate not found');
        }

        // Create relationship if it doesn't exist
        const relationshipQuery = `
          MATCH (at:AgentTemplate {id: $agentTemplateId})
          MATCH (tt:ToolTemplate {id: $toolTemplateId})
          MERGE (at)-[:USES_TOOL_TEMPLATE {createdAt: $createdAt}]->(tt)
        `;

        await connection.executeWrite(relationshipQuery, {
          agentTemplateId,
          toolTemplateId,
          createdAt: new Date().toISOString(),
        });
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
        const query = `
          MATCH (at:AgentTemplate {id: $agentTemplateId})-[r:USES_TOOL_TEMPLATE]->(tt:ToolTemplate {id: $toolTemplateId})
          DELETE r
        `;

        await connection.executeWrite(query, { agentTemplateId, toolTemplateId });
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
        const query = `
          MATCH (at:AgentTemplate {id: $agentTemplateId})-[:USES_TOOL_TEMPLATE]->(tt:ToolTemplate)
          RETURN tt
          ORDER BY tt.name
        `;

        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>(query, { agentTemplateId });
        return fromDatabaseArray(
          ToolTemplateEntity,
          result.map((record) => record.tt)
        );
      },
      'getToolTemplates',
      'AgentTemplate',
      agentTemplateId
    );
  }
}
