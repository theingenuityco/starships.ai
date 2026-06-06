import { AgentPersonaEntity } from '@/entities/AgentPersonaEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { generateSlug } from '@/helpers/slugUtils';
import type { AgentPersonaModel, CreateAgentPersonaRequest, UpdateAgentPersonaRequest } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

/**
 * Agent persona repository.
 *
 * A persona is the user-authored actor (identity + access + behaviour) that runs
 * on an agent runtime. Its `runtimeId` is the current, reassignable assignment.
 */
export class AgentPersonaRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentPersonaRepository', connection);
  }

  async findById(id: string): Promise<AgentPersonaModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('agent_personas', id);
        return result ? fromDatabase(AgentPersonaEntity, result) : null;
      },
      'findById',
      'AgentPersona',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<AgentPersonaModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().query<Record<string, unknown>>(
          'SELECT * FROM agent_personas WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(AgentPersonaEntity, result);
      },
      'findByStarship',
      'AgentPersona'
    );
  }

  async countByStarship(starshipId: string): Promise<number> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM agent_personas WHERE starship_id = $1',
          [starshipId]
        );
        return result ? parseInt(result.count, 10) : 0;
      },
      'countByStarship',
      'AgentPersona'
    );
  }

  async findBySlugAndStarship(slug: string, starshipId: string): Promise<AgentPersonaModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().queryOne<Record<string, unknown>>(
          'SELECT * FROM agent_personas WHERE slug = $1 AND starship_id = $2',
          [slug, starshipId]
        );
        return result ? fromDatabase(AgentPersonaEntity, result) : null;
      },
      'findBySlugAndStarship',
      'AgentPersona',
      `${starshipId}:${slug}`
    );
  }

  /** Personas currently assigned to a runtime (the engine's hosted actors). */
  async listByRuntime(runtimeId: string): Promise<AgentPersonaModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().query<Record<string, unknown>>(
          'SELECT * FROM agent_personas WHERE runtime_id = $1 ORDER BY created_at DESC',
          [runtimeId]
        );
        return fromDatabaseArray(AgentPersonaEntity, result);
      },
      'listByRuntime',
      'AgentPersona'
    );
  }

  private async slugExistsOnStarship(starshipId: string, slug: string, excludeId?: string): Promise<boolean> {
    const connection = this.getConnection();
    if (excludeId) {
      const row = await connection.queryOne<{ id: string }>(
        'SELECT id FROM agent_personas WHERE starship_id = $1 AND slug = $2 AND id <> $3',
        [starshipId, slug, excludeId]
      );
      return !!row?.id;
    }
    const row = await connection.queryOne<{ id: string }>('SELECT id FROM agent_personas WHERE starship_id = $1 AND slug = $2', [
      starshipId,
      slug,
    ]);
    return !!row?.id;
  }

  async create(data: Omit<CreateAgentPersonaRequest, 'starshipId'>, starshipId: string, createdByUserId?: string): Promise<AgentPersonaModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        const baseFromName = generateSlug((data.name || 'persona').toString()) || 'persona';
        const slug = await generateUniqueSlugIncremental(
          baseFromName,
          async (candidate) => await this.slugExistsOnStarship(starshipId, candidate),
          { fallbackBase: 'persona', maxLength: 100 }
        );

        const props = {
          name: data.name,
          slug,
          description: data.description ?? null,
          avatarUrl: data.avatarUrl ?? null,
          accessRole: data.accessRole || 'contributor',
          systemPrompt: data.systemPrompt ?? null,
          model: data.model ?? null,
          instructions: data.instructions ?? null,
          temperature: data.temperature ?? null,
          runtimeId: data.runtimeId ?? null,
          createdByUserId: createdByUserId ?? null,
          starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await AgentPersonaEntity.validate(props, 'create');

        const entity = toEntityInstance(AgentPersonaEntity, props as unknown as Record<string, unknown>);
        const result = await this.createEntity<Record<string, unknown>>('agent_personas', toDatabase(entity));
        return fromDatabase(AgentPersonaEntity, result);
      },
      'create',
      'AgentPersona'
    );
  }

  async update(id: string, updates: UpdateAgentPersonaRequest): Promise<AgentPersonaModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return null;

        await AgentPersonaEntity.validate(updates, 'update');

        const updateProps: Partial<AgentPersonaModel> = {
          ...(updates as Partial<AgentPersonaModel>),
          updatedAt: new Date().toISOString(),
        };

        if (updates.name !== undefined && updates.name !== null) {
          const newBase = generateSlug(String(updates.name)) || 'persona';
          updateProps.slug = await generateUniqueSlugIncremental(
            newBase,
            async (candidate) => await this.slugExistsOnStarship(existing.starshipId, candidate, existing.id),
            { fallbackBase: 'persona', maxLength: 100 }
          );
        }

        const updateData = toDatabase(toEntityInstance(AgentPersonaEntity, updateProps));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;
        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agent_personas', id, filteredUpdateData);
        return result ? fromDatabase(AgentPersonaEntity, result) : null;
      },
      'update',
      'AgentPersona',
      id
    );
  }

  /** Reassign (or unassign with null) the persona's current runtime. */
  async assignRuntime(id: string, runtimeId: string | null): Promise<AgentPersonaModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().queryOne<Record<string, unknown>>(
          'UPDATE agent_personas SET runtime_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
          [id, runtimeId]
        );
        return result ? fromDatabase(AgentPersonaEntity, result) : null;
      },
      'assignRuntime',
      'AgentPersona',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('agent_personas', id);
      },
      'delete',
      'AgentPersona',
      id
    );
  }

  async search(starshipId: string, query: string): Promise<AgentPersonaModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await this.getConnection().query<Record<string, unknown>>(
          `SELECT * FROM agent_personas
           WHERE starship_id = $1
             AND to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $2)
           ORDER BY ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '')), plainto_tsquery('english', $2)) DESC
           LIMIT 20`,
          [starshipId, query]
        );
        return fromDatabaseArray(AgentPersonaEntity, result);
      },
      'search',
      'AgentPersona'
    );
  }
}
