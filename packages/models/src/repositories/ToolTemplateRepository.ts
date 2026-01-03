import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugRandomSuffix } from '@/utils/slugGenerator';
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

  private async generateUniqueTemplateSlug(baseSlug: string): Promise<string> {
    const connection = this.getConnection();
    const base = generateSlug((baseSlug || '').toString()) || 'tool-template';
    return await generateUniqueSlugRandomSuffix(
      base,
      async (candidate) => {
        const row = await connection.queryOne<{ id: string }>('SELECT id FROM tool_templates WHERE slug = $1', [candidate]);
        return !!row?.id;
      },
      { fallbackBase: 'tool-template', maxLength: 100, alwaysSuffix: true }
    );
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

  async findByName(name: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!name?.trim()) throw new Error('Name is required for findByName operation');
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM tool_templates WHERE LOWER(name) = LOWER($1)', [
          name.trim(),
        ]);
        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'findByName',
      'ToolTemplate',
      name
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
        // Generate a stable template slug from the name (or provided slug), ensuring uniqueness.
        // IMPORTANT: Template slugs should not reuse instance slugs (which contain random suffixes).
        // Slugs are always generated by the server; ignore any caller-provided slug.
        const baseSlug = generateSlug((data.name || '').toString()) || 'tool-template';
        const slug = await this.generateUniqueTemplateSlug(baseSlug);

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

        const cleanedUpdates: UpdateToolTemplateRequest = { ...updates };

        // Note: public UpdateToolTemplateRequest forbids `slug`, but the repository may set it internally.
        const internalUpdates: Partial<ToolTemplateModel> = { ...cleanedUpdates };

        // Auto-regenerate slug on name updates
        if (cleanedUpdates.name !== undefined && cleanedUpdates.name !== null) {
          const baseSlug = generateSlug(String(cleanedUpdates.name)) || 'tool-template';
          internalUpdates.slug = await this.generateUniqueTemplateSlug(baseSlug);
        }

        await ToolTemplateEntity.validate(internalUpdates, 'update');

        const updateProps = {
          ...internalUpdates,
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
