import { NotificationEntity } from '@/entities/NotificationEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { NotificationModel, NotificationType } from '@starships/protocol';

export class NotificationRepository extends BaseRepository {
  constructor() {
    super('NotificationRepository');
  }

  async create(args: {
    starshipId: string;
    userId: string;
    type: NotificationType;
    conversationId: string;
    messageId?: string | null;
  }): Promise<NotificationModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const payload = {
          id: 'temp-id',
          starshipId: String(args.starshipId || '').trim(),
          userId: String(args.userId || '').trim(),
          type: args.type,
          conversationId: String(args.conversationId || '').trim(),
          messageId: args.messageId ?? null,
          createdAt: now,
          seenAt: null,
          readAt: null,
        };
        await NotificationEntity.validate(payload, 'create');
        const entity = toEntityInstance(NotificationEntity, payload as Record<string, unknown>);
        const db = toDatabase(entity);
        // Remove temp id to allow DB default
        delete db.id;

        const row = await this.createEntity<Record<string, unknown>>('notifications', db);
        return fromDatabase(NotificationEntity, row);
      },
      'create',
      'notifications'
    );
  }

  async createOrIgnoreByUserTypeMessage(args: {
    starshipId: string;
    userId: string;
    type: NotificationType;
    conversationId: string;
    messageId: string;
  }): Promise<{ created: boolean; notification?: NotificationModel }> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        const cid = String(args.conversationId || '').trim();
        const mid = String(args.messageId || '').trim();
        if (!sid || !uid || !cid || !mid) return { created: false };

        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO notifications (starship_id, user_id, type, conversation_id, message_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, type, message_id) WHERE message_id IS NOT NULL AND type IN ('dm', 'mention') DO NOTHING
          RETURNING *;
          `,
          [sid, uid, args.type, cid, mid]
        );
        if (!row) return { created: false };
        return { created: true, notification: fromDatabase(NotificationEntity, row) };
      },
      'createOrIgnoreByUserTypeMessage',
      'notifications'
    );
  }

  async listForUser(args: {
    starshipId: string;
    userId: string;
    limit?: number;
    beforeCreatedAt?: string;
    beforeId?: string;
  }): Promise<NotificationModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        const limit = Math.max(1, Math.min(200, Number(args.limit ?? 50)));
        if (!sid || !uid) return [];

        const params: unknown[] = [sid, uid];
        let where = 'WHERE starship_id = $1 AND user_id = $2';
        if (args.beforeCreatedAt && args.beforeId) {
          params.push(args.beforeCreatedAt, args.beforeId);
          where += ` AND (created_at, id) < ($3::timestamptz, $4::text)`;
        }
        params.push(limit);
        const limitIdx = params.length;

        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT *
            FROM notifications
            ${where}
           ORDER BY created_at DESC, id DESC
           LIMIT $${limitIdx}
          `,
          params
        );
        return fromDatabaseArray(NotificationEntity, rows);
      },
      'listForUser',
      'notifications',
      `${args.starshipId}:${args.userId}`
    );
  }

  async markSeen(args: { starshipId: string; userId: string; before?: string | null }): Promise<{ updated: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        if (!sid || !uid) return { updated: 0 };
        const before = args.before ? String(args.before) : null;
        const conn = this.getConnection();
        const result = await conn.query(
          `
          UPDATE notifications
             SET seen_at = COALESCE(seen_at, NOW())
           WHERE starship_id = $1
             AND user_id = $2
             AND seen_at IS NULL
             ${before ? 'AND created_at <= $3::timestamptz' : ''}
          `,
          before ? [sid, uid, before] : [sid, uid]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { updated: rowCount };
      },
      'markSeen',
      'notifications',
      `${args.starshipId}:${args.userId}`
    );
  }

  async markRead(args: { starshipId: string; userId: string; conversationId?: string | null }): Promise<{ updated: number }> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        const cid = args.conversationId ? String(args.conversationId).trim() : null;
        if (!sid || !uid) return { updated: 0 };
        const conn = this.getConnection();
        const result = await conn.query(
          `
          UPDATE notifications
             SET read_at = COALESCE(read_at, NOW()),
                 seen_at = COALESCE(seen_at, NOW())
           WHERE starship_id = $1
             AND user_id = $2
             AND read_at IS NULL
             ${cid ? 'AND conversation_id = $3' : ''}
          `,
          cid ? [sid, uid, cid] : [sid, uid]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { updated: rowCount };
      },
      'markRead',
      'notifications',
      `${args.starshipId}:${args.userId}`
    );
  }

  async getUnreadCounts(args: { starshipId: string; userId: string }): Promise<{
    totalUnread: number;
    dmUnreadByConversationId: Record<string, number>;
    mentionUnreadByConversationId: Record<string, number>;
    reactionUnreadByConversationId: Record<string, number>;
  }> {
    return this.executeWithErrorHandling(
      async () => {
        const sid = String(args.starshipId || '').trim();
        const uid = String(args.userId || '').trim();
        if (!sid || !uid)
          return { totalUnread: 0, dmUnreadByConversationId: {}, mentionUnreadByConversationId: {}, reactionUnreadByConversationId: {} };

        const conn = this.getConnection();
        const rows = await conn.query<{ type: string; conversation_id: string; n: number }>(
          `
          SELECT type, conversation_id, COUNT(*)::int as n
            FROM notifications
           WHERE starship_id = $1
             AND user_id = $2
             AND read_at IS NULL
           GROUP BY type, conversation_id
          `,
          [sid, uid]
        );

        const dmUnreadByConversationId: Record<string, number> = {};
        const mentionUnreadByConversationId: Record<string, number> = {};
        const reactionUnreadByConversationId: Record<string, number> = {};
        let totalUnread = 0;
        for (const r of rows) {
          const cid = String(r.conversation_id || '');
          const n = typeof r.n === 'number' ? r.n : Number(r.n);
          if (!cid || !Number.isFinite(n)) continue;
          totalUnread += n;
          if (r.type === 'dm') dmUnreadByConversationId[cid] = (dmUnreadByConversationId[cid] || 0) + n;
          if (r.type === 'mention') mentionUnreadByConversationId[cid] = (mentionUnreadByConversationId[cid] || 0) + n;
          if (r.type === 'reaction') reactionUnreadByConversationId[cid] = (reactionUnreadByConversationId[cid] || 0) + n;
        }
        return { totalUnread, dmUnreadByConversationId, mentionUnreadByConversationId, reactionUnreadByConversationId };
      },
      'getUnreadCounts',
      'notifications',
      `${args.starshipId}:${args.userId}`
    );
  }
}
