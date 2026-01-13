import { AgentTemplateEntity } from '@/entities/AgentTemplateEntity';
import { ToolTemplateEntity } from '@/entities/ToolTemplateEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { generateSlug } from '@/helpers/slugUtils';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugRandomSuffix } from '@/utils/slugGenerator';
import type { AgentTemplateModel, CreateAgentTemplateRequest, UpdateAgentTemplateRequest, ToolTemplateModel } from '@starships/protocol';

export class AgentTemplateRepository extends BaseRepository {
  constructor() {
    super('AgentTemplateRepository');
  }

  /**
   * Resolve a template slug to an existing row, tolerating legacy vs new slug formats.
   *
   * Why:
   * - Template slugs are now generated with an always-on random suffix (e.g. `data-analyst-3ie8`).
   * - Older databases / seeded rows may still have the "base" slug (e.g. `data-analyst`).
   * - Some callers may pass either form; this resolver makes lookups robust.
   *
   * Behavior (in order):
   * - Prefer exact match on the incoming slug
   * - If incoming slug has a random suffix, also try the base slug (strip `-[a-z0-9]{4}`)
   * - If still not found, try `${base}-<suffix>` pattern match for the base slug
   */
  private async resolveTemplateRowBySlug(slug: string): Promise<Record<string, unknown> | null> {
    const raw = String(slug || '').trim();
    if (!raw) return null;

    const normalized = generateSlug(raw);
    if (!normalized) return null;

    // If the incoming slug already has a random suffix, try the base form too.
    const suffixMatch = normalized.match(/^(.*?)-([a-z0-9]{4})$/);
    const base = suffixMatch?.[1] ? suffixMatch[1] : normalized;

    const connection = this.getConnection();

    // We keep the query simple and deterministic:
    // - exact input wins
    // - exact base wins next (legacy rows)
    // - otherwise pick the newest matching suffixed slug
    //
    // Security: avoid the Postgres regex operator (~) entirely here.
    // We rely on a fixed-shape LIKE pattern: `${base}-____` (exactly 4 chars).
    const row = await connection.queryOne<Record<string, unknown>>(
      `
        SELECT *
        FROM agent_templates
        WHERE slug = $1
           OR slug = $2
           OR slug LIKE ($2 || '-____')
        ORDER BY (slug = $1) DESC, (slug = $2) DESC, created_at DESC
        LIMIT 1
      `,
      [normalized, base]
    );

    return row ?? null;
  }

  /**
   * Resolve a tool template id from an assignedToolSlugs entry.
   *
   * Why:
   * - Tool template slugs are now generated with an always-on random suffix (e.g. `list-agents-x7k9`).
   * - Seeded agent templates (and API clients) commonly reference the "base" slug (e.g. `list-agents`).
   *
   * Behavior:
   * - Prefer exact slug match
   * - Fall back to "random-suffix" match: `${baseSlug}-<suffix>`
   *
   * Important:
   * A naive prefix match (`${baseSlug}-%`) can accidentally match other base slugs that merely start
   * with the same prefix (e.g. `list` matching `list-agents-xxxx`). Since template slugs are generated
   * with a fixed random suffix (`[a-z0-9]{4}`), we can (and should) match that exact shape:
   * `^${baseSlug}-[a-z0-9]{4}$`.
   */
  async resolveToolTemplateIdForAssignedSlug(assignedSlug: string): Promise<string | null> {
    const base = generateSlug(String(assignedSlug || ''));
    if (!base) return null;

    // Escape for use inside a Postgres regex pattern (defensive; base is already slugified).
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    const baseRegex = `^${escapeRegex(base)}-[a-z0-9]{4}$`;

    const connection = this.getConnection();
    const result = await connection.queryOne<{ id: string }>(
      `
        SELECT id
        FROM tool_templates
        WHERE slug = $1 OR slug ~ $2
        ORDER BY (slug = $1) DESC, created_at DESC
        LIMIT 1
      `,
      [base, baseRegex]
    );

    return result?.id ?? null;
  }

