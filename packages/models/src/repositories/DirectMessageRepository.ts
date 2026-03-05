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

  /**
   * Find a user↔user DM regardless of input ordering.
   *
   * IMPORTANT: The table enforces a normalized pair via CHECK (user_a_id < user_b_id).
   * We must use Postgres ordering semantics (collation) when normalizing; do it in SQL
   * via LEAST/GREATEST to avoid JS localeCompare() mismatches.
   */
  async findUserUserDm(starshipId: string, userAId: string, userBId: string): Promise<DirectMessageModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          `
          SELECT *
            FROM direct_messages
           WHERE starship_id = $1
             AND dm_type = 'user_user'
             AND user_a_id = LEAST($2, $3)
             AND user_b_id = GREATEST($2, $3)
           LIMIT 1
          `,
          [starshipId, userAId, userBId]
        );
        return row ? fromDatabase(DirectMessageEntity, row) : null;
      },
      'findUserUserDm',
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
        //
        // IMPORTANT:
        // DM access control is enforced via `conversation_participants` (see enforceDirectMessageMembership).
        // Do not rely on any legacy membership tables here.
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT dm.*
            FROM direct_messages dm
            INNER JOIN conversation_participants cp
              ON cp.conversation_id = dm.conversation_id
           WHERE dm.starship_id = $1
             AND cp.user_id = $2
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
        const baseData = {
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

        await DirectMessageEntity.validate(baseData, 'create');

        const connection = this.getConnection();

        // For user↔user DMs, normalize the pair using Postgres ordering semantics
        // so we always satisfy CHECK (user_a_id < user_b_id).
        let row: Record<string, unknown> | null;
        if (args.dmType === 'user_user') {
          const user1 = String(args.userAId ?? '');
          const user2 = String(args.userBId ?? '');
          if (!user1 || !user2) throw new Error('user_user DM requires userAId and userBId');

          row = await connection.queryOne<Record<string, unknown>>(
            `
            INSERT INTO direct_messages (
              conversation_id,
              starship_id,
              dm_type,
              user_id,
              agent_id,
              user_a_id,
              user_b_id,
              created_at,
              updated_at
            )
            VALUES (
              $1,
              $2,
              'user_user',
              NULL,
              NULL,
              LEAST($3, $4),
              GREATEST($3, $4),
              $5,
              $6
            )
            RETURNING *;
            `,
            [args.conversationId, args.starshipId, user1, user2, now, now]
          );
        } else {
          const entity = toEntityInstance(DirectMessageEntity, baseData);
          const serialized = toDatabase(entity);
          const cols = Object.keys(serialized);
          const vals = Object.values(serialized);
          const placeholders = cols.map((_, i) => `$${i + 1}`);
          const sql = `
            INSERT INTO direct_messages (${cols.join(', ')})
            VALUES (${placeholders.join(', ')})
            RETURNING *;
          `;
          row = await connection.queryOne<Record<string, unknown>>(sql, vals);
        }

        if (!row) throw new Error('Failed to create direct message');
        return fromDatabase(DirectMessageEntity, row);
      },
      'create',
      'DirectMessage'
    );
  }
}
