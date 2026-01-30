import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { DirectMessage, DirectMessageModel } from '@starships/protocol';
import { DirectMessageEntity } from '@/entities/DirectMessageEntity';

export class DirectMessageRepository extends BaseRepository {
  constructor() {
    super('DirectMessageRepository');
  }

  async findUserAgentDm(starshipId: string, userId: string, agentId: string): Promise<DirectMessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `
          SELECT *
            FROM direct_messages
           WHERE starship_id = $1
             AND dm_type = 'user_agent'
             AND user_id = $2
             AND agent_id = $3
           LIMIT 1
          `,
          [starshipId, userId, agentId]
        );
        return row ? fromDatabase(DirectMessageEntity, row) : null;
      },
      'findUserAgentDm',
      'DirectMessage'
    );
  }

  async findByConversationId(conversationId: string): Promise<DirectMessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>('SELECT * FROM direct_messages WHERE conversation_id = $1', [
          conversationId,
        ]);
        return row ? fromDatabase(DirectMessageEntity, row) : null;
      },
      'findByConversationId',
      'DirectMessage',
      conversationId
    );
  }

  async listByStarshipForUser(starshipId: string, userId: string): Promise<DirectMessageModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        // Membership-based listing (authoritative), regardless of dm_type.
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT dm.*
            FROM direct_messages dm
            INNER JOIN conversation_members cm
              ON cm.conversation_id = dm.conversation_id
           WHERE dm.starship_id = $1
             AND cm.user_id = $2
           ORDER BY dm.updated_at DESC
          `,
          [starshipId, userId]
        );
        return fromDatabaseArray(DirectMessageEntity, rows);
      },
      'listByStarshipForUser',
      'DirectMessage'
    );
  }

  async create(args: DirectMessage & { conversationId: string; starshipId: string }): Promise<DirectMessageModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const data = {
          conversationId: args.conversationId,
          starshipId: args.starshipId,
          dmType: args.dmType,
          ...(args.userId !== undefined ? { userId: args.userId } : {}),
          ...(args.agentId !== undefined ? { agentId: args.agentId } : {}),
          ...(args.userAId !== undefined ? { userAId: args.userAId } : {}),
          ...(args.userBId !== undefined ? { userBId: args.userBId } : {}),
          createdAt: now,
          updatedAt: now,
        };

        await DirectMessageEntity.validate(data, 'create');
        const entity = toEntityInstance(DirectMessageEntity, data);
        const serialized = toDatabase(entity);

        const connection = this.getConnection();
        const cols = Object.keys(serialized);
        const vals = Object.values(serialized);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const sql = `
          INSERT INTO direct_messages (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          RETURNING *;
        `;
        const row = await connection.queryOne<Record<string, unknown>>(sql, vals);
        if (!row) throw new Error('Failed to create direct message');
        return fromDatabase(DirectMessageEntity, row);
      },
      'create',
      'DirectMessage'
    );
  }
}
