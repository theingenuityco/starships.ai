import { AgentRuntimeEntity } from '@/entities/AgentRuntimeEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { generateSlug } from '@/helpers/slugUtils';
import type { AgentRuntimeModel, CreateAgentRuntimeRequest, UpdateAgentRuntimeRequest } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

/**
 * Agent runtime registry repository.
 *
 * A runtime is a lightweight registry entry for an external agent engine that is
 * connected to a starship. Identity, access, and behaviour live on the persona.
 */
export class AgentRuntimeRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('AgentRuntimeRepository', connection);
  }

  async findAll(): Promise<AgentRuntimeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findAllEntities<Record<string, unknown>>('agent_runtimes', 'created_at DESC');
        return fromDatabaseArray(AgentRuntimeEntity, result);
      },
      'findAll',
      'AgentRuntime'
    );
  }

  async findById(id: string): Promise<AgentRuntimeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('agent_runtimes', id);
        return result ? fromDatabase(AgentRuntimeEntity, result) : null;
      },
      'findById',
      'AgentRuntime',
      id
    );
  }

  async findByStarship(starshipId: string): Promise<AgentRuntimeModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          'SELECT * FROM agent_runtimes WHERE starship_id = $1 ORDER BY created_at DESC',
          [starshipId]
        );
        return fromDatabaseArray(AgentRuntimeEntity, result);
      },
      'findByStarship',
      'AgentRuntime'
    );
  }

  async findBySlug(slug: string): Promise<AgentRuntimeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>('SELECT * FROM agent_runtimes WHERE slug = $1', [slug]);
        return result ? fromDatabase(AgentRuntimeEntity, result) : null;
      },
      'findBySlug',
      'AgentRuntime',
      slug
    );
  }

  async findBySlugAndStarship(slug: string, starshipId: string): Promise<AgentRuntimeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM agent_runtimes WHERE slug = $1 AND starship_id = $2',
          [slug, starshipId]
        );
        return result ? fromDatabase(AgentRuntimeEntity, result) : null;
      },
      'findBySlugAndStarship',
      'AgentRuntime',
      `${starshipId}:${slug}`
    );
  }

  private async slugExistsOnStarship(starshipId: string, slug: string, excludeId?: string): Promise<boolean> {
    const connection = this.getConnection();
    if (excludeId) {
      const row = await connection.queryOne<{ id: string }>(
        'SELECT id FROM agent_runtimes WHERE starship_id = $1 AND slug = $2 AND id <> $3',
        [starshipId, slug, excludeId]
      );
      return !!row?.id;
    }
    const row = await connection.queryOne<{ id: string }>('SELECT id FROM agent_runtimes WHERE starship_id = $1 AND slug = $2', [
      starshipId,
      slug,
    ]);
    return !!row?.id;
  }

  async create(data: Omit<CreateAgentRuntimeRequest, 'starshipId'>, starshipId: string, createdByUserId?: string): Promise<AgentRuntimeModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Slugs are always server-generated and unique per starship.
        const baseFromName = generateSlug((data.name || 'runtime').toString()) || 'runtime';
        const slug = await generateUniqueSlugIncremental(
          baseFromName,
          async (candidate) => await this.slugExistsOnStarship(starshipId, candidate),
          { fallbackBase: 'runtime', maxLength: 100 }
        );

        const props = {
          name: data.name,
          slug,
          kind: data.kind || 'custom',
          createdByUserId,
          starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await AgentRuntimeEntity.validate(props, 'create');

        const entity = toEntityInstance(AgentRuntimeEntity, props as unknown as Record<string, unknown>);
        const result = await this.createEntity<Record<string, unknown>>('agent_runtimes', toDatabase(entity));
        return fromDatabase(AgentRuntimeEntity, result);
      },
      'create',
      'AgentRuntime'
    );
  }

  async update(id: string, updates: UpdateAgentRuntimeRequest): Promise<AgentRuntimeModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return null;

        await AgentRuntimeEntity.validate(updates, 'update');

        const updateProps: Partial<AgentRuntimeModel> = {
          ...(updates as Partial<AgentRuntimeModel>),
          updatedAt: new Date().toISOString(),
        };

        // Auto-regenerate slug on name updates (unique per starship, excluding self).
        if (updates.name !== undefined && updates.name !== null) {
          const newBase = generateSlug(String(updates.name)) || 'runtime';
          updateProps.slug = await generateUniqueSlugIncremental(
            newBase,
            async (candidate) => await this.slugExistsOnStarship(existing.starshipId, candidate, existing.id),
            { fallbackBase: 'runtime', maxLength: 100 }
          );
        }

        const updateData = toDatabase(toEntityInstance(AgentRuntimeEntity, updateProps));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...filteredUpdateData } = updateData;
        if (Object.keys(filteredUpdateData).length === 0) {
          return await this.findById(id);
        }

        const result = await this.updateEntity<Record<string, unknown>>('agent_runtimes', id, filteredUpdateData);
        return result ? fromDatabase(AgentRuntimeEntity, result) : null;
      },
      'update',
      'AgentRuntime',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return await this.deleteEntity('agent_runtimes', id);
      },
      'delete',
      'AgentRuntime',
      id
    );
  }
}
