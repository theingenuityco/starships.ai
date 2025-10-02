import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type {
  ToolTemplateModel,
  CreateToolTemplateRequest,
  UpdateToolTemplateRequest,
  ToolTemplateSearchParams,
  AgentTemplateModel,
} from '@starships/protocol';

export class ToolTemplateRepository extends BaseRepository {
  constructor() {
    super('ToolTemplateRepository');
  }

  async findAll(): Promise<ToolTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('tool_templates', 'created_at DESC');
        return fromDatabaseArray(ToolTemplateEntity, result);
      },
      'findAll',
      'ToolTemplate'
    );
  }

  async findById(id: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for findById operation');
        }

        const result = await super.findEntityById<Record<string, unknown>>('tool_templates', id);
        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'findById',
      'ToolTemplate',
      id
    );
  }

  async findBySlug(slug: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!slug?.trim()) {
          throw new Error('Slug is required for findBySlug operation');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM tool_templates WHERE slug = $1', [slug]);
        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'findBySlug',
      'ToolTemplate',
      slug
    );
  }

  async search(params: ToolTemplateSearchParams): Promise<ToolTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'SELECT * FROM tool_templates';
        const whereConditions: string[] = [];
        const queryParams: unknown[] = [];
        let paramIndex = 1;

        if (params.category) {
          whereConditions.push(`category = $${paramIndex}`);
          queryParams.push(params.category);
          paramIndex++;
        }

        if (params.requiresApiKey !== undefined) {
          whereConditions.push(`requires_api_key = $${paramIndex}`);
          queryParams.push(params.requiresApiKey);
          paramIndex++;
        }

        if (params.query) {
          whereConditions.push(`(LOWER(name) LIKE LOWER($${paramIndex}) OR LOWER(description) LIKE LOWER($${paramIndex + 1}))`);
          queryParams.push(`%${params.query}%`);
          queryParams.push(`%${params.query}%`);
          paramIndex += 2;
        }

        if (whereConditions.length > 0) {
          query += ' WHERE ' + whereConditions.join(' AND ');
        }

        query += ' ORDER BY usage_count DESC, created_at DESC';

        const result = await connection.query<Record<string, unknown>>(query, queryParams);
        return fromDatabaseArray(ToolTemplateEntity, result);
      },
      'search',
      'ToolTemplate'
    );
  }

  async create(data: CreateToolTemplateRequest): Promise<ToolTemplateModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Use provided slug or generate from name (slug is required by entity)
        const slug = data.slug || generateSlug(data.name);

        // Validate using entity with slug included
        const dataWithSlug = { ...data, slug };
        await ToolTemplateEntity.validate(dataWithSlug, 'create');

        const now = new Date().toISOString();

        // Create tool template properties
        const toolTemplateProps = {
          // Core ToolParams fields
          name: data.name,
          slug,
          description: data.description,
          parameters: data.parameters,
          blueprint: data.blueprint,
          transforms: data.transforms,
          mutations: data.mutations,
          condition: data.condition,

          // Template-specific fields
          category: data.category,
          usageCount: 0,
          exampleUsage: data.exampleUsage,
          requiresApiKey: data.requiresApiKey,
          configurationFields: data.configurationFields,

          // Database-specific fields
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const toolTemplateEntity = toEntityInstance(ToolTemplateEntity, toolTemplateProps);
        const databaseFormat = toDatabase(toolTemplateEntity);
        const result = await this.createEntity<Record<string, unknown>>('tool_templates', databaseFormat);

        return fromDatabase(ToolTemplateEntity, result);
      },
      'create',
      'ToolTemplate'
    );
  }

  async update(id: string, updates: UpdateToolTemplateRequest): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for update operation');
        }

        await ToolTemplateEntity.validate(updates, 'update');

        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(ToolTemplateEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('tool_templates', id, filteredUpdateData);
        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'update',
      'ToolTemplate',
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
        return await this.deleteEntity('tool_templates', id);
      },
      'delete',
      'ToolTemplate',
      id
    );
  }

  async incrementUsageCount(id: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for incrementUsageCount operation');
        }

        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'UPDATE tool_templates SET usage_count = usage_count + 1, updated_at = $2 WHERE id = $1 RETURNING *',
          [id, new Date().toISOString()]
        );

        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'incrementUsageCount',
      'ToolTemplate',
      id
    );
  }

  // ============================================================================
  // RELATIONSHIP MANAGEMENT (Back-references)
  // ============================================================================

  /**
   * Get all AgentTemplates that use this ToolTemplate
   */
  async getUsedByAgentTemplates(toolTemplateId: string): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!toolTemplateId?.trim()) {
          throw new Error('toolTemplateId is required');
        }

        const connection = this.getConnection();
        const query = `
          SELECT at.*
          FROM agent_templates at
          JOIN agent_template_tool_templates attt ON at.id = attt.agent_template_id
          WHERE attt.tool_template_id = $1
          ORDER BY at.name
        `;

        const result = await connection.query<Record<string, unknown>>(query, [toolTemplateId]);
        return fromDatabaseArray(AgentTemplateEntity, result);
      },
      'getUsedByAgentTemplates',
      'ToolTemplate',
      toolTemplateId
    );
  }

  /**
   * Check if a ToolTemplate is used by any AgentTemplate
   */
  async isUsedByAgentTemplates(toolTemplateId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        if (!toolTemplateId?.trim()) {
          throw new Error('toolTemplateId is required');
        }

        const connection = this.getConnection();
        const query = `
          SELECT COUNT(*) as count
          FROM agent_template_tool_templates
          WHERE tool_template_id = $1
        `;

        const count = await connection.queryCount(query, [toolTemplateId]);
        return count > 0;
      },
      'isUsedByAgentTemplates',
      'ToolTemplate',
      toolTemplateId
    );
  }
}
