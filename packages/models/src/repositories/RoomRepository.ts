import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Room, RoomModel } from '@starships/protocol';
import { RoomEntity } from '@/entities/RoomEntity';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import type { PostgresConnection } from '@/helpers/database';
import { nanoid } from 'nanoid';

export class RoomRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('RoomRepository', connection);
  }

  async findById(id: string): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM rooms WHERE id = $1', [id]);
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'findById',
      'Room',
      id
    );
  }

  async findBySlug(slug: string, starshipId: string): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM rooms WHERE slug = $1 AND starship_id = $2', [
          slug,
          starshipId,
        ]);
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'findBySlug',
      'Room',
      slug
    );
  }

  async listByStarship(starshipId: string): Promise<RoomModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>('SELECT * FROM rooms WHERE starship_id = $1 ORDER BY created_at ASC', [
          starshipId,
        ]);
        return fromDatabaseArray(RoomEntity, rows);
      },
      'listByStarship',
      'Room',
      starshipId
    );
  }

  async create(args: Omit<Room, 'slug'> & { slug?: string; starshipId: string }): Promise<RoomModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const slug =
          typeof args.slug === 'string' && args.slug.trim().length > 0
            ? String(args.slug).trim()
            : await generateUniqueSlugIncremental(
                String(args.name || 'room'),
                async (candidate: string) => Boolean(await this.findBySlug(candidate, args.starshipId)),
                { fallbackBase: 'room', maxLength: 100 }
              );
        const data = {
          id: nanoid(),
          starshipId: args.starshipId,
          slug,
          name: args.name,
          isPrivate: Boolean(args.isPrivate),
          ...(args.topic !== undefined ? { topic: args.topic } : {}),
          createdAt: now,
          updatedAt: now,
        };

        await RoomEntity.validate(data, 'create');
        const entity = toEntityInstance(RoomEntity, data);
        const serialized = toDatabase(entity);

        const connection = this.getConnection();
        const cols = Object.keys(serialized);
        const vals = Object.values(serialized);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const sql = `
          INSERT INTO rooms (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *;
        `;
        const row = await connection.queryOne<Record<string, unknown>>(sql, vals);
        if (!row) throw new Error('Failed to create room');
        return fromDatabase(RoomEntity, row);
      },
      'create',
      'Room'
    );
  }

  async update(
    id: string,
    updates: Partial<Pick<Room, 'name' | 'slug' | 'isPrivate' | 'topic'>>
  ): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const next: Record<string, unknown> = { ...updates, updatedAt: new Date().toISOString() };
        await RoomEntity.validate(next, 'update');
        const serialized = toDatabase(toEntityInstance(RoomEntity, next));
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, created_at: _createdAt, ...fields } = serialized;
        if (Object.keys(fields).length === 0) return await this.findById(id);

        const connection = this.getConnection();
        const cols = Object.keys(fields);
        const vals = Object.values(fields);
        const assignments = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
        const row = await connection.queryOne<Record<string, unknown>>(
          `UPDATE rooms SET ${assignments} WHERE id = $1 RETURNING *`,
          [id, ...vals]
        );
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'update',
      'Room',
      id
    );
  }

  async delete(id: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query('DELETE FROM rooms WHERE id = $1', [id]);
        return (result as unknown as { rowCount?: number })?.rowCount !== 0;
      },
      'delete',
      'Room',
      id
    );
  }
}
