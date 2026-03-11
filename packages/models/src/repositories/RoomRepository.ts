import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Room, RoomModel } from '@starships/protocol';
import { RoomEntity } from '@/entities/RoomEntity';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import type { PostgresConnection } from '@/helpers/database';

export class RoomRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('RoomRepository', connection);
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

  async findByConversationId(conversationId: string): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM rooms WHERE conversation_id = $1', [conversationId]);
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'findByConversationId',
      'Room',
      conversationId
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

  async create(
    args: Omit<Room, 'slug'> & {
      slug?: string;
      conversationId: string;
      starshipId: string;
      provisionedByBundle?: string | null;
    }
  ): Promise<RoomModel> {
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
          conversationId: args.conversationId,
          starshipId: args.starshipId,
          slug,
          name: args.name,
          isPrivate: Boolean(args.isPrivate),
          ...(args.topic !== undefined ? { topic: args.topic } : {}),
          ...(args.provisionedByBundle !== undefined ? { provisionedByBundle: args.provisionedByBundle } : {}),
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

  /**
   * Find the first room in a starship that was provisioned by the
   * lead-generation bundle. This is used to reliably identify the
   * dedicated lead-gen workspace even if its slug changes.
   */
  async findLeadGenBundleRoom(starshipId: string): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM rooms WHERE starship_id = $1 AND provisioned_by_bundle = $2 ORDER BY created_at ASC LIMIT 1',
          [starshipId, 'lead-generation']
        );
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'findLeadGenBundleRoom',
      'Room',
      starshipId
    );
  }
}
