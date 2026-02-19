import { ConversationNotificationPrefEntity, type ConversationNotificationLevel } from '@/entities/ConversationNotificationPrefEntity';
import { fromDatabase, fromDatabaseArray } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';

export class ConversationNotificationPrefRepository extends BaseRepository {
  constructor() {
    super('ConversationNotificationPrefRepository');
  }

  /**
   * Returns the stored preference, or null when no override exists.
   * Callers should treat null as the default level ('mentions').
   */
  async get(conversationId: string, userId: string): Promise<ConversationNotificationPrefEntity | null> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(conversationId || '').trim();
        const uid = String(userId || '').trim();
        if (!cid || !uid) return null;
        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `
          SELECT conversation_id, user_id, level, created_at, updated_at
            FROM conversation_notification_prefs
           WHERE conversation_id = $1
             AND user_id = $2
           LIMIT 1
          `,
          [cid, uid]
        );
        return row ? fromDatabase(ConversationNotificationPrefEntity, row) : null;
      },
      'get',
      'conversation_notification_prefs',
      `${conversationId}:${userId}`
    );
  }

  async upsert(args: { conversationId: string; userId: string; level: ConversationNotificationLevel }): Promise<ConversationNotificationPrefEntity> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(args.conversationId || '').trim();
        const uid = String(args.userId || '').trim();
        const level = String(args.level || '').trim() as ConversationNotificationLevel;
        if (!cid || !uid || !level) throw new Error('conversationId, userId, and level are required');

        const conn = this.getConnection();
        const row = await conn.queryOne<Record<string, unknown>>(
          `
          INSERT INTO conversation_notification_prefs (conversation_id, user_id, level, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (conversation_id, user_id)
          DO UPDATE SET level = EXCLUDED.level, updated_at = NOW()
          RETURNING conversation_id, user_id, level, created_at, updated_at
          `,
          [cid, uid, level]
        );
        if (!row) throw new Error('Failed to upsert conversation notification preference');
        return fromDatabase(ConversationNotificationPrefEntity, row);
      },
      'upsert',
      'conversation_notification_prefs',
      `${args.conversationId}:${args.userId}`
    );
  }

  async listUserIdsByLevel(args: { conversationId: string; level: ConversationNotificationLevel }): Promise<string[]> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(args.conversationId || '').trim();
        const level = String(args.level || '').trim() as ConversationNotificationLevel;
        if (!cid || !level) return [];
        const conn = this.getConnection();
        const rows = await conn.query<{ user_id: string }>(
          `
          SELECT user_id
            FROM conversation_notification_prefs
           WHERE conversation_id = $1
             AND level = $2
          `,
          [cid, level]
        );
        return rows.map((r) => String(r.user_id)).filter(Boolean);
      },
      'listUserIdsByLevel',
      'conversation_notification_prefs',
      `${args.conversationId}:${args.level}`
    );
  }

  async listByConversation(conversationId: string): Promise<ConversationNotificationPrefEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const cid = String(conversationId || '').trim();
        if (!cid) return [];
        const conn = this.getConnection();
        const rows = await conn.query<Record<string, unknown>>(
          `
          SELECT conversation_id, user_id, level, created_at, updated_at
            FROM conversation_notification_prefs
           WHERE conversation_id = $1
           ORDER BY updated_at DESC
          `,
          [cid]
        );
        return fromDatabaseArray(ConversationNotificationPrefEntity, rows);
      },
      'listByConversation',
      'conversation_notification_prefs',
      conversationId
    );
  }
}

