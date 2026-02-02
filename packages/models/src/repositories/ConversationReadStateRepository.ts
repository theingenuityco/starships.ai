import { ConversationReadStateEntity } from '@/entities/ConversationReadStateEntity';
import { fromDatabase, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { ConversationReadStateModel } from '@starships/protocol';

export class ConversationReadStateRepository extends BaseRepository {
  constructor() {
    super('ConversationReadStateRepository');
  }

  async get(conversationId: string, userId: string): Promise<ConversationReadStateModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(conversationId || '').trim();
        const uid = String(userId || '').trim();
        if (!cid || !uid) return null;
        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `SELECT conversation_id, user_id, last_read_message_id, last_read_at, updated_at
             FROM conversation_read_states
            WHERE conversation_id = $1
              AND user_id = $2`,
          [cid, uid]
        );
        return row ? fromDatabase(ConversationReadStateEntity, row) : null;
      },
      'get',
      'conversation_read_states',
      `${conversationId}:${userId}`
    );
  }

  async upsert(args: {
    conversationId: string;
    userId: string;
    lastReadMessageId?: string | null;
    lastReadAt?: string | null;
  }): Promise<ConversationReadStateModel> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(args.conversationId || '').trim();
        const uid = String(args.userId || '').trim();
        if (!cid || !uid) throw new Error('conversationId and userId are required');

        const payload = {
          conversationId: cid,
          userId: uid,
          lastReadMessageId: args.lastReadMessageId ?? null,
          lastReadAt: args.lastReadAt ?? null,
          updatedAt: new Date().toISOString(),
        };
        await ConversationReadStateEntity.validate(payload, 'create');
        const entity = toEntityInstance(ConversationReadStateEntity, payload as Record<string, unknown>);
        const db = toDatabase(entity);

        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO conversation_read_states (conversation_id, user_id, last_read_message_id, last_read_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (conversation_id, user_id)
          DO UPDATE SET
            last_read_message_id = EXCLUDED.last_read_message_id,
            last_read_at = EXCLUDED.last_read_at,
            updated_at = NOW()
          RETURNING conversation_id, user_id, last_read_message_id, last_read_at, updated_at
          `,
          [db.conversation_id, db.user_id, db.last_read_message_id ?? null, db.last_read_at ?? null]
        );
        if (!row) throw new Error('Failed to upsert conversation_read_states');
        return fromDatabase(ConversationReadStateEntity, row);
      },
      'upsert',
      'conversation_read_states',
      `${args.conversationId}:${args.userId}`
    );
  }
}

