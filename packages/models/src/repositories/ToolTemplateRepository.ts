import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import type {
  ToolTemplateModel,
  CreateToolTemplateRequest,
  UpdateToolTemplateRequest,
  ToolTemplateSearchParams,
} from '@starships/protocol';

export class ToolTemplateRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('ToolTemplateRepository', connection);
  }

  async findAll(): Promise<ToolTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>(
          'MATCH (tt:ToolTemplate) RETURN tt ORDER BY tt.createdAt DESC'
        );
        return fromDatabaseArray(
          ToolTemplateEntity,
          result.map((record) => record.tt)
        );
      },
      'findAll',
      'ToolTemplate'
    );
  }

  async findById(id: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>('MATCH (tt:ToolTemplate) WHERE tt.id = $id RETURN tt', {
          id,
        });
        const toolTemplate = result[0]?.tt || null;
        return toolTemplate ? fromDatabase(ToolTemplateEntity, toolTemplate) : null;
      },
      'findById',
      'ToolTemplate',
      id
    );
  }

  async findBySlug(slug: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>('MATCH (tt:ToolTemplate) WHERE tt.slug = $slug RETURN tt', {
          slug,
        });
        const toolTemplate = result[0]?.tt || null;
        return toolTemplate ? fromDatabase(ToolTemplateEntity, toolTemplate) : null;
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
        let query = 'MATCH (tt:ToolTemplate)';
        const whereConditions: string[] = [];
        const queryParams: Record<string, unknown> = {};

        if (params.category) {
          whereConditions.push('tt.category = $category');
          queryParams.category = params.category;
        }

        if (params.requiresApiKey !== undefined) {
          whereConditions.push('tt.requiresApiKey = $requiresApiKey');
          queryParams.requiresApiKey = params.requiresApiKey;
        }

        if (params.query) {
          whereConditions.push('(tt.name CONTAINS $query OR tt.description CONTAINS $query)');
          queryParams.query = params.query;
        }

        if (whereConditions.length > 0) {
          query += ' WHERE ' + whereConditions.join(' AND ');
        }

        query += ' RETURN tt ORDER BY tt.usageCount DESC, tt.createdAt DESC';

        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>(query, queryParams);
        return result && result.length > 0
          ? fromDatabaseArray(
              ToolTemplateEntity,
              result.map((record) => record.tt)
            )
          : [];
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

        // Create tool template properties without ID (Neo4j will generate it)
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
        const toolTemplate = await this.createEntityWithAutoId<ToolTemplateModel>('ToolTemplate', toDatabase(toolTemplateEntity));

        return fromDatabase(ToolTemplateEntity, toolTemplate);
      },
      'create',
      'ToolTemplate'
    );
  }

  async update(id: string, updates: UpdateToolTemplateRequest): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const result = await connection.executeWrite<{ tt: ToolTemplateModel }>(
          'MATCH (tt:ToolTemplate) WHERE tt.id = $id SET tt += $updates RETURN tt',
          {
            id,
            updates: toDatabase(toEntityInstance(ToolTemplateEntity, updateProps)),
          }
        );

        const toolTemplate = result[0]?.tt || null;
        return toolTemplate ? fromDatabase(ToolTemplateEntity, toolTemplate) : null;
      },
      'update',
      'ToolTemplate',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (tt:ToolTemplate) WHERE tt.id = $id DETACH DELETE tt RETURN count(tt) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'ToolTemplate',
      id
    );
  }

  async incrementUsageCount(id: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeWrite<{ tt: ToolTemplateModel }>(
          'MATCH (tt:ToolTemplate) WHERE tt.id = $id SET tt.usageCount = tt.usageCount + 1, tt.updatedAt = $timestamp RETURN tt',
          {
            id,
            timestamp: new Date().toISOString(),
          }
        );

        const toolTemplate = result[0]?.tt || null;
        return toolTemplate ? fromDatabase(ToolTemplateEntity, toolTemplate) : null;
      },
      'incrementUsageCount',
      'ToolTemplate',
      id
    );
  }
}
