import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { Channel, ChannelModel } from '@starships/protocol';
import { ChannelEntity } from '@/entities/ChannelEntity';

export class ChannelRepository extends BaseRepository {
  constructor() {
    super('ChannelRepository');
  }

  async findByConversationId(conversationId: string): Promise<ChannelModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM channels WHERE conversation_id = $1', [conversationId]);
        return row ? fromDatabase(ChannelEntity, row) : null;
      },
      'findByConversationId',
      'Channel',
      conversationId
    );
  }

  async listByStarship(starshipId: string): Promise<ChannelModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          'SELECT * FROM channels WHERE starship_id = $1 ORDER BY created_at ASC',
          [starshipId]
        );
        return fromDatabaseArray(ChannelEntity, rows);
      },
      'listByStarship',
      'Channel',
      starshipId
    );
  }

  async create(args: Channel & { conversationId: string; starshipId: string }): Promise<ChannelModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const data = {
          conversationId: args.conversationId,
          starshipId: args.starshipId,
          slug: args.slug,
          name: args.name,
          isPrivate: Boolean(args.isPrivate),
          ...(args.topic !== undefined ? { topic: args.topic } : {}),
          createdAt: now,
          updatedAt: now,
        };

        await ChannelEntity.validate(data, 'create');
        const entity = toEntityInstance(ChannelEntity, data);
        const serialized = toDatabase(entity);

        const connection = this.getConnection();
        const cols = Object.keys(serialized);
        const vals = Object.values(serialized);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const sql = `
          INSERT INTO channels (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *;
        `;
        const row = await connection.queryOne<Record<string, unknown>>(sql, vals);
        if (!row) throw new Error('Failed to create channel');
        return fromDatabase(ChannelEntity, row);
      },
      'create',
      'Channel'
    );
  }
}

