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

  /**
   * Resolve the "creator" (user id) for one or more templates.
   *
   * We define creator as:
   * - The user who requested publication of the parent Agent into this template (agents.publication_requested_by), OR
   * - If that field is missing (older data / seeded backfills), the owner of the parent Agent's starship (starships.owner_id).
   *
   * Notes:
   * - A template may have 0 parent agents (seeded templates before backfill) → no creator.
   * - A template may (rarely) have multiple parent agents; we take the earliest by created_at.
   */
  async getCreatorUserIdsByTemplateIds(templateIds: string[]): Promise<Map<string, string>> {
    return this.executeWithErrorHandling(
      async () => {
        const ids = (templateIds || []).map((t) => String(t)).filter((t) => t.trim().length > 0);
        if (ids.length === 0) return new Map();

        const connection = this.getConnection();

        const rows = await connection.query<{
          template_id: string;
          creator_user_id: string | null;
        }>(
          `
          SELECT
            a.published_template_id AS template_id,
            COALESCE(a.publication_requested_by, s.owner_id) AS creator_user_id
          FROM agents a
          LEFT JOIN starships s ON s.id = a.starship_id
          WHERE a.published_template_id = ANY($1)
          ORDER BY a.created_at ASC
          `,
          [ids]
        );

        const map = new Map<string, string>();
        for (const row of rows || []) {
          if (!row?.template_id) continue;
          if (!row?.creator_user_id) continue;
          // First row wins (ordered by created_at asc)
          if (!map.has(row.template_id)) {
            map.set(row.template_id, row.creator_user_id);
          }
        }

        return map;
      },
      'getCreatorUserIdsByTemplateIds',
      'AgentTemplate'
    );
  }

  /**
   * Convenience wrapper to fetch a single template creator user id.
   */
  async getCreatorUserIdByTemplateId(templateId: string): Promise<string | null> {
    const map = await this.getCreatorUserIdsByTemplateIds([templateId]);
    return map.get(templateId) ?? null;
  }

  /**
   * INTERNAL: Load a template including sensitive configuration fields
   * (systemPrompt/state/blueprint + tuning params).
   *
   * Public repository methods (findById/findBySlug/findAll) intentionally strip these
   * fields via toPublicModel() for marketplace/client consumption.
   */
  async findInternalById(id: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!id?.trim()) {
          throw new Error('ID is required for findInternalById operation');
        }

        const result = await super.findEntityById<Record<string, unknown>>('agent_templates', id);
        if (!result) {
          return null;
        }

        const baseTemplate = fromDatabase(AgentTemplateEntity, result) as AgentTemplateModel & Record<string, unknown>;

        // Populate assigned tool template slugs from junction table (authoritative source).
        const connection = this.getConnection();
        const toolResults = await connection.query<{ slug: string }>(
          `SELECT tt.slug
           FROM tool_templates tt
           JOIN agent_template_tool_templates attt ON tt.id = attt.tool_template_id
           WHERE attt.agent_template_id = $1
           ORDER BY tt.name`,
          [id]
        );

        const assignedToolSlugs = toolResults.map((row) => row.slug).filter(Boolean);

        return {
          ...(baseTemplate as AgentTemplateModel),
          assignedToolSlugs,
        };
      },
      'findInternalById',
      'AgentTemplate',
      id
    );
  }

  /**
   * INTERNAL: Convenience wrapper to load a template by slug including config fields.
   */
  async findInternalBySlug(slug: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!slug?.trim()) {
          throw new Error('Slug is required for findInternalBySlug operation');
        }

        const connection = this.getConnection();
        const row = await connection.queryOne<{ id: string }>('SELECT id FROM agent_templates WHERE slug = $1', [slug]);
        if (!row?.id) return null;

        return await this.findInternalById(row.id);
      },
      'findInternalBySlug',
      'AgentTemplate',
      slug
    );
  }

  /**
   * INTERNAL: Load template avatar storage fields.
   * These fields are not exposed in the public AgentTemplateModel returned by findById/findAll.
   */
  async getAvatarStorageById(id: string): Promise<{ avatarS3Key?: string; avatarMimeType?: string; avatarUpdatedAt?: string } | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{
          avatar_s3_key?: string | null;
          avatar_mime_type?: string | null;
          avatar_updated_at?: Date | string | null;
        }>(
          `SELECT avatar_s3_key, avatar_mime_type, avatar_updated_at
           FROM agent_templates
           WHERE id = $1`,
          [id]
        );
        if (!row) return null;
        return {
          avatarS3Key: row.avatar_s3_key ?? undefined,
          avatarMimeType: row.avatar_mime_type ?? undefined,
          avatarUpdatedAt: row.avatar_updated_at ? new Date(row.avatar_updated_at).toISOString() : undefined,
        };
      },
      'getAvatarStorageById',
      'AgentTemplate',
      id
    );
  }

  /**
   * INTERNAL: Update template avatar storage fields.
   */
  async updateAvatarStorage(
    id: string,
    updates: { avatarS3Key: string; avatarMimeType: string; avatarUpdatedAt: string }
  ): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        await connection.query(
          `UPDATE agent_templates
           SET avatar_s3_key = $2,
               avatar_mime_type = $3,
               avatar_updated_at = $4,
               updated_at = NOW()
           WHERE id = $1`,
          [id, updates.avatarS3Key, updates.avatarMimeType, updates.avatarUpdatedAt]
        );
        return true;
      },
      'updateAvatarStorage',
      'AgentTemplate',
      id
    );
  }

  private toPublicModel(model: AgentTemplateModel & Record<string, unknown>): AgentTemplateModel {
    const hasAvatar = typeof model.avatarS3Key === 'string' && String(model.avatarS3Key).length > 0;
    const avatarUrl = hasAvatar ? `/api/v1/agent-templates/${model.id}/avatar` : undefined;
    const avatarUpdatedAt =
      typeof model.avatarUpdatedAt === 'string' && model.avatarUpdatedAt.length > 0 ? model.avatarUpdatedAt : undefined;

    // Never expose raw S3 pointers to clients
    /* eslint-disable @typescript-eslint/no-unused-vars */
    const {
      avatarS3Key: _k,
      avatarMimeType: _m,
      // Never expose sensitive agent configuration on marketplace/public template responses
      systemPrompt: _systemPrompt,
      blueprint: _blueprint,
      state: _state,
      // Never expose model/execution tuning details (keep only `model` name)
      temperature: _temperature,
      maxTokens: _maxTokens,
      reasoning: _reasoning,
      timeout: _timeout,
      ...rest
    } = model;
    /* eslint-enable @typescript-eslint/no-unused-vars */
    return {
      ...(rest as AgentTemplateModel),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(avatarUpdatedAt ? { avatarUpdatedAt } : {}),
    };
  }

  async findAll(): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agent_templates', 'created_at DESC');
        const templates = fromDatabaseArray(AgentTemplateEntity, result) as Array<AgentTemplateModel & Record<string, unknown>>;

        // Populate assignedToolSlugs for list views (Marketplace cards need this)
        const templateIds = templates.map((t) => t.id).filter((id): id is string => typeof id === 'string' && id.trim().length > 0);

        const assignedToolSlugsByTemplateId = new Map<string, string[]>();
        if (templateIds.length > 0) {
          const connection = this.getConnection();
          const toolResults = await connection.query<{ agent_template_id: string; slug: string }>(
            `SELECT attt.agent_template_id, tt.slug
             FROM agent_template_tool_templates attt
             JOIN tool_templates tt ON tt.id = attt.tool_template_id
             WHERE attt.agent_template_id = ANY($1)
             ORDER BY attt.agent_template_id, tt.name`,
            [templateIds]
          );

          for (const row of toolResults) {
            if (!row?.agent_template_id || !row?.slug) continue;
            const key = row.agent_template_id;
            const list = assignedToolSlugsByTemplateId.get(key) ?? [];
            list.push(row.slug);
            assignedToolSlugsByTemplateId.set(key, list);
          }
        }

        return templates.map((t) =>
          this.toPublicModel({
            ...t,
            assignedToolSlugs: assignedToolSlugsByTemplateId.get(String(t.id)) ?? [],
          } as AgentTemplateModel & Record<string, unknown>)
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

        const result = await super.findEntityById<Record<string, unknown>>('agent_templates', id);
        if (!result) {
          return null;
        }

        const baseTemplate = fromDatabase(AgentTemplateEntity, result) as AgentTemplateModel & Record<string, unknown>;

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

        return this.toPublicModel({
          ...baseTemplate,
          assignedToolSlugs,
        } as AgentTemplateModel & Record<string, unknown>);
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
        if (!result) return null;
        const template = fromDatabase(AgentTemplateEntity, result) as AgentTemplateModel & Record<string, unknown>;
        return this.toPublicModel(template);
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
        const databaseFormat = toDatabase(templateEntity);
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
