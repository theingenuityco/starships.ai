import { AgentEntity } from '@/entities/AgentEntity';
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
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
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
        // Normalize numeric fields to sensible, safe defaults before validation
        const normalizedData: CreateAgentRequest = { ...data };

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
            category: normalizedData.category || 'general',
            previewPrompts: normalizedData.previewPrompts,
            assignedToolSlugs: [],
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
          category: updates.category !== undefined ? updates.category : existing.category,
          previewPrompts: updates.previewPrompts !== undefined ? updates.previewPrompts : existing.previewPrompts,
          assignedToolSlugs: [],
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


}

