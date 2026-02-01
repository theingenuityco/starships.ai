import { ConversationMemberEntity, type ConversationMemberRole } from '@/entities/ConversationMemberEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';

export class ConversationMemberRepository extends BaseRepository {
  constructor() {
    super('ConversationMemberRepository');
  }

  async isMember(userId: string, conversationId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ ok: number }>(
          `SELECT 1 as ok
             FROM conversation_members
            WHERE conversation_id = $1
              AND user_id = $2
            LIMIT 1`,
          [conversationId, userId]
        );
        return Boolean(row?.ok);
      },
      'isMember',
      'conversation_members'
    );
  }

  async listByConversation(conversationId: string): Promise<ConversationMemberEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT conversation_id, user_id, role, created_at, created_by
             FROM conversation_members
            WHERE conversation_id = $1
            ORDER BY created_at ASC`,
          [conversationId]
        );
        return fromDatabaseArray(ConversationMemberEntity, rows);
      },
      'listByConversation',
      'conversation_members',
      conversationId
    );
  }

  async createOrIgnoreMember(args: {
    conversationId: string;
    userId: string;
    role?: ConversationMemberRole;
    createdBy?: string | null;
  }): Promise<{ created: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `INSERT INTO conversation_members (conversation_id, user_id, role, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          [args.conversationId, args.userId, args.role ?? 'member', args.createdBy ?? null]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { created: rowCount > 0 };
      },
      'createOrIgnoreMember',
      'conversation_members'
    );
  }

  async removeMember(conversationId: string, userId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `DELETE FROM conversation_members
            WHERE conversation_id = $1
              AND user_id = $2`,
          [conversationId, userId]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return rowCount > 0;
      },
      'removeMember',
      'conversation_members'
    );
  }
}
