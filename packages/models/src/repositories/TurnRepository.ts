import { BaseRepository } from '@/repositories/BaseRepository';

export type TurnStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export type TurnModel = {
  id: string;
  conversationId: string;
  status: TurnStatus;
  startedAt: string;
  completedAt: string | null;
  stopReason: string | null;
  createdByMessageId: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Minimal Turn repository.
 *
 * Turns are used primarily for idempotent message persistence and lifecycle tracking.
 */
export class TurnRepository extends BaseRepository {
  constructor() {
    super('TurnRepository');
  }

  private static mapRow(row: Record<string, unknown>): TurnModel {
    const r = row as {
      id?: unknown;
      conversation_id?: unknown;
      status?: unknown;
      started_at?: unknown;
      completed_at?: unknown;
      stop_reason?: unknown;
      created_by_message_id?: unknown;
      created_at?: unknown;
      updated_at?: unknown;
    };
    return {
      id: String(r.id ?? ''),
      conversationId: String(r.conversation_id ?? ''),
      status: (r.status as TurnStatus) || 'active',
      startedAt: String(r.started_at ?? r.created_at ?? new Date().toISOString()),
      completedAt: r.completed_at ? String(r.completed_at) : null,
      stopReason: r.stop_reason ? String(r.stop_reason) : null,
      createdByMessageId: r.created_by_message_id ? String(r.created_by_message_id) : null,
      createdAt: String(r.created_at ?? new Date().toISOString()),
      updatedAt: String(r.updated_at ?? new Date().toISOString()),
    };
  }

  async createTurn(data: {
    conversationId: string;
    status?: TurnStatus;
    stopReason?: string | null;
    createdByMessageId?: string | null;
  }): Promise<TurnModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const row = await this.createEntity<Record<string, unknown>>('turns', {
          conversation_id: data.conversationId,
          status: data.status ?? 'active',
          stop_reason: typeof data.stopReason === 'string' ? data.stopReason : null,
          created_by_message_id: typeof data.createdByMessageId === 'string' ? data.createdByMessageId : null,
          started_at: now,
          created_at: now,
          updated_at: now,
        });

        return TurnRepository.mapRow(row);
      },
      'createTurn',
      'Turn'
    );
  }

  async updateTurn(
    id: string,
    updates: Partial<Pick<TurnModel, 'status' | 'completedAt' | 'stopReason' | 'createdByMessageId'>>
  ): Promise<void> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const sets: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (updates.status) {
          sets.push(`status = $${idx++}`);
          values.push(updates.status);
        }
        if (updates.completedAt !== undefined) {
          sets.push(`completed_at = $${idx++}`);
          values.push(updates.completedAt);
        }
        if (updates.stopReason !== undefined) {
          sets.push(`stop_reason = $${idx++}`);
          values.push(updates.stopReason);
        }
        if (updates.createdByMessageId !== undefined) {
          sets.push(`created_by_message_id = $${idx++}`);
          values.push(updates.createdByMessageId);
        }

        sets.push(`updated_at = NOW()`);

        values.push(id);
        const q = `UPDATE turns SET ${sets.join(', ')} WHERE id = $${idx}`;
        await connection.query(q, values);
      },
      'updateTurn',
      'Turn',
      id
    );
  }

  async findLatestByConversationId(conversationId: string): Promise<TurnModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const row = await connection.queryOne<Record<string, unknown>>(
          'SELECT * FROM turns WHERE conversation_id = $1 ORDER BY started_at DESC, created_at DESC LIMIT 1',
          [conversationId]
        );
        return row ? TurnRepository.mapRow(row) : null;
      },
      'findLatestByConversationId',
      'Turn',
      conversationId
    );
  }
}
