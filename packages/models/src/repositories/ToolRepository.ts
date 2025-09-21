import { ToolEntity } from '@/entities/ToolEntity';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { Neo4jConnection } from '@/helpers/database';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ToolModel, CreateToolRequest, UpdateToolRequest, ToolSearchParams, ToolTemplateModel } from '@starships/protocol';

export class ToolRepository extends BaseRepository {
  constructor(connection?: Neo4jConnection) {
    super('ToolRepository', connection);
  }

  async findAll(): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ t: ToolModel }>('MATCH (t:Tool) RETURN t ORDER BY t.createdAt DESC');
        return fromDatabaseArray(
          ToolEntity,
          result.map((record) => record.t)
        );
      },
      'findAll',
      'Tool'
    );
  }

  async findById(id: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ t: ToolModel }>('MATCH (t:Tool) WHERE t.id = $id RETURN t', { id });
        const tool = result[0]?.t || null;
        return tool ? fromDatabase(ToolEntity, tool) : null;
      },
      'findById',
      'Tool',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ t: ToolModel }>(
          'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN t ORDER BY t.createdAt DESC',
          { starshipId }
        );
        return result && result.length > 0
          ? fromDatabaseArray(
              ToolEntity,
              result.map((record) => record.t)
            )
          : [];
      },
      'findByStarship',
      'Tool'
    );
  }

  async findBySlugAndStarship(slug: string, starshipId: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ t: ToolModel }>(
          'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE t.slug = $slug AND s.id = $starshipId RETURN t',
          { slug, starshipId }
        );
        const tool = result[0]?.t || null;
        return tool ? fromDatabase(ToolEntity, tool) : null;
      },
      'findBySlugAndStarship',
      'Tool',
      `${slug}@${starshipId}`
    );
  }

  async findBySlugs(slugs: string[], starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.executeQuery<{ t: ToolModel }>(
          'MATCH (t:Tool)-[:DEPLOYED_ON]->(s:Starship) WHERE t.slug IN $slugs AND s.id = $starshipId RETURN t ORDER BY t.createdAt DESC',
          { slugs, starshipId }
        );
        return result && result.length > 0
          ? fromDatabaseArray(
              ToolEntity,
              result.map((record) => record.t)
            )
          : [];
      },
      'findBySlugs',
      'Tool'
    );
  }

  async search(params: ToolSearchParams): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'MATCH (t:Tool)';
        const whereConditions: string[] = [];
        const queryParams: Record<string, unknown> = {};

        if (params.isEnabled !== undefined) {
          whereConditions.push('t.isEnabled = $isEnabled');
          queryParams.isEnabled = params.isEnabled;
        }

        if (params.query) {
          whereConditions.push('(t.name CONTAINS $query OR t.description CONTAINS $query)');
          queryParams.query = params.query;
        }

        if (whereConditions.length > 0) {
          query += ' WHERE ' + whereConditions.join(' AND ');
        }

        query += ' RETURN t ORDER BY t.createdAt DESC';

        const result = await connection.executeQuery<{ t: ToolModel }>(query, queryParams);
        return result && result.length > 0
          ? fromDatabaseArray(
              ToolEntity,
              result.map((record) => record.t)
            )
          : [];
      },
      'search',
      'Tool'
    );
  }

  async create(data: CreateToolRequest, starshipId: string): Promise<ToolModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Validate using entity
        await ToolEntity.validate(data, 'create');

        const now = new Date().toISOString();

        // Create tool properties without ID (Neo4j will generate it)
        const toolProps = {
          // Core ToolParams fields
          name: data.name,
          description: data.description,
          parameters: data.parameters,
          blueprint: data.blueprint,
          transforms: data.transforms,
          mutations: data.mutations,
          condition: data.condition,

          // Tool instance fields
          slug: data.slug,
          configuration: data.configuration,
          isEnabled: data.isEnabled ?? true,

          // Database-specific fields
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const toolEntity = toEntityInstance(ToolEntity, toolProps);
        const tool = await this.createEntityWithAutoId<ToolModel>('Tool', toDatabase(toolEntity));

        // Create relationship to starship with slug metadata
        const connection = this.getConnection();
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (t:Tool {id: $toolId})
           CREATE (t)-[:DEPLOYED_ON {
             key: $key,
             toolSlug: $toolSlug,
             deployedAt: $timestamp
           }]->(s)`,
          {
            starshipId: starshipId,
            toolId: tool.id,
            key: `${tool.id}_${starshipId}`,
            toolSlug: data.slug,
            timestamp: now,
          }
        );

        return fromDatabase(ToolEntity, tool);
      },
      'create',
      'Tool'
    );
  }

  async update(id: string, updates: UpdateToolRequest): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        const result = await connection.executeWrite<{ t: ToolModel }>('MATCH (t:Tool) WHERE t.id = $id SET t += $updates RETURN t', {
          id,
          updates: toDatabase(toEntityInstance(ToolEntity, updateProps)),
        });

        const tool = result[0]?.t || null;
        return tool ? fromDatabase(ToolEntity, tool) : null;
      },
      'update',
      'Tool',
      id
    );
  }

  async updateStarship(toolId: string, starshipId: string): Promise<ToolModel> {
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

        // Get tool to preserve slug for relationship
        const toolResult = await connection.executeQuery<{ t: ToolModel }>('MATCH (t:Tool) WHERE t.id = $toolId RETURN t', { toolId });

        if (!toolResult[0]?.t) {
          this.handleNotFound('Tool', toolId);
        }

        const tool = toolResult[0].t;

        // Remove existing DEPLOYED_ON relationships
        await connection.executeWrite('MATCH (t:Tool {id: $toolId})-[r:DEPLOYED_ON]->() DELETE r', { toolId });

        // Create new DEPLOYED_ON relationship
        await connection.executeWrite(
          `MATCH (s:Starship {id: $starshipId}), (t:Tool {id: $toolId})
           CREATE (t)-[:DEPLOYED_ON {
             key: $key,
             toolSlug: $toolSlug,
             deployedAt: $timestamp,
             isActive: true
           }]->(s)`,
          {
            starshipId,
            toolId,
            key: `${toolId}_${starshipId}`,
            toolSlug: tool.slug,
            timestamp: new Date().toISOString(),
          }
        );

        // Update tool updatedAt
        const result = await connection.executeWrite<{ t: ToolModel }>(
          `MATCH (t:Tool) WHERE t.id = $toolId
           SET t.updatedAt = $timestamp
           RETURN t`,
          {
            toolId,
            timestamp: new Date().toISOString(),
          }
        );

        return fromDatabase(ToolEntity, result[0].t);
      },
      'updateStarship',
      'Tool',
      toolId
    );
  }

  async createFromTemplate(templateSlug: string, starshipId: string, configuration?: Record<string, unknown>): Promise<ToolModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Find the template
        const templateResult = await connection.executeQuery<{ tt: ToolTemplateModel }>(
          'MATCH (tt:ToolTemplate) WHERE tt.slug = $templateSlug RETURN tt',
          { templateSlug }
        );

        if (!templateResult[0]?.tt) {
          this.handleNotFound('ToolTemplate', templateSlug);
        }

        // Properly deserialize template data using ToolTemplateEntity
        const template = fromDatabase(ToolTemplateEntity, templateResult[0].tt);

        // Create tool from template
        const toolData: CreateToolRequest = {
          name: template.name,
          description: template.description,
          parameters: template.parameters,
          blueprint: template.blueprint,
          transforms: template.transforms,
          mutations: template.mutations,
          condition: template.condition,
          slug: template.slug, // Copy slug from template
          configuration: configuration || {},
          isEnabled: true,
        };

        const tool = await this.create(toolData, starshipId);

        // Create CREATED_FROM relationship
        await connection.executeWrite(
          `MATCH (t:Tool {id: $toolId}), (tt:ToolTemplate {id: $templateId})
           CREATE (t)-[:CREATED_FROM {createdAt: $createdAt}]->(tt)`,
          {
            toolId: tool.id,
            templateId: template.id,
            createdAt: new Date().toISOString(),
          }
        );

        // Increment template usage count
        await connection.executeWrite('MATCH (tt:ToolTemplate) WHERE tt.slug = $templateSlug SET tt.usageCount = tt.usageCount + 1', {
          templateSlug,
        });

        return tool;
      },
      'createFromTemplate',
      'Tool'
    );
  }

  /**
   * Get the ToolTemplate that this Tool was created from
   */
  async getSourceTemplate(toolId: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const query = `
          MATCH (t:Tool {id: $toolId})-[:CREATED_FROM]->(tt:ToolTemplate)
          RETURN tt
        `;

        const result = await connection.executeQuery<{ tt: ToolTemplateModel }>(query, { toolId });
        const template = result[0]?.tt || null;
        return template ? fromDatabase(ToolTemplateEntity, template) : null;
      },
      'getSourceTemplate',
      'Tool',
      toolId
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Clean up all relationships including Agent-[:USES_TOOL]->Tool relationships
        // DETACH DELETE will automatically remove all relationships
        const result = await connection.executeWrite<{ deletedCount: number }>(
          'MATCH (t:Tool) WHERE t.id = $id DETACH DELETE t RETURN count(t) as deletedCount',
          { id }
        );

        return result[0]?.deletedCount > 0;
      },
      'delete',
      'Tool',
      id
    );
  }
}
