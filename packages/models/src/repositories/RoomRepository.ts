import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Room, RoomModel } from '@starships/protocol';
import { RoomEntity } from '@/entities/RoomEntity';
import { generateUniqueSlugIncremental } from '@/utils/slugGenerator';
import type { PostgresConnection } from '@/helpers/database';
import type { RoomDefinition } from '@/services/definition/types';

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

  /**
   * Update a room's authored metadata from a filesystem definition (reconcile
   * target). Updates only authored fields (slug, name, is_private, topic,
   * manager_agent_id, provisioned_by_bundle); preserves the backing conversation,
   * manager heartbeat, and created_at. Returns null if the room does not exist —
   * reconcile does NOT create rooms (the backing conversation must exist first).
   */
  async updateMetadataFromDefinition(def: RoomDefinition): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query<Record<string, unknown>>(
          `UPDATE rooms
             SET slug = $2, name = $3, is_private = $4, topic = $5, manager_agent_id = $6,
                 provisioned_by_bundle = $7, updated_at = $8
           WHERE conversation_id = $1
           RETURNING *`,
          [
            def.conversationId,
            def.slug,
            def.name,
            def.isPrivate,
            def.topic ?? null,
            def.managerAgentId ?? null,
            def.provisionedByBundle ?? null,
            new Date().toISOString(),
          ]
        );
        return result.length > 0 ? fromDatabase(RoomEntity, result[0]) : null;
      },
      'updateMetadataFromDefinition',
      'Room',
      def.conversationId
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
      managerAgentId?: string | null;
      managerAgentHeartbeatAt?: string | null;
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
          ...(args.managerAgentId !== undefined ? { managerAgentId: args.managerAgentId } : {}),
          ...(args.managerAgentHeartbeatAt !== undefined ? { managerAgentHeartbeatAt: args.managerAgentHeartbeatAt } : {}),
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

  /**
   * Find the first room provisioned from a given bundle tag (the value stored in
   * provisioned_by_bundle), e.g. 'engineering' or 'lead-generation'. Used to make
   * room provisioning idempotent for any catalog bundle.
   */
  async findRoomByBundleTag(starshipId: string, bundleTag: string): Promise<RoomModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM rooms WHERE starship_id = $1 AND provisioned_by_bundle = $2 ORDER BY created_at ASC LIMIT 1',
          [starshipId, bundleTag]
        );
        return row ? fromDatabase(RoomEntity, row) : null;
      },
      'findRoomByBundleTag',
      'Room',
      starshipId
    );
  }
}
