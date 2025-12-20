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
        if (!result) return null;

        const tool = fromDatabase(ToolEntity, result) as ToolModel;

        // If tool has template relationships, fetch templates and populate:
        // - sourceTemplateSlug / publishedTemplateSlug
        // - updateInfo (prefer published template; fallback to source template)
        const connection = this.getConnection();
        const templateIds = [tool.sourceTemplateId, tool.publishedTemplateId].filter((v): v is string => !!v);
        if (templateIds.length > 0) {
          const placeholders = templateIds.map((_, idx) => `$${idx + 1}`).join(', ');
          const templates = await connection.query<Record<string, unknown>>(
            `SELECT * FROM tool_templates WHERE id IN (${placeholders})`,
            templateIds
          );

          const templateMap = new Map<string, ToolTemplateModel>();
          for (const row of templates) {
            const t = fromDatabase(ToolTemplateEntity, row);
            templateMap.set(t.id, t);
          }

          if (tool.sourceTemplateId) {
            const t = templateMap.get(tool.sourceTemplateId);
            if (t) tool.sourceTemplateSlug = t.slug;
          }
          if (tool.publishedTemplateId) {
            const t = templateMap.get(tool.publishedTemplateId);
            if (t) tool.publishedTemplateSlug = t.slug;
          }

          const preferredTemplateId = tool.publishedTemplateId || tool.sourceTemplateId;
          if (preferredTemplateId) {
            const preferred = templateMap.get(preferredTemplateId);
            if (preferred) {
              const comparison = compareVersions(tool.version, preferred.version);
              tool.updateInfo = {
                needsUpdate: comparison < 0,
                latestVersion: preferred.version,
                templateUpdatedAt: preferred.updatedAt,
              };
            }
          }
        }

        return tool;
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
        const tools = fromDatabaseArray(ToolEntity, result) as ToolModel[];

        // Collect unique template IDs (source + published)
        const templateIds = [...new Set(tools.flatMap((t) => [t.sourceTemplateId, t.publishedTemplateId]).filter((v): v is string => !!v))];

        // If there are templates, fetch them in a single query
        if (templateIds.length > 0) {
          const placeholders = templateIds.map((_, idx) => `$${idx + 1}`).join(', ');
          const templates = await connection.query<Record<string, unknown>>(
            `SELECT * FROM tool_templates WHERE id IN (${placeholders})`,
            templateIds
          );

          // Build a map of template ID to template for quick lookup
          const templateMap = new Map<string, ToolTemplateModel>();
          for (const template of templates) {
            const templateModel = fromDatabase(ToolTemplateEntity, template);
            templateMap.set(templateModel.id, templateModel);
          }

          // Populate template slugs + updateInfo for each tool.
          // For updateInfo, prefer publishedTemplateId (if present) so "current template"
          // reflects the template the tool is actually published to; otherwise use sourceTemplateId.
          for (const tool of tools) {
            const sourceTemplateId = tool.sourceTemplateId;
            const publishedTemplateId = tool.publishedTemplateId;

            if (sourceTemplateId) {
              const t = templateMap.get(sourceTemplateId);
              if (t) tool.sourceTemplateSlug = t.slug;
            }
            if (publishedTemplateId) {
              const t = templateMap.get(publishedTemplateId);
              if (t) tool.publishedTemplateSlug = t.slug;
            }

            const preferredTemplateId = publishedTemplateId || sourceTemplateId;
            if (!preferredTemplateId) continue;

            const preferred = templateMap.get(preferredTemplateId);
            if (!preferred) continue;

            const comparison = compareVersions(tool.version, preferred.version);
            tool.updateInfo = {
              needsUpdate: comparison < 0,
              latestVersion: preferred.version,
              templateUpdatedAt: preferred.updatedAt,
            };
          }
        }

        return tools;
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
        if (!result) return null;

        const tool = fromDatabase(ToolEntity, result) as ToolModel;

        // Populate template slugs + updateInfo (prefer published template; fallback to source template)
        const templateIds = [tool.sourceTemplateId, tool.publishedTemplateId].filter((v): v is string => !!v);
        if (templateIds.length > 0) {
          const placeholders = templateIds.map((_, idx) => `$${idx + 1}`).join(', ');
          const templates = await connection.query<Record<string, unknown>>(
            `SELECT * FROM tool_templates WHERE id IN (${placeholders})`,
            templateIds
          );

          const templateMap = new Map<string, ToolTemplateModel>();
          for (const row of templates) {
            const t = fromDatabase(ToolTemplateEntity, row);
            templateMap.set(t.id, t);
          }

          if (tool.sourceTemplateId) {
            const t = templateMap.get(tool.sourceTemplateId);
            if (t) tool.sourceTemplateSlug = t.slug;
          }
          if (tool.publishedTemplateId) {
            const t = templateMap.get(tool.publishedTemplateId);
            if (t) tool.publishedTemplateSlug = t.slug;
          }

          const preferredTemplateId = tool.publishedTemplateId || tool.sourceTemplateId;
          if (preferredTemplateId) {
            const preferred = templateMap.get(preferredTemplateId);
            if (preferred) {
              const comparison = compareVersions(tool.version, preferred.version);
              tool.updateInfo = {
                needsUpdate: comparison < 0,
                latestVersion: preferred.version,
                templateUpdatedAt: preferred.updatedAt,
              };
            }
          }
        }

        return tool;
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
          'SELECT * FROM tools WHERE source_template_id = $1 AND starship_id = $2 ORDER BY created_at DESC LIMIT 1',
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

        const sourceTemplateId = data.sourceTemplateId;
        const publishedTemplateId = data.publishedTemplateId;

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
          ...(sourceTemplateId ? { sourceTemplateId } : {}),
          ...(publishedTemplateId ? { publishedTemplateId } : {}),

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
        const sourceTemplateId = updates.sourceTemplateId;
        const updateProps = {
          ...updates,
          ...(sourceTemplateId !== undefined ? { sourceTemplateId } : {}),
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
          sourceTemplateId: template.id,
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
           JOIN tools t ON t.source_template_id = tt.id
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
        const sourceTemplateId = tool?.sourceTemplateId;
        if (!tool || !sourceTemplateId) {
          return {
            needsUpdate: false,
            currentVersion: tool?.version || '1.0.0',
            latestVersion: tool?.version || '1.0.0',
          };
        }

        const templateRepo = new ToolTemplateRepository();
        const template = await templateRepo.findById(sourceTemplateId);

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
          console.warn(`Invalid template version format for template ${sourceTemplateId}: ${latestVersion}`);
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

        const sourceTemplateId = tool.sourceTemplateId;
        if (!sourceTemplateId) {
          throw new Error('Tool is not linked to a template');
        }

        const templateRepo = new ToolTemplateRepository();
        const template = await templateRepo.findById(sourceTemplateId);

        if (!template) {
          this.handleNotFound('ToolTemplate', sourceTemplateId);
        }

        // Copy current template data to tool.
        // Important: avoid copying instance-owned fields like configuration/isEnabled/status/starshipId/slug.
        const updates: UpdateToolRequest = {
          version: template.version, // Copy template version to tool
          templateSnapshotAt: new Date().toISOString(),
        };

        // Only overwrite fields when template has a real value (defensive for legacy/partial DB rows).
        if (template.name !== null && template.name !== undefined) {
          updates.name = template.name;
        }
        if (template.description !== null && template.description !== undefined) {
          updates.description = template.description;
        }
        if (template.parameters !== null && template.parameters !== undefined) {
          updates.parameters = template.parameters;
        }
        if (template.blueprint !== null && template.blueprint !== undefined) {
          updates.blueprint = template.blueprint;
        }
        if (template.transforms !== null && template.transforms !== undefined) {
          updates.transforms = template.transforms;
        }
        if (template.mutations !== null && template.mutations !== undefined) {
          updates.mutations = template.mutations;
        }
        if (template.condition !== null && template.condition !== undefined) {
          updates.condition = template.condition;
        }

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
   * Atomically mark a tool as pending publication and persist request metadata.
   *
   * Uses SELECT ... FOR UPDATE inside a transaction to prevent concurrent
   * publication requests from both succeeding when the tool is already pending.
   */
  async requestPublicationAtomic(
    id: string,
    updates: {
      publicationStatus: ToolModel['publicationStatus'];
      publicationRequestedBy: string;
      publicationVersionBump: 'patch' | 'minor' | 'major';
      publicationRequestedVersion: string;
      publicationChangelog: string;
    }
  ): Promise<ToolModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        const tool = await connection.transaction<ToolModel | null>(async (client) => {
          // Lock the tool row to serialize concurrent publication requests
          const selectRes = await client.query<Record<string, unknown>>('SELECT * FROM tools WHERE id = $1 FOR UPDATE', [id]);
          const row = selectRes.rows?.[0];

          if (!row) {
            this.handleNotFound('Tool', id);
          }

          const currentTool = fromDatabase(ToolEntity, row as Record<string, unknown>);

          // If another request already moved this tool to pending_approval,
          // surface the same validation error as the service-level guard.
          if (currentTool.publicationStatus === 'pending_approval') {
            throw new Error('Tool is already pending approval');
          }

          const updateRes = await client.query<Record<string, unknown>>(
            `
            UPDATE tools
            SET
              publication_status = $2,
              publication_requested_by = $3,
              publication_version_bump = $4,
              publication_requested_version = $5,
              publication_changelog = $6,
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
            `,
            [
              id,
              updates.publicationStatus,
              updates.publicationRequestedBy,
              updates.publicationVersionBump,
              updates.publicationRequestedVersion,
              updates.publicationChangelog,
            ]
          );

          const updatedRow = updateRes.rows?.[0];
          if (!updatedRow) {
            this.handleNotFound('Tool', id);
          }

          return fromDatabase(ToolEntity, updatedRow as Record<string, unknown>);
        });

        if (!tool) {
          this.handleNotFound('Tool', id);
        }

        return tool;
      },
      'requestPublicationAtomic',
      'Tool',
      id
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
          if (!tool.sourceTemplateId) continue;

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
