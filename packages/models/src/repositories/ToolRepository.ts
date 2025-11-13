import { ToolEntity } from '@/entities/ToolEntity';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type {
  ToolModel,
  CreateToolRequest,
  UpdateToolRequest,
  ToolSearchParams,
  ToolTemplateModel,
  ToolUpdateCheckResponse,
} from '@starships/protocol';
import { generateUniqueToolSlug } from '@/utils/slugGenerator';
import { compareVersions, isValidVersion } from '@/utils/version';
import { ToolTemplateRepository } from './ToolTemplateRepository';

export class ToolRepository extends BaseRepository {
  constructor() {
    super('ToolRepository');
  }

  async findAll(): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('tools', 'created_at DESC');
        return fromDatabaseArray(ToolEntity, result);
      },
      'findAll',
      'Tool'
    );
  }

  async findById(id: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('tools', id);
        return result ? fromDatabase(ToolEntity, result) : null;
      },
      'findById',
      'Tool',
      id
    );
  }

  async findBySlug(slug: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM tools WHERE slug = $1', [slug]);
        return result ? fromDatabase(ToolEntity, result) : null;
      },
      'findBySlug',
      'Tool',
      slug
    );
  }

  async findByStarship(starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM tools WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'findByStarship',
      'Tool'
    );
  }

  async findBySlugAndStarship(slug: string, starshipId: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM tools WHERE slug = $1 AND starship_id = $2', [
          slug,
          starshipId,
        ]);
        return result ? fromDatabase(ToolEntity, result) : null;
      },
      'findBySlugAndStarship',
      'Tool',
      `${slug}@${starshipId}`
    );
  }

  /**
   * Find an existing tool for a starship that was created from a given tool template slug
   */
  async findByTemplateSlugAndStarship(templateSlug: string, starshipId: string): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Resolve template id from slug
        const template = await connection.queryOne<{ id: string }>('SELECT id FROM tool_templates WHERE slug = $1', [templateSlug]);

        if (!template) {
          return null;
        }

        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM tools WHERE template_id = $1 AND starship_id = $2 ORDER BY created_at DESC LIMIT 1',
          [template.id, starshipId]
        );

        return result ? fromDatabase(ToolEntity, result) : null;
      },
      'findByTemplateSlugAndStarship',
      'Tool',
      `${templateSlug}@${starshipId}`
    );
  }

  async findBySlugs(slugs: string[], starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM tools WHERE slug = ANY($1) AND starship_id = $2 ORDER BY created_at DESC',
          [slugs, starshipId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'findBySlugs',
      'Tool'
    );
  }

  async search(params: ToolSearchParams): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        let query = 'SELECT * FROM tools WHERE 1=1';
        const sqlParams: unknown[] = [];
        let paramIndex = 1;

        if (params.isEnabled !== undefined) {
          query += ` AND is_enabled = $${paramIndex++}`;
          sqlParams.push(params.isEnabled);
        }

        if (params.status !== undefined) {
          query += ` AND status = $${paramIndex++}`;
          sqlParams.push(params.status);
        }

        if (params.query) {
          query += ` AND (LOWER(name) LIKE LOWER($${paramIndex++}) OR LOWER(description) LIKE LOWER($${paramIndex++}))`;
          sqlParams.push(`%${params.query}%`);
          sqlParams.push(`%${params.query}%`);
        }

        query += ' ORDER BY created_at DESC';

        const result = await connection.query<Record<string, unknown>>(query, sqlParams);
        return fromDatabaseArray(ToolEntity, result);
      },
      'search',
      'Tool'
    );
  }

  async create(data: CreateToolRequest, starshipId: string): Promise<ToolModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Determine a globally-unique slug
        // Creation no longer accepts client-provided slug; derive from name and ensure uniqueness with suffix
        const baseFromName = (data.name || 'tool')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/--+/g, '-');
        const slug = await generateUniqueToolSlug(baseFromName || 'tool', this);

        // Create tool properties including starship relationship
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
          slug,
          configuration: data.configuration,
          isEnabled: data.isEnabled ?? true,
          status: data.status || 'active',

          // Relationship field
          starshipId: starshipId,
          ...(data.templateId ? { templateId: data.templateId } : {}),

          // Versioning fields
          version: (data as UpdateToolRequest).version || '1.0.0',
          ...((data as UpdateToolRequest).templateSnapshotAt ? { templateSnapshotAt: (data as UpdateToolRequest).templateSnapshotAt } : {}),

          // Database-specific fields
          createdAt: now,
          updatedAt: now,
        };

        // Validate using entity
        await ToolEntity.validate(toolProps, 'create');

        // Create entity instance from plain object, then serialize
        const toolEntity = toEntityInstance(ToolEntity, toolProps);
        const databaseFormat = toDatabase(toolEntity);
        const result = await this.createEntity<Record<string, unknown>>('tools', databaseFormat);

        return fromDatabase(ToolEntity, result);
      },
      'create',
      'Tool'
    );
  }

  async update(id: string, updates: UpdateToolRequest): Promise<ToolModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const updateProps = {
          ...updates,
          updatedAt: new Date().toISOString(),
        };

        // Convert entity updates to database format
        const updateData = toDatabase(toEntityInstance(ToolEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('tools', id, filteredUpdateData);
        return result ? fromDatabase(ToolEntity, result) : null;
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
        const starshipCheck = await connection.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM starships WHERE id = $1', [
          starshipId,
        ]);

        if (!starshipCheck || parseInt(starshipCheck.count) === 0) {
          this.handleNotFound('Starship', starshipId);
        }

        // Update tool's starship assignment
        const result = await this.updateEntity<Record<string, unknown>>('tools', toolId, {
          starship_id: starshipId,
          updated_at: new Date().toISOString(),
        });

        if (!result) {
          this.handleNotFound('Tool', toolId);
        }

        return fromDatabase(ToolEntity, result);
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
        const templateResult = await connection.queryOne<Record<string, unknown>>('SELECT * FROM tool_templates WHERE slug = $1', [
          templateSlug,
        ]);

        if (!templateResult) {
          this.handleNotFound('ToolTemplate', templateSlug);
        }

        // Properly deserialize template data using ToolTemplateEntity
        const template = fromDatabase(ToolTemplateEntity, templateResult);

        // Create tool from template
        const now = new Date().toISOString();
        const toolData: CreateToolRequest = {
          name: template.name,
          description: template.description,
          parameters: template.parameters,
          blueprint: template.blueprint,
          transforms: template.transforms,
          mutations: template.mutations,
          condition: template.condition,
          // Use unique slug derived from template slug (always suffix like agents)
          slug: await generateUniqueToolSlug(template.slug, this),
          templateId: template.id,
          configuration: configuration || {},
          isEnabled: true,
          version: template.version, // Copy template version
          templateSnapshotAt: now, // Capture snapshot time
        };

        // Ensure global uniqueness via create and return tool
        const tool = await this.create(toolData, starshipId);

        // Record the template relationship and increment usage count
        await connection.query('UPDATE tool_templates SET usage_count = usage_count + 1, updated_at = $2 WHERE slug = $1', [
          templateSlug,
          new Date().toISOString(),
        ]);

        return tool;
      },
      'createFromTemplate',
      'Tool'
    );
  }

  /**
   * Get the ToolTemplate that this Tool was created from
   * Note: In PostgreSQL, we can track this via tool slug matching template slug
   */
  async getSourceTemplate(toolId: string): Promise<ToolTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          `SELECT tt.*
           FROM tool_templates tt
           JOIN tools t ON t.template_id = tt.id
           WHERE t.id = $1`,
          [toolId]
        );
        return result ? fromDatabase(ToolTemplateEntity, result) : null;
      },
      'getSourceTemplate',
      'Tool',
      toolId
    );
  }

  /**
   * Check if tool needs update from its source template
   */
  async checkForUpdate(toolId: string): Promise<ToolUpdateCheckResponse> {
    return this.executeWithErrorHandling(
      async () => {
        const tool = await this.findById(toolId);

        // No template = no updates available
        if (!tool?.templateId) {
          return {
            needsUpdate: false,
            currentVersion: tool?.version || '1.0.0',
            latestVersion: tool?.version || '1.0.0',
          };
        }

        const templateRepo = new ToolTemplateRepository();
        const template = await templateRepo.findById(tool.templateId);

        if (!template) {
          return {
            needsUpdate: false,
            currentVersion: tool.version,
            latestVersion: tool.version,
          };
        }

        const currentVersion = tool.version || '1.0.0';
        const latestVersion = template.version;

        // Validate versions before comparison
        if (!isValidVersion(currentVersion)) {
          console.warn(`Invalid current version format for tool ${toolId}: ${currentVersion}`);
          return {
            needsUpdate: false,
            currentVersion,
            latestVersion,
            templateUpdatedAt: template.updatedAt,
          };
        }

        if (!isValidVersion(latestVersion)) {
          console.warn(`Invalid template version format for template ${tool.templateId}: ${latestVersion}`);
          return {
            needsUpdate: false,
            currentVersion,
            latestVersion,
            templateUpdatedAt: template.updatedAt,
          };
        }

        // Compare versions (not timestamps!)
        // compareVersions throws an error if versions are invalid, but we've validated above
        let needsUpdate = false;
        try {
          needsUpdate = compareVersions(latestVersion, currentVersion) > 0;
        } catch (error) {
          console.error(`Error comparing versions for tool ${toolId}:`, error);
          // If comparison fails, assume no update needed
          needsUpdate = false;
        }

        return {
          needsUpdate,
          currentVersion,
          latestVersion,
          templateUpdatedAt: template.updatedAt,
        };
      },
      'checkForUpdate',
      'Tool',
      toolId
    );
  }

  /**
   * Update tool with latest template data
   */
  async updateFromTemplate(toolId: string): Promise<ToolModel> {
    return this.executeWithErrorHandling(
      async () => {
        const tool = await this.findById(toolId);

        if (!tool) {
          this.handleNotFound('Tool', toolId);
        }

        if (!tool.templateId) {
          throw new Error('Tool is not linked to a template');
        }

        const templateRepo = new ToolTemplateRepository();
        const template = await templateRepo.findById(tool.templateId);

        if (!template) {
          this.handleNotFound('ToolTemplate', tool.templateId);
        }

        // Copy current template data to tool
        const updates: UpdateToolRequest = {
          description: template.description,
          parameters: template.parameters,
          blueprint: template.blueprint,
          transforms: template.transforms,
          mutations: template.mutations,
          condition: template.condition,
          version: template.version, // Copy template version to tool
          templateSnapshotAt: new Date().toISOString(),
        };

        const updated = await this.update(toolId, updates);
        if (!updated) {
          throw new Error('Failed to update tool from template');
        }

        return updated;
      },
      'updateFromTemplate',
      'Tool',
      toolId
    );
  }

  /**
   * Get all tools with available updates for a starship
   */
  async getToolsWithUpdates(starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const tools = await this.findByStarship(starshipId);
        const toolsWithUpdates: ToolModel[] = [];

        for (const tool of tools) {
          if (!tool.templateId) continue;

          const updateCheck = await this.checkForUpdate(tool.id);
          if (updateCheck.needsUpdate) {
            toolsWithUpdates.push(tool);
          }
        }

        return toolsWithUpdates;
      },
      'getToolsWithUpdates',
      'Tool'
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // Delete will cascade to remove relationships via foreign key constraints
        return await this.deleteEntity('tools', id);
      },
      'delete',
      'Tool',
      id
    );
  }
}
