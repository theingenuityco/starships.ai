import type { CreateStarshipDocRequest, StarshipDocModel, UpdateStarshipDocRequest } from '@starships/protocol';
import { BaseRepository } from './BaseRepository';
import { StarshipDocEntity } from '@/entities/StarshipDocEntity';
import { NotFoundError } from '@starships/errors';
import { nanoid } from 'nanoid';
import { fromDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import type { PostgresConnection } from '@/helpers/database';

type DbRow = Record<string, unknown>;

const SELECT_COLS = `id, starship_id, title, slug, content, archived, created_at, updated_at`;

export class StarshipDocRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('StarshipDocRepository', connection);
  }

  async findById(id: string): Promise<StarshipDocModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<DbRow>(`SELECT ${SELECT_COLS} FROM docs WHERE id = $1`, [id]);
        return record ? fromDatabase(StarshipDocEntity, record) : null;
      },
      'findById',
      'StarshipDoc',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<StarshipDocModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const record = await connection.queryOne<DbRow>(
          `SELECT ${SELECT_COLS} FROM docs WHERE starship_id = $1 AND slug = $2 LIMIT 1`,
          [starshipId, slug]
        );
        return record ? fromDatabase(StarshipDocEntity, record) : null;
      },
      'findBySlug',
      'StarshipDoc',
      slug
    );
  }

  async listByStarship(starshipId: string, opts?: { includeArchived?: boolean }): Promise<StarshipDocModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const includeArchived = Boolean(opts?.includeArchived);
        const connection = this.getConnection();
        const records = await connection.query<DbRow>(
          `SELECT ${SELECT_COLS} FROM docs
            WHERE starship_id = $1 AND ($2::boolean = TRUE OR archived = FALSE)
            ORDER BY archived ASC, created_at DESC`,
          [starshipId, includeArchived]
        );
        return fromDatabaseArray(StarshipDocEntity, records);
      },
      'listByStarship',
      'StarshipDoc'
    );
  }

  async create(data: CreateStarshipDocRequest): Promise<StarshipDocModel> {
    return this.executeWithErrorHandling(
      async () => {
        const id = nanoid();
        const now = new Date().toISOString();
        const slug = await generateUniqueSlugIncremental(
          String(data.title || 'doc'),
          async (candidate: string) => Boolean(await this.findBySlug(candidate, data.starshipId)),
          { fallbackBase: 'doc', maxLength: 100 }
        );

        const connection = this.getConnection();
        await connection.query(
          `INSERT INTO docs (id, starship_id, title, slug, content, archived, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7)`,
          [id, data.starshipId, data.title, slug, data.content ?? '', now, now]
        );

        const created = await this.findById(id);
        if (!created) throw new NotFoundError('StarshipDoc', id);
        return created;
      },
      'create',
      'StarshipDoc'
    );
  }

  async update(id: string, updates: UpdateStarshipDocRequest): Promise<StarshipDocModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const existing = await this.findById(id);
        if (!existing) return null;

        const sets: string[] = [];
        const values: unknown[] = [];
        let i = 1;

        if (updates.title !== undefined) {
          sets.push(`title = $${i++}`);
          values.push(updates.title);
        }
        if (updates.content !== undefined) {
          sets.push(`content = $${i++}`);
          values.push(updates.content);
        }
        if (updates.archived !== undefined) {
          sets.push(`archived = $${i++}`);
          values.push(Boolean(updates.archived));
        }

        if (sets.length === 0) return existing;

        sets.push(`updated_at = $${i++}`);
        values.push(new Date().toISOString());

        values.push(id);
        const connection = this.getConnection();
        await connection.query(`UPDATE docs SET ${sets.join(', ')} WHERE id = $${i}`, values);
        return await this.findById(id);
      },
      'update',
      'StarshipDoc',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        return this.deleteEntity('docs', id);
      },
      'delete',
      'StarshipDoc',
      id
    );
  }
}

export default StarshipDocRepository;
