import { ConversationParticipantEntity, type ConversationParticipantRole } from '@/entities/ConversationParticipantEntity';
import { fromDatabaseArray } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import type { PostgresConnection } from '@/helpers/database';

export class ConversationParticipantRepository extends BaseRepository {
  constructor(connection?: PostgresConnection) {
    super('ConversationParticipantRepository', connection);
  }

  async isUserParticipant(userId: string, conversationId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<{ ok: number }>(
          `SELECT 1 as ok
             FROM conversation_participants
            WHERE conversation_id = $1
              AND user_id = $2
            LIMIT 1`,
          [conversationId, userId]
        );
        return Boolean(row?.ok);
      },
      'isUserParticipant',
      'conversation_participants'
    );
  }

  async listByConversation(conversationId: string): Promise<ConversationParticipantEntity[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT conversation_id, user_id, agent_id, role, created_at, created_by
             FROM conversation_participants
            WHERE conversation_id = $1
            ORDER BY created_at ASC`,
          [conversationId]
        );
        return fromDatabaseArray(ConversationParticipantEntity, rows);
      },
      'listByConversation',
      'conversation_participants',
      conversationId
    );
  }

  async listUserIdsByConversation(conversationId: string): Promise<string[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{ user_id: string }>(
          `SELECT user_id
             FROM conversation_participants
            WHERE conversation_id = $1
              AND user_id IS NOT NULL
            ORDER BY created_at ASC`,
          [conversationId]
        );
        return Array.isArray(rows) ? rows.map((r) => String((r as { user_id?: unknown }).user_id || '')).filter(Boolean) : [];
      },
      'listUserIdsByConversation',
      'conversation_participants',
      conversationId
    );
  }

  async listAgentIdsByConversation(conversationId: string): Promise<string[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<{ agent_id: string }>(
          `SELECT agent_id
             FROM conversation_participants
            WHERE conversation_id = $1
              AND agent_id IS NOT NULL
            ORDER BY created_at ASC`,
          [conversationId]
        );
        return Array.isArray(rows) ? rows.map((r) => String((r as { agent_id?: unknown }).agent_id || '')).filter(Boolean) : [];
      },
      'listAgentIdsByConversation',
      'conversation_participants',
      conversationId
    );
  }

  async addUserParticipant(args: {
    conversationId: string;
    userId: string;
    role?: ConversationParticipantRole | null;
    createdBy?: string | null;
  }): Promise<{ created: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `INSERT INTO conversation_participants (conversation_id, user_id, role, created_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (conversation_id, user_id) DO NOTHING`,
          [args.conversationId, args.userId, args.role ?? null, args.createdBy ?? null]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { created: rowCount > 0 };
      },
      'addUserParticipant',
      'conversation_participants'
    );
  }

  async addAgentParticipant(args: { conversationId: string; agentId: string; createdBy?: string | null }): Promise<{ created: boolean }> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(
          `INSERT INTO conversation_participants (conversation_id, agent_id, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, agent_id) DO NOTHING`,
          [args.conversationId, args.agentId, args.createdBy ?? null]
        );
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return { created: rowCount > 0 };
      },
      'addAgentParticipant',
      'conversation_participants'
    );
  }

  /** Remove an agent participant from a conversation (room reconcile set-semantics). */
  async removeAgentParticipant(conversationId: string, agentId: string): Promise<boolean> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const result = await connection.query(`DELETE FROM conversation_participants WHERE conversation_id = $1 AND agent_id = $2`, [
          conversationId,
          agentId,
        ]);
        const rowCount = (result as unknown as { rowCount?: number }).rowCount ?? 0;
        return rowCount > 0;
      },
      'removeAgentParticipant',
      'conversation_participants'
    );
  }
}
