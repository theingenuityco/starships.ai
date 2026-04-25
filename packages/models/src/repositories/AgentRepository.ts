import { AgentEntity } from '@/entities/AgentEntity';
import { ToolEntity } from '@/entities/ToolEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { generateSlug } from '@/helpers/slugUtils';
import {
  DEFAULT_AGENT_MAX_TOKENS,
  DEFAULT_AGENT_TIMEOUT_MS,
  MAX_AGENT_MAX_TOKENS,
  MAX_AGENT_TIMEOUT_MS,
  MIN_AGENT_MAX_TOKENS,
  MIN_AGENT_TIMEOUT_MS,
} from '@/constants/agentDefaults';
import { ValidationError } from '@starships/errors';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest, ToolModel } from '@starships/protocol';
import { computeAgentContentHash } from '@/utils/contentHash';
import type { PostgresConnection } from '@/helpers/database';

export class AgentRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentRepository', connection);
  }

  async findAll(): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agents', 'created_at DESC');
        return fromDatabaseArray(AgentEntity, result);
      },
      'findAll',
      'Agent'
    );
  }

  async findById(id: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('agents', id);
        if (!result) return null;

        const agent = fromDatabase(AgentEntity, result);

        return agent;
      },
      'findById',
      'Agent',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM agents WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        const agents = fromDatabaseArray(AgentEntity, result);

        return agents;
      },
      'findByStarship',
      'Agent'
    );
  }

  async findBySlug(slug: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agents WHERE slug = $1', [slug]);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'findBySlug',
      'Agent',
      slug
    );
  }

  async findBySlugAndStarship(slug: string, starshipId: string): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agents WHERE slug = $1 AND starship_id = $2', [
          slug,
          starshipId,
        ]);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'findBySlugAndStarship',
      'Agent',
      `${starshipId}:${slug}`
    );
  }

  private async agentSlugExistsOnStarship(starshipId: string, slug: string, excludeId?: string): Promise<boolean> {
    const connection = this.getConnection();
    if (excludeId) {
      const row = await connection.queryOne<{ id: string }>('SELECT id FROM agents WHERE starship_id = $1 AND slug = $2 AND id <> $3', [
        starshipId,
        slug,
        excludeId,
      ]);
      return !!row?.id;
    }
    const row = await connection.queryOne<{ id: string }>('SELECT id FROM agents WHERE starship_id = $1 AND slug = $2', [starshipId, slug]);
    return !!row?.id;
  }

  async updateStarship(agentId: string, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Validate starshipId exists
        const starshipCheck = await connection.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM starships WHERE id = $1', [
          starshipId,
        ]);

        if (!starshipCheck || starshipCheck.count === '0') {
          this.handleNotFound('Starship', starshipId);
        }

        // Update agent's starship_id and deployed_at
        const result = await connection.query<Record<string, unknown>>(
          `UPDATE agents
           SET starship_id = $1, deployed_at = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [starshipId, new Date().toISOString(), agentId]
        );

        if (!result || result.length === 0) {
          this.handleNotFound('Agent', agentId);
        }

        return fromDatabase(AgentEntity, result[0]);
      },
      'updateStarship',
      'Agent',
      agentId
    );
  }

  async create(data: CreateAgentRequest, starshipId: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        // Extract assignedToolSlugs for relationship creation
        const toolSlugsForRelationships = data.assignedToolSlugs || [];

        // Remove assignedToolSlugs from data before validation since AgentEntity doesn't have this field
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { assignedToolSlugs: _, ...dataWithoutToolSlugs } = data;

        // Normalize numeric fields to sensible, safe defaults before validation
        const normalizedData: CreateAgentRequest = { ...dataWithoutToolSlugs };

        const hasValidNumber = (value: unknown): value is number =>
          typeof value === 'number' && !Number.isNaN(value) && Number.isFinite(value);

        // Temperature: clamped by zod/class-validator; defaulting handled at higher layers.

        // maxTokens: clamp to configured bounds, default to shared default if missing/invalid
        if (hasValidNumber(normalizedData.maxTokens)) {
          normalizedData.maxTokens = Math.min(MAX_AGENT_MAX_TOKENS, Math.max(MIN_AGENT_MAX_TOKENS, normalizedData.maxTokens));
        } else {
          normalizedData.maxTokens = DEFAULT_AGENT_MAX_TOKENS;
        }

        // timeout (ms): clamp to configured bounds, default to shared default if missing/invalid
        if (hasValidNumber(normalizedData.timeout)) {
          normalizedData.timeout = Math.min(MAX_AGENT_TIMEOUT_MS, Math.max(MIN_AGENT_TIMEOUT_MS, normalizedData.timeout));
        } else {
          normalizedData.timeout = DEFAULT_AGENT_TIMEOUT_MS;
        }

        const now = new Date().toISOString();

        // Slugs are always generated by the server.
        // Instance slugs use incremental suffixes and are unique PER starship.
        const baseFromName = generateSlug((normalizedData.name || 'agent').toString()) || 'agent';
        const slug = await generateUniqueSlugIncremental(
          baseFromName,
          async (candidate) => await this.agentSlugExistsOnStarship(starshipId, candidate),
          { fallbackBase: 'agent', maxLength: 100 }
        );

        // Validate using normalized data and include starshipId + generated slug which are required on create
        await AgentEntity.validate({ ...normalizedData, starshipId, slug }, 'create');

        // Create agent properties for PostgreSQL
        const agentProps = {
          // Core AgentParams fields
          name: normalizedData.name,
          role: normalizedData.role || 'Assistant',
          slug,
          description: normalizedData.description,
          model: normalizedData.model,
          // Optional categorization (aligns with templates)
          category: normalizedData.category || 'general',
          temperature: normalizedData.temperature,
          maxTokens: normalizedData.maxTokens,
          reasoning: (normalizedData as unknown as { reasoning?: unknown }).reasoning,
          timeout: normalizedData.timeout,
          systemPrompt: normalizedData.systemPrompt,
          state: normalizedData.state,
          blueprint: normalizedData.blueprint,
          previewPrompts: normalizedData.previewPrompts,
          contentHash: computeAgentContentHash({
            name: normalizedData.name,
            role: normalizedData.role || 'Assistant',
            description: normalizedData.description,
            model: normalizedData.model,
            temperature: normalizedData.temperature,
            maxTokens: normalizedData.maxTokens,
            timeout: normalizedData.timeout,
            reasoning: (normalizedData as unknown as { reasoning?: unknown }).reasoning,
            systemPrompt: normalizedData.systemPrompt,
            state: normalizedData.state,
            blueprint: normalizedData.blueprint,
            category: normalizedData.category || 'general',
            previewPrompts: normalizedData.previewPrompts,
            assignedToolSlugs: toolSlugsForRelationships,
          }),

          // Versioning fields
          version: data.version || '1.0.0',

          // PostgreSQL specific fields
          starshipId: starshipId, // Direct foreign key
          deployedAt: now, // Agent is deployed immediately upon creation
          createdAt: now,
          updatedAt: now,
        };

        // Create entity instance from plain object, then serialize
        const agentEntity = toEntityInstance(AgentEntity, agentProps as unknown as Record<string, unknown>);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        const agent = fromDatabase(AgentEntity, result);

        // Create tool relationships if assignedToolSlugs provided
        if (toolSlugsForRelationships.length > 0) {
          await this.assignToolsToAgent(agent.id, toolSlugsForRelationships, starshipId);
        }

        return agent;
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) {
          return null;
        }

        // Ensure numeric fields are properly typed (convert strings to numbers if needed)
        // Only convert values that are not null/undefined to avoid NaN or 0 from null
        const typedUpdates: UpdateAgentRequest = { ...updates };

        if (updates.temperature !== undefined && updates.temperature !== null) {
          typedUpdates.temperature = Number(updates.temperature);
        }
        if (updates.maxTokens !== undefined && updates.maxTokens !== null) {
          typedUpdates.maxTokens = Number(updates.maxTokens);
        }
        if (updates.timeout !== undefined && updates.timeout !== null) {
          typedUpdates.timeout = Number(updates.timeout);
        }

        // Use lean validation from AgentEntity for updates
        await AgentEntity.validate(typedUpdates, 'update');

        const updateProps: Partial<AgentModel> = {
          ...(typedUpdates as Partial<AgentModel>),
          updatedAt: new Date().toISOString(),
        };

        // Auto-regenerate slug on name updates
        if (typedUpdates.name !== undefined && typedUpdates.name !== null) {
          const newBase = generateSlug(String(typedUpdates.name)) || 'agent';
          updateProps.slug = await generateUniqueSlugIncremental(
            newBase,
            async (candidate) => await this.agentSlugExistsOnStarship(existing.starshipId, candidate, existing.id),
            { fallbackBase: 'agent', maxLength: 100 }
          );
        }

        // Convert entity updates to database format
        // Keep contentHash in sync for import/export conflict detection.
        // Since tool assignments live in a junction table, we include the current assigned tool slugs.
        let assignedToolSlugs: string[] = [];
        try {
          const rows = await this.getAssignedToolSlugsForAgents([id]);
          assignedToolSlugs = rows.filter((r) => r.agentId === id).map((r) => r.toolSlug);
        } catch {
          assignedToolSlugs = [];
        }

        const updatePropsWithHash: Partial<AgentModel> & { contentHash?: string } = updateProps;
        updatePropsWithHash.contentHash = computeAgentContentHash({
          name: updates.name !== undefined ? updates.name : existing.name,
          role: updates.role !== undefined ? updates.role : existing.role,
          description: updates.description !== undefined ? updates.description : existing.description,
          model: updates.model !== undefined ? updates.model : existing.model,
          temperature: updates.temperature !== undefined ? updates.temperature : existing.temperature,
          maxTokens: updates.maxTokens !== undefined ? updates.maxTokens : existing.maxTokens,
          timeout: updates.timeout !== undefined ? updates.timeout : existing.timeout,
          reasoning: updates.reasoning !== undefined ? updates.reasoning : existing.reasoning,
          systemPrompt: updates.systemPrompt !== undefined ? updates.systemPrompt : existing.systemPrompt,
          state: updates.state !== undefined ? updates.state : existing.state,
          blueprint: updates.blueprint !== undefined ? updates.blueprint : existing.blueprint,
          category: updates.category !== undefined ? updates.category : existing.category,
          previewPrompts: updates.previewPrompts !== undefined ? updates.previewPrompts : existing.previewPrompts,
          assignedToolSlugs,
        });

        const updateData = toDatabase(toEntityInstance(AgentEntity, updateProps));

        // Filter out protected fields (id, createdAt)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;

        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agents', id, filteredUpdateData);
        return result ? fromDatabase(AgentEntity, result) : null;
      },
      'update',
      'Agent',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        // PostgreSQL CASCADE rules will handle relationships automatically
        return await this.deleteEntity('agents', id);
      },
      'delete',
      'Agent',
      id
    );
  }

  async searchAgents(query: string): Promise<AgentModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Use PostgreSQL full-text search
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM agents
           WHERE to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')) @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(system_prompt, '')), plainto_tsquery('english', $1)) DESC
           LIMIT 20`,
          [query]
        );
        return fromDatabaseArray(AgentEntity, result);
      },
      'searchAgents',
      'Agent'
    );
  }

  async getAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Get tools related to agent through junction table, filtered by starship
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1 AND t.starship_id = $2
           ORDER BY t.created_at DESC`,
          [agentId, starshipId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'getAgentTools',
      'Agent',
      agentId
    );
  }

  /**
   * Bulk-load assigned tool slugs for many agents in one query.
   * Used by admin listings to avoid N+1 lookups.
   */
  async getAssignedToolSlugsForAgents(agentIds: string[]): Promise<Array<{ agentId: string; toolSlug: string }>> {
    return this.executeWithErrorHandling(
      async () => {
        const ids = (agentIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0);
        if (ids.length === 0) return [];

        const connection = this.getConnection();
        const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(', ');
        const rows = await connection.query<{ agent_id: string; tool_slug: string }>(
          `
          SELECT
            at.agent_id as agent_id,
            t.slug as tool_slug
          FROM agent_tools at
          INNER JOIN agents a ON a.id = at.agent_id
          INNER JOIN tools t ON t.id = at.tool_id
          WHERE at.agent_id IN (${placeholders})
            AND t.starship_id = a.starship_id
          ORDER BY at.agent_id, t.created_at DESC
          `,
          ids
        );

        return (rows || []).map((r) => ({ agentId: r.agent_id, toolSlug: r.tool_slug }));
      },
      'getAssignedToolSlugsForAgents',
      'Agent'
    );
  }

  /**
   * Get the stored permission for a given agent↔tool (by tool slug within a starship).
   * Returns null when the tool is not assigned to the agent.
   */
  async getAgentToolPermissionBySlug(agentId: string, starshipId: string, toolSlug: string): Promise<'allow' | 'ask' | 'deny' | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ permission: 'allow' | 'ask' | 'deny' }>(
          `
          SELECT at.permission as permission
          FROM agent_tools at
          INNER JOIN tools t ON t.id = at.tool_id
          WHERE at.agent_id = $1 AND t.starship_id = $2 AND t.slug = $3
          LIMIT 1
          `,
          [agentId, starshipId, toolSlug]
        );
        return row?.permission ?? null;
      },
      'getAgentToolPermissionBySlug',
      'Agent',
      agentId
    );
  }

  /**
   * Resolve the effective permission for an agent/tool slug within a starship.
   *
   * Precedence:
   * - agent_tools.permission (agent override) if an agent_tools row exists
   * - else starship_tools.permission (starship default) if a starship_tools row exists
   * - else null (no access)
   */
  async getEffectiveToolPermissionBySlug(
    agentId: string,
    starshipId: string,
    toolSlug: string
  ): Promise<'allow' | 'ask' | 'deny' | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ permission: 'allow' | 'ask' | 'deny' | null }>(
          `
          SELECT COALESCE(at.permission, st.permission) as permission
          FROM tools t
          LEFT JOIN agent_tools at
            ON at.tool_id = t.id AND at.agent_id = $1
          LEFT JOIN starship_tools st
            ON st.tool_id = t.id AND st.starship_id = $2
          WHERE t.starship_id = $2 AND t.slug = $3
          LIMIT 1
          `,
          [agentId, starshipId, toolSlug]
        );
        const p = row?.permission ?? null;
        return p === 'allow' || p === 'ask' || p === 'deny' ? p : null;
      },
      'getEffectiveToolPermissionBySlug',
      'Agent',
      agentId
    );
  }

  /**
   * Resolve the effective permission for an agent/tool slug within a room conversation.
   *
   * Precedence:
   * - agent_tools.permission (agent override) if an agent_tools row exists
   * - else room_tools.permission (room override) if a room_tools row exists for this room conversation
   * - else starship_tools.permission (starship default) if a starship_tools row exists
   * - else null (no access)
   */
  async getEffectiveToolPermissionBySlugInRoom(
    agentId: string,
    starshipId: string,
    toolSlug: string,
    roomConversationId: string
  ): Promise<'allow' | 'ask' | 'deny' | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ permission: 'allow' | 'ask' | 'deny' | null }>(
          `
          SELECT COALESCE(at.permission, rt.permission, st.permission) as permission
          FROM tools t
          LEFT JOIN agent_tools at
            ON at.tool_id = t.id AND at.agent_id = $1
          LEFT JOIN room_tools rt
            ON rt.tool_id = t.id AND rt.room_conversation_id = $4
          LEFT JOIN starship_tools st
            ON st.tool_id = t.id AND st.starship_id = $2
          WHERE t.starship_id = $2 AND t.slug = $3
          LIMIT 1
          `,
          [agentId, starshipId, toolSlug, roomConversationId]
        );
        const p = row?.permission ?? null;
        return p === 'allow' || p === 'ask' || p === 'deny' ? p : null;
      },
      'getEffectiveToolPermissionBySlugInRoom',
      'Agent',
      agentId
    );
  }

  /**
   * Get the effective tool set for an agent at runtime.
   *
   * A tool is included if:
   * - it is explicitly assigned to the agent (agent_tools row exists), OR
   * - it is enabled at the starship level (starship_tools row exists),
   * AND the effective permission is not 'deny'.
   *
   * Precedence: agent_tools.permission overrides starship_tools.permission.
   */
  async getEffectiveAgentTools(agentId: string, starshipId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT t.*
          FROM tools t
          LEFT JOIN agent_tools at
            ON at.tool_id = t.id AND at.agent_id = $1
          LEFT JOIN starship_tools st
            ON st.tool_id = t.id AND st.starship_id = $2
          WHERE t.starship_id = $2
            AND COALESCE(at.permission, st.permission) IS NOT NULL
            AND COALESCE(at.permission, st.permission) <> 'deny'
          ORDER BY t.created_at DESC
          `,
          [agentId, starshipId]
        );
        return fromDatabaseArray(ToolEntity, rows);
      },
      'getEffectiveAgentTools',
      'Agent',
      agentId
    );
  }

  /**
   * Get the effective tool set for an agent at runtime inside a room (or room thread).
   *
   * A tool is included if:
   * - it is explicitly assigned to the agent (agent_tools row exists), OR
   * - it is pinned/assigned to the room (room_tools row exists for the room conversation), OR
   * - it is enabled at the starship level (starship_tools row exists),
   * AND the effective permission is not 'deny'.
   *
   * Precedence: agent_tools.permission overrides room_tools.permission overrides starship_tools.permission.
   */
  async getEffectiveAgentToolsForRoomConversation(agentId: string, starshipId: string, roomConversationId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT DISTINCT t.*
          FROM tools t
          LEFT JOIN agent_tools at
            ON at.tool_id = t.id AND at.agent_id = $1
          LEFT JOIN room_tools rt
            ON rt.tool_id = t.id AND rt.room_conversation_id = $3
          LEFT JOIN starship_tools st
            ON st.tool_id = t.id AND st.starship_id = $2
          WHERE t.starship_id = $2
            AND COALESCE(at.permission, rt.permission, st.permission) IS NOT NULL
            AND COALESCE(at.permission, rt.permission, st.permission) <> 'deny'
          ORDER BY t.created_at DESC
          `,
          [agentId, starshipId, roomConversationId]
        );
        return fromDatabaseArray(ToolEntity, rows);
      },
      'getEffectiveAgentToolsForRoomConversation',
      'Agent',
      agentId
    );
  }

  /**
   * Get starship-level tool permission rows for a starship.
   * Returns only rows present in starship_tools.
   */
  async getStarshipToolPermissions(
    starshipId: string
  ): Promise<Array<{ starshipId: string; toolId: string; toolSlug: string; permission: 'allow' | 'ask' | 'deny' }>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{ tool_id: string; tool_slug: string; permission: 'allow' | 'ask' | 'deny' }>(
          `
          SELECT
            st.tool_id as tool_id,
            t.slug as tool_slug,
            st.permission as permission
          FROM starship_tools st
          INNER JOIN tools t ON t.id = st.tool_id
          WHERE st.starship_id = $1 AND t.starship_id = $1
          ORDER BY t.created_at DESC
          `,
          [starshipId]
        );
        return (rows || []).map((r) => ({
          starshipId,
          toolId: r.tool_id,
          toolSlug: r.tool_slug,
          permission: r.permission,
        }));
      },
      'getStarshipToolPermissions',
      'Agent'
    );
  }

  /**
   * Upsert a starship-level tool permission by tool instance slug.
   */
  async setStarshipToolPermissionsBySlugs(args: {
    starshipId: string;
    toolSlugs: string[];
    permission: 'allow' | 'ask' | 'deny';
  }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const { starshipId, toolSlugs, permission } = args;
        const slugs = toolSlugs.filter((s) => s.trim().length > 0);
        if (!starshipId?.trim() || slugs.length === 0) return;

        const connection = this.getConnection();
        const placeholders = slugs.map((_, i) => `$${i + 2}`).join(', ');
        const tools = await connection.query<{ id: string }>(
          `SELECT id FROM tools WHERE starship_id = $1 AND slug IN (${placeholders})`,
          [starshipId, ...slugs]
        );
        if (tools.length === 0) return;

        const valueRows = tools.map((_, i) => `($1, $${i + 2}, '${permission}', NOW(), NOW())`).join(', ');
        await connection.query(
          `INSERT INTO starship_tools (starship_id, tool_id, permission, created_at, updated_at)
           VALUES ${valueRows}
           ON CONFLICT (starship_id, tool_id)
           DO UPDATE SET permission = EXCLUDED.permission, updated_at = NOW()`,
          [starshipId, ...tools.map((t) => t.id)]
        );
      },
      'setStarshipToolPermissionsBySlugs',
      'Agent'
    );
  }

  async setStarshipToolPermissionBySlug(args: {
    starshipId: string;
    toolSlug: string;
    permission: 'allow' | 'ask' | 'deny';
  }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const { starshipId, toolSlug, permission } = args;
        if (!starshipId?.trim() || !toolSlug?.trim()) {
          throw new Error('starshipId and toolSlug are required');
        }

        const connection = this.getConnection();
        // Look up by tool instance slug on starship (tools.slug)
        const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
          toolSlug,
          starshipId,
        ]);
        if (!toolResult?.id) {
          throw new Error(`Tool not found: ${toolSlug} on starship ${starshipId}`);
        }

        await connection.query(
          `
          INSERT INTO starship_tools (starship_id, tool_id, permission, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
          ON CONFLICT (starship_id, tool_id)
          DO UPDATE SET permission = EXCLUDED.permission, updated_at = NOW()
          `,
          [starshipId, toolResult.id, permission]
        );
      },
      'setStarshipToolPermissionBySlug',
      'Agent'
    );
  }

  /**
   * Remove a starship-level tool permission mapping by tool instance slug.
   */
  async removeStarshipToolPermissionBySlug(args: { starshipId: string; toolSlug: string }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const { starshipId, toolSlug } = args;
        if (!starshipId?.trim() || !toolSlug?.trim()) {
          throw new Error('starshipId and toolSlug are required');
        }

        const connection = this.getConnection();
        // Resolve tool ID by instance slug
        const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
          toolSlug,
          starshipId,
        ]);
        if (!toolResult?.id) {
          // Idempotent: nothing to delete
          return;
        }

        await connection.query('DELETE FROM starship_tools WHERE starship_id = $1 AND tool_id = $2', [starshipId, toolResult.id]);
      },
      'removeStarshipToolPermissionBySlug',
      'Agent'
    );
  }

  /**
   * Get agent→tool permissions (join metadata) for a specific starship.
   * Returns only rows present in agent_tools; callers can treat missing pairs as 'deny'.
   */
  async getStarshipAgentToolPermissions(
    starshipId: string
  ): Promise<Array<{ agentId: string; toolId: string; toolSlug: string; permission: 'allow' | 'ask' | 'deny' }>> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{ agent_id: string; tool_id: string; tool_slug: string; permission: 'allow' | 'ask' | 'deny' }>(
          `
          SELECT
            at.agent_id as agent_id,
            t.id as tool_id,
            t.slug as tool_slug,
            at.permission as permission
          FROM agent_tools at
          INNER JOIN agents a ON a.id = at.agent_id
          INNER JOIN tools t ON t.id = at.tool_id
          WHERE a.starship_id = $1 AND t.starship_id = $1
          ORDER BY a.created_at DESC, t.created_at DESC
          `,
          [starshipId]
        );

        return (rows || []).map((r) => ({
          agentId: r.agent_id,
          toolId: r.tool_id,
          toolSlug: r.tool_slug,
          permission: r.permission,
        }));
      },
      'getStarshipAgentToolPermissions',
      'Agent'
    );
  }

  /**
   * Upsert a permission for an agent/tool pair by tool slug within a starship.
   * This is intentionally starship-scoped to prevent cross-starship tool slugs.
   */
  async setAgentToolPermissionBySlug(args: {
    agentId: string;
    starshipId: string;
    toolSlug: string;
    permission: 'allow' | 'ask' | 'deny';
  }): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const { agentId, starshipId, toolSlug, permission } = args;
        if (!agentId?.trim() || !starshipId?.trim() || !toolSlug?.trim()) {
          throw new Error('agentId, starshipId, and toolSlug are required');
        }

        const connection = this.getConnection();
        // Look up by tool instance slug on starship (tools.slug)
        const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
          toolSlug,
          starshipId,
        ]);
        if (!toolResult?.id) {
          throw new Error(`Tool not found: ${toolSlug} on starship ${starshipId}`);
        }

        // Important semantic: permissions do NOT implicitly assign tools.
        // Only update an existing relationship row. (Assignment is handled by the /agents/:id/tools endpoints.)
        const res = await connection.queryWithResult(
          `
          UPDATE agent_tools
          SET permission = $3
          WHERE agent_id = $1 AND tool_id = $2
          `,
          [agentId, toolResult.id, permission]
        );

        if (!res.rowCount) {
          throw new ValidationError('Tool is not assigned to agent', 'toolSlug', { agentId, toolSlug });
        }
      },
      'setAgentToolPermissionBySlug',
      'Agent',
      args.agentId
    );
  }

  /**
   * Update the effective permission for an agent/tool slug within a starship WITHOUT creating assignment rows.
   *
   * Precedence:
   * - If an agent_tools row exists → update agent_tools.permission (agent override)
   * - Else if a starship_tools row exists → update starship_tools.permission (starship default)
   * - Else throw (tool not available in this scope)
   */
  async setEffectiveToolPermissionBySlug(args: {
    agentId: string;
    starshipId: string;
    toolSlug: string;
    permission: 'allow' | 'ask' | 'deny';
  }): Promise<{ scope: 'agent' | 'starship' }> {
    return this.executeWithErrorHandling(
      async () => {
        const { agentId, starshipId, toolSlug, permission } = args;
        if (!agentId?.trim() || !starshipId?.trim() || !toolSlug?.trim()) {
          throw new Error('agentId, starshipId, and toolSlug are required');
        }

        const connection = this.getConnection();
        // Resolve tool id by instance slug
        const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
          toolSlug,
          starshipId,
        ]);
        if (!toolResult?.id) {
          throw new Error(`Tool not found: ${toolSlug} on starship ${starshipId}`);
        }

        // 1) Agent override (update-only)
        const agentRes = await connection.queryWithResult(
          `
          UPDATE agent_tools
          SET permission = $3
          WHERE agent_id = $1 AND tool_id = $2
          `,
          [agentId, toolResult.id, permission]
        );
        if (agentRes.rowCount && agentRes.rowCount > 0) {
          return { scope: 'agent' as const };
        }

        // 2) Starship default (update-only; do NOT create starship_tools rows here)
        const shipRes = await connection.queryWithResult(
          `
          UPDATE starship_tools
          SET permission = $3, updated_at = NOW()
          WHERE starship_id = $1 AND tool_id = $2
          `,
          [starshipId, toolResult.id, permission]
        );
        if (shipRes.rowCount && shipRes.rowCount > 0) {
          return { scope: 'starship' as const };
        }

        throw new ValidationError('Tool is not available to agent', 'toolSlug', { agentId, toolSlug });
      },
      'setEffectiveToolPermissionBySlug',
      'Agent',
      args.agentId
    );
  }

  // ============================================================================
  // AGENT→TOOL DIRECT RELATIONSHIPS
  // ============================================================================

  /**
   * Create a relationship between Agent and Tool using junction table
   */
  async addToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();

        // Check if both entities exist
        const agentExists = await connection.queryOne('SELECT id FROM agents WHERE id = $1', [agentId]);
        const toolExists = await connection.queryOne('SELECT id FROM tools WHERE id = $1', [toolId]);

        if (!agentExists || !toolExists) {
          throw new Error('Agent or Tool not found');
        }

        // Insert into junction table (ON CONFLICT DO NOTHING to avoid duplicates)
        await connection.query(
          `INSERT INTO agent_tools (agent_id, tool_id, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (agent_id, tool_id) DO NOTHING`,
          [agentId, toolId]
        );
      },
      'addToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Remove a relationship between Agent and Tool from junction table
   */
  async removeToolRelationship(agentId: string, toolId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim() || !toolId?.trim()) {
          throw new Error('Both agentId and toolId are required');
        }

        const connection = this.getConnection();
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1 AND tool_id = $2', [agentId, toolId]);
      },
      'removeToolRelationship',
      'Agent',
      agentId
    );
  }

  /**
   * Set permissions for all tools currently assigned to an agent (existing join rows only).
   * Useful for bootstrapping default agents created during starship creation.
   */
  async setAllAssignedToolPermissionsForAgent(agentId: string, permission: 'allow' | 'ask' | 'deny'): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }
        const connection = this.getConnection();
        const res = await connection.queryWithResult(`UPDATE agent_tools SET permission = $2 WHERE agent_id = $1`, [agentId, permission]);
        return res.rowCount ?? 0;
      },
      'setAllAssignedToolPermissionsForAgent',
      'Agent',
      agentId
    );
  }

  /**
   * Get all Tools that an Agent uses via junction table relationships
   */
  async getAgentToolsByRelationships(agentId: string): Promise<ToolModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        if (!agentId?.trim()) {
          throw new Error('agentId is required');
        }

        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `SELECT t.* FROM tools t
           INNER JOIN agent_tools at ON t.id = at.tool_id
           WHERE at.agent_id = $1
           ORDER BY t.name`,
          [agentId]
        );
        return fromDatabaseArray(ToolEntity, result);
      },
      'getAgentToolsByRelationships',
      'Agent',
      agentId
    );
  }

  /**
   * Assign tools to an agent by their slugs and starship - creates junction table relationships
   */
  async assignToolsToAgent(agentId: string, toolSlugs: string[], starshipId: string): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();

        // Remove existing tool relationships for this agent
        await connection.query('DELETE FROM agent_tools WHERE agent_id = $1', [agentId]);

        // Create new relationships for each tool slug
        for (const toolSlug of toolSlugs) {
          // Find the tool by slug and starship
          const toolResult = await connection.queryOne<{ id: string }>('SELECT id FROM tools WHERE slug = $1 AND starship_id = $2', [
            toolSlug,
            starshipId,
          ]);

          if (toolResult) {
            // Create relationship via junction table
            await this.addToolRelationship(agentId, toolResult.id);
          }
        }

        // Update agent contentHash to reflect assigned tools.
        try {
          const agent = await this.findById(agentId);
          if (agent) {
            const nextHash = computeAgentContentHash({
              name: agent.name,
              role: agent.role,
              description: agent.description,
              model: agent.model,
              temperature: agent.temperature,
              maxTokens: agent.maxTokens,
              timeout: agent.timeout,
              reasoning: agent.reasoning,
              systemPrompt: agent.systemPrompt,
              state: agent.state,
              blueprint: agent.blueprint,
              category: agent.category,
              previewPrompts: agent.previewPrompts,
              assignedToolSlugs: toolSlugs,
            });
            await connection.query('UPDATE agents SET content_hash = $2, updated_at = NOW() WHERE id = $1', [agentId, nextHash]);
          }
        } catch {
          // Best-effort: don't fail assignments due to hash update.
        }
      },
      'assignToolsToAgent',
      'Agent',
      agentId
    );
  }

}

