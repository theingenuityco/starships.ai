import { AgentEntity } from '@/entities/AgentEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import { generateSlug } from '@/helpers/slugUtils';
import type { AgentModel, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import type { PostgresConnection } from '@/helpers/database';

/**
 * Agent registry repository.
 *
 * An agent is a lightweight registry entry for an external agent runtime that
 * is a member of a starship. No execution config lives here.
 */
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
        return result ? fromDatabase(AgentEntity, result) : null;
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
        return fromDatabaseArray(AgentEntity, result);
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

  async create(data: Omit<CreateAgentRequest, 'starshipId'>, starshipId: string, createdByUserId?: string): Promise<AgentModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();

        // Slugs are always server-generated and unique per starship.
        const baseFromName = generateSlug((data.name || 'agent').toString()) || 'agent';
        const slug = await generateUniqueSlugIncremental(
          baseFromName,
          async (candidate) => await this.agentSlugExistsOnStarship(starshipId, candidate),
          { fallbackBase: 'agent', maxLength: 100 }
        );

        const props = {
          name: data.name,
          slug,
          kind: data.kind || 'custom',
          accessRole: data.accessRole || 'contributor',
          description: data.description,
          createdByUserId,
          starshipId,
          createdAt: now,
          updatedAt: now,
        };

        await AgentEntity.validate(props, 'create');

        const agentEntity = toEntityInstance(AgentEntity, props as unknown as Record<string, unknown>);
        const result = await this.createEntity<Record<string, unknown>>('agents', toDatabase(agentEntity));
        return fromDatabase(AgentEntity, result);
      },
      'create',
      'Agent'
    );
  }

  async update(id: string, updates: UpdateAgentRequest): Promise<AgentModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return null;

        await AgentEntity.validate(updates, 'update');

        const updateProps: Partial<AgentModel> = {
          ...(updates as Partial<AgentModel>),
          updatedAt: new Date().toISOString(),
        };

        // Auto-regenerate slug on name updates (unique per starship, excluding self).
        if (updates.name !== undefined && updates.name !== null) {
          const newBase = generateSlug(String(updates.name)) || 'agent';
          updateProps.slug = await generateUniqueSlugIncremental(
            newBase,
            async (candidate) => await this.agentSlugExistsOnStarship(existing.starshipId, candidate, existing.id),
            { fallbackBase: 'agent', maxLength: 100 }
          );
        }

        const updateData = toDatabase(toEntityInstance(AgentEntity, updateProps));

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
        const result = await connection.query<Record<string, unknown>>(
          `SELECT * FROM agents
           WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)
           ORDER BY ts_rank(to_tsvector('english', name || ' ' || COALESCE(description, '')), plainto_tsquery('english', $1)) DESC
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