  private async generateUniqueTemplateSlug(baseSlug: string): Promise<string> {
    const connection = this.getConnection();
    const base = generateSlug((baseSlug || '').toString()) || 'agent-template';
    return await generateUniqueSlugRandomSuffix(
      base,
      async (candidate) => {
        const row = await connection.queryOne<{ id: string }>('SELECT id FROM agent_templates WHERE slug = $1', [candidate]);
        return !!row?.id;
      },
      { fallbackBase: 'agent-template', maxLength: 100, alwaysSuffix: true }
    );
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
   * INTERNAL: Batch-load templates including sensitive configuration fields
   * (systemPrompt/state/blueprint + tuning params) for a set of ids.
   *
   * Returns a map keyed by template id. Missing ids will not be present.
   */
  async findInternalByIds(ids: string[]): Promise<Map<string, AgentTemplateModel>> {
    return this.executeWithErrorHandling(
      async () => {
        const uniqueIds = Array.from(new Set((ids || []).map((t) => String(t)).filter((t) => t.trim().length > 0)));
        if (uniqueIds.length === 0) return new Map();

        const connection = this.getConnection();

        const rows = await connection.query<Record<string, unknown>>(
          `SELECT *
           FROM agent_templates
           WHERE id = ANY($1)`,
          [uniqueIds]
        );

        const templates = fromDatabaseArray(AgentTemplateEntity, rows) as Array<AgentTemplateModel & Record<string, unknown>>;
        if (!templates || templates.length === 0) return new Map();

        // Populate assignedToolSlugs from junction table in one query.
        const toolRows = await connection.query<{ agent_template_id: string; slug: string }>(
          `SELECT attt.agent_template_id, tt.slug
           FROM agent_template_tool_templates attt
           JOIN tool_templates tt ON tt.id = attt.tool_template_id
           WHERE attt.agent_template_id = ANY($1)
           ORDER BY attt.agent_template_id, tt.name`,
          [uniqueIds]
        );

        const assignedToolSlugsByTemplateId = new Map<string, string[]>();
        for (const row of toolRows || []) {
          if (!row?.agent_template_id || !row?.slug) continue;
          const key = String(row.agent_template_id);
          const list = assignedToolSlugsByTemplateId.get(key) ?? [];
          list.push(row.slug);
          assignedToolSlugsByTemplateId.set(key, list);
        }

        const out = new Map<string, AgentTemplateModel>();
        for (const t of templates) {
          const id = String(t.id);
          out.set(id, {
            ...(t as AgentTemplateModel),
            assignedToolSlugs: assignedToolSlugsByTemplateId.get(id) ?? [],
          });
        }

        return out;
      },
      'findInternalByIds',
      'AgentTemplate'
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

        const resolved = await this.resolveTemplateRowBySlug(slug);
        const id = resolved && typeof resolved['id'] === 'string' ? (resolved['id'] as string) : undefined;
        if (!id) return null;
        return await this.findInternalById(id);
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

  private async getAssignedToolSlugsByTemplateIds(templateIds: string[]): Promise<Map<string, string[]>> {
    const ids = (templateIds || []).map((t) => String(t)).filter((t) => t.trim().length > 0);
    const map = new Map<string, string[]>();
    if (ids.length === 0) return map;

    const connection = this.getConnection();
    const rows = await connection.query<{ agent_template_id: string; slug: string }>(
      `SELECT attt.agent_template_id, tt.slug
       FROM agent_template_tool_templates attt
       JOIN tool_templates tt ON tt.id = attt.tool_template_id
       WHERE attt.agent_template_id = ANY($1)
       ORDER BY attt.agent_template_id, tt.name`,
      [ids]
    );

    for (const row of rows || []) {
      if (!row?.agent_template_id || !row?.slug) continue;
      const key = String(row.agent_template_id);
      const list = map.get(key) ?? [];
      list.push(row.slug);
      map.set(key, list);
    }

    return map;
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

        const result = await this.resolveTemplateRowBySlug(slug);
        if (!result) return null;
        const template = fromDatabase(AgentTemplateEntity, result) as AgentTemplateModel & Record<string, unknown>;
        return this.toPublicModel(template);
      },
      'findBySlug',
      'AgentTemplate',
      slug
    );
  }

  async findByName(name: string): Promise<AgentTemplateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        if (!name?.trim()) throw new Error('Name is required for findByName operation');
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agent_templates WHERE LOWER(name) = LOWER($1)', [
          name.trim(),
        ]);
        return result ? fromDatabase(AgentTemplateEntity, result) : null;
      },
      'findByName',
      'AgentTemplate',
      name
    );
  }

  async create(data: CreateAgentTemplateRequest): Promise<AgentTemplateModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Generate a stable template slug from the name (or provided slug), ensuring uniqueness.
        // IMPORTANT: Template slugs should not reuse instance slugs (which contain random suffixes).
        // Slugs are always generated by the server; ignore any caller-provided slug.
        const baseSlug = generateSlug((data.name || '').toString()) || 'agent-template';
        const slug = await this.generateUniqueTemplateSlug(baseSlug);

        // Build template data for database storage
        const templateProps = {
          // Explicit primitive fields
          name: data.name,
          role: data.role,
          slug: slug,
          description: data.description,
          category: data.category,
          model: data.model,
          temperature: data.temperature,
          maxTokens: data.maxTokens,
          reasoning: data.reasoning,
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
          for (const toolSlug of data.assignedToolSlugs) {
            const toolTemplateId = await this.resolveToolTemplateIdForAssignedSlug(toolSlug);
            if (toolTemplateId) {
              // Create relationship using junction table
              await this.addToolTemplateRelationship(template.id, toolTemplateId);
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
        const cleanedUpdates: UpdateAgentTemplateRequest = { ...updates };

        // Auto-regenerate slug on name updates
        // Note: public UpdateAgentTemplateRequest forbids `slug`, but the repository may set it internally.
        const internalUpdates: Partial<AgentTemplateModel> = { ...cleanedUpdates };
        if (cleanedUpdates.name !== undefined && cleanedUpdates.name !== null) {
          const baseSlug = generateSlug(String(cleanedUpdates.name)) || 'agent-template';
          internalUpdates.slug = await this.generateUniqueTemplateSlug(baseSlug);
        }

        await AgentTemplateEntity.validate(internalUpdates, 'update');

        const connection = this.getConnection();

        // Handle tool template relationships if assignedToolSlugs is being updated
        if (cleanedUpdates.assignedToolSlugs !== undefined) {
          // Remove existing relationships
          await connection.query('DELETE FROM agent_template_tool_templates WHERE agent_template_id = $1', [id]);

          // Add new relationships
          if (cleanedUpdates.assignedToolSlugs.length > 0) {
            for (const toolSlug of cleanedUpdates.assignedToolSlugs) {
              const toolTemplateId = await this.resolveToolTemplateIdForAssignedSlug(toolSlug);
              if (toolTemplateId) {
                // Create relationship using junction table
                await this.addToolTemplateRelationship(id, toolTemplateId);
              }
            }
          }
        }

        const updateProps = {
          ...internalUpdates,
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
        const templates = fromDatabaseArray(AgentTemplateEntity, result) as Array<AgentTemplateModel & Record<string, unknown>>;
        const templateIds = templates.map((t) => String(t.id)).filter((id) => typeof id === 'string' && id.trim().length > 0);
        const assignedToolSlugsByTemplateId = await this.getAssignedToolSlugsByTemplateIds(templateIds);

        return templates.map((t) =>
          this.toPublicModel({
            ...t,
            assignedToolSlugs: assignedToolSlugsByTemplateId.get(String(t.id)) ?? [],
          } as AgentTemplateModel & Record<string, unknown>)
        );
      },
      'findByCategory',
      'AgentTemplate'
    );
  }

  async searchTemplates(query: string, opts?: { category?: string }): Promise<AgentTemplateModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!query?.trim()) {
          throw new Error('Search query is required');
        }

        if (query.length > 200) {
          throw new Error('Search query cannot exceed 200 characters');
        }

        const connection = this.getConnection();
        const q = String(query).trim();
        const tokens = Array.from(
          new Set(
            q
              .toLowerCase()
              .split(/[\s/,_-]+/g)
              .map((t) => t.trim())
              .filter(Boolean)
              .slice(0, 8)
          )
        );

        // Always include the full query as a search term too (phrase-like match)
        const fullLike = `%${q}%`;

        const where: string[] = [];
        const params: unknown[] = [];
        let i = 1;

        // Keep category filtering consistent with other list APIs (optional).
        if (opts?.category) {
          where.push(`category = $${i}`);
          params.push(opts.category);
          i++;
        }

        // "Aggressive" keyword search:
        // - Split into tokens
        // - Match ANY token across (name/slug/description/tags)
        // - Rank higher when more tokens match, and when they match stronger fields
        const tokenAnyClauses: string[] = [];
        const tokenPlaceholders: string[] = [];
        for (const tok of tokens) {
          const like = `%${tok}%`;
          params.push(like);
          const p = `$${i}`;
          i++;
          tokenPlaceholders.push(p);
          tokenAnyClauses.push(
            `(name ILIKE ${p} OR slug ILIKE ${p} OR description ILIKE ${p} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ${p}))`
          );
        }

        // If the user typed something that tokenizes to nothing (shouldn't happen), fall back to phrase match.
        params.push(fullLike);
        const pFull = `$${i}`;
        i++;

        const phraseClause = `(name ILIKE ${pFull} OR slug ILIKE ${pFull} OR description ILIKE ${pFull} OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ${pFull}))`;

        // Require either: phrase matches OR at least one token matches.
        // This makes multi-keyword searches behave like users expect (broad match, then rank).
        const tokenAny = tokenAnyClauses.length > 0 ? `(${tokenAnyClauses.join(' OR ')})` : 'FALSE';
        where.push(`(${phraseClause} OR ${tokenAny})`);

        // Relevance scoring (higher is better).
        // We score phrase matches heavily, and add per-token matches.
        const tokenScore =
          tokenPlaceholders.length > 0
            ? tokenPlaceholders
                .map(
                  (p) => `(
                    (CASE WHEN name ILIKE ${p} THEN 15 ELSE 0 END) +
                    (CASE WHEN slug ILIKE ${p} THEN 12 ELSE 0 END) +
                    (CASE WHEN description ILIKE ${p} THEN 6 ELSE 0 END) +
                    (CASE WHEN EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ${p}) THEN 4 ELSE 0 END)
                  )`
                )
                .join(' + ')
            : '0';
        const sql = `SELECT *,
            (
              (CASE WHEN name ILIKE ${pFull} THEN 100 ELSE 0 END) +
              (CASE WHEN slug ILIKE ${pFull} THEN 80 ELSE 0 END) +
              (CASE WHEN description ILIKE ${pFull} THEN 40 ELSE 0 END) +
              (CASE WHEN EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE ${pFull}) THEN 30 ELSE 0 END) +
              (${tokenScore})
            ) AS relevance
           FROM agent_templates
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY relevance DESC, usage_count DESC, created_at DESC`;

        const result = await connection.query<Record<string, unknown>>(sql, params);

        const templates = fromDatabaseArray(AgentTemplateEntity, result) as Array<AgentTemplateModel & Record<string, unknown>>;
        const templateIds = templates.map((t) => String(t.id)).filter((id) => typeof id === 'string' && id.trim().length > 0);
        const assignedToolSlugsByTemplateId = await this.getAssignedToolSlugsByTemplateIds(templateIds);

        return templates.map((t) =>
          this.toPublicModel({
            ...t,
            assignedToolSlugs: assignedToolSlugsByTemplateId.get(String(t.id)) ?? [],
          } as AgentTemplateModel & Record<string, unknown>)
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
