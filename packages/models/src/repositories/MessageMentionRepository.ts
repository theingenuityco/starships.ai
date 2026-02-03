import { MessageMentionEntity } from '@/entities/MessageMentionEntity';
import { fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { MentionTargetType, MessageMentionModel } from '@starships/protocol';

export class MessageMentionRepository extends BaseRepository {
  constructor() {
    super('MessageMentionRepository');
  }

  async insertManyIgnore(args: {
    messageId: string;
    conversationId: string;
    starshipId: string;
    mentions: Array<{ targetType: MentionTargetType; targetId: string }>;
  }): Promise<{ inserted: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const messageId = String(args.messageId || '').trim();
        const conversationId = String(args.conversationId || '').trim();
        const starshipId = String(args.starshipId || '').trim();
        const list = Array.isArray(args.mentions) ? args.mentions : [];
        if (!messageId || !conversationId || !starshipId) return { inserted: 0 };
        if (list.length === 0) return { inserted: 0 };

        const conn = this.getConnection();
        let inserted = 0;
        for (const m of list) {
          const targetType = (m?.targetType as MentionTargetType) || 'user';
          const targetId = String(m?.targetId || '').trim();
          if (!targetId) continue;
          const payload = {
            messageId,
            conversationId,
            starshipId,
            targetType,
            targetId,
            createdAt: new Date().toISOString(),
          };
          await MessageMentionEntity.validate(payload, 'create');
          const entity = toEntityInstance(MessageMentionEntity, payload as Record<string, unknown>);
          const db = toDatabase(entity);
          const result = await conn.query(
            `
            INSERT INTO message_mentions (message_id, conversation_id, starship_id, target_type, target_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (message_id, target_type, target_id) DO NOTHING
            `,
            [db.message_id, db.conversation_id, db.starship_id, db.target_type, db.target_id]
          );
          const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
          if (rowCount > 0) inserted += rowCount;
        }
        return { inserted };
      },
      'insertManyIgnore',
      'message_mentions',
      args.messageId
    );
  }

  async listMentionsForUser(args: { starshipId: string; userId: string; limit?: number }): Promise<MessageMentionModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        const limit = Math.max(1, Math.min(200, Number(args.limit ?? 50)));
        if (!sid || !uid) return [];
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT message_id, conversation_id, starship_id, target_type, target_id, created_at
            FROM message_mentions
           WHERE starship_id = $1
             AND target_type = 'user'
             AND target_id = $2
           ORDER BY created_at DESC
           LIMIT $3
          `,
          [sid, uid, limit]
        );
        return fromDatabaseArray(MessageMentionEntity, rows);
      },
      'listMentionsForUser',
      'message_mentions',
      `${args.starshipId}:${args.userId}`
    );
  }
}

