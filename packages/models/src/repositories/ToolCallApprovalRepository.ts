import { ToolCallApprovalEntity } from '@/entities/ToolCallApprovalEntity';
import { fromDatabase, fromDatabaseArray, toDatabase, toEntityInstance } from '@/helpers/serialization-helper';
import { BaseRepository } from '@/repositories/BaseRepository';
import { ConflictError, NotFoundError } from '@starships/errors';
import type { ToolCallApprovalModel } from '@starships/protocol';
import { nanoid } from 'nanoid';

export class ToolCallApprovalRepository extends BaseRepository {
  constructor() {
    super('ToolCallApprovalRepository');
  }

  async createPending(input: {
    starshipId: string;
    conversationId: string;
    agentId: string;
    toolSlug: string;
    toolCallId: string;
    argsJson: Record<string, unknown>;
  }): Promise<ToolCallApprovalModel> {
    return this.executeWithErrorHandling(
      async () => {
        const now = new Date().toISOString();
        const id = nanoid();

        const data: ToolCallApprovalModel = {
          id,
          starshipId: input.starshipId,
          conversationId: input.conversationId,
          agentId: input.agentId,
          toolSlug: input.toolSlug,
          toolCallId: input.toolCallId,
          argsJson: input.argsJson || {},
          status: 'pending',
          createdAt: now,
          decidedAt: null,
        };

        await ToolCallApprovalEntity.validate(data, 'create');
        const entity = toEntityInstance(ToolCallApprovalEntity, data as unknown as Record<string, unknown>);
        const serialized = toDatabase(entity);

        try {
          const result = await this.createEntity<Record<string, unknown>>('tool_call_approvals', serialized);
          return fromDatabase(ToolCallApprovalEntity, result);
        } catch (e: any) {
          // Unique(conversation_id, tool_call_id) enforcement
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
            throw new ConflictError('Tool approval already exists for this tool call');
          }
          throw e;
        }
      },
      'createPending',
      'ToolCallApproval'
    );
  }

  async findById(id: string): Promise<ToolCallApprovalModel | null> {
    return this.executeWithErrorHandling(
      async () => {
        const result = await super.findEntityById<Record<string, unknown>>('tool_call_approvals', id);
        return result ? fromDatabase(ToolCallApprovalEntity, result) : null;
      },
      'findById',
      'ToolCallApproval',
      id
    );
  }

  async markApproved(id: string): Promise<ToolCallApprovalModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const res = await connection.queryWithResult(
          `
          UPDATE tool_call_approvals
          SET status = 'approved', decided_at = NOW()
          WHERE id = $1 AND status = 'pending'
          RETURNING *
          `,
          [id]
        );
        const row = res.rows?.[0] as Record<string, unknown> | undefined;
        if (!row) {
          // Either not found or not pending
          const existing = await this.findById(id);
          if (!existing) throw new NotFoundError('ToolCallApproval', id);
          return existing;
        }
        return fromDatabase(ToolCallApprovalEntity, row);
      },
      'markApproved',
      'ToolCallApproval',
      id
    );
  }

  async markDenied(id: string): Promise<ToolCallApprovalModel> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const res = await connection.queryWithResult(
          `
          UPDATE tool_call_approvals
          SET status = 'denied', decided_at = NOW()
          WHERE id = $1 AND status = 'pending'
          RETURNING *
          `,
          [id]
        );
        const row = res.rows?.[0] as Record<string, unknown> | undefined;
        if (!row) {
          const existing = await this.findById(id);
          if (!existing) throw new NotFoundError('ToolCallApproval', id);
          return existing;
        }
        return fromDatabase(ToolCallApprovalEntity, row);
      },
      'markDenied',
      'ToolCallApproval',
      id
    );
  }

  async findPendingByConversation(conversationId: string): Promise<ToolCallApprovalModel[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const rows = await connection.query<Record<string, unknown>>(
          `SELECT * FROM tool_call_approvals WHERE conversation_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
          [conversationId]
        );
        return fromDatabaseArray(ToolCallApprovalEntity, rows);
      },
      'findPendingByConversation',
      'ToolCallApproval',
      conversationId
    );
  }
}


