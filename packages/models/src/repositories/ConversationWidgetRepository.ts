import { BaseRepository } from '@/repositories/BaseRepository';
import { nanoid } from 'nanoid';

export type ConversationWidgetRow = {
  id: string;
  starshipId: string;
  conversationId: string;
  widgetId: string;
  turnId: string | null;
  anchorMessageId: string | null;
  toolCallId: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ConversationWidgetRepository extends BaseRepository {
  constructor() {
    super('ConversationWidgetRepository');
  }

  async createOrIgnore(args: {
    starshipId: string;
    conversationId: string;
    widgetId: string;
    turnId?: string | null;
    anchorMessageId?: string | null;
    toolCallId?: string | null;
  }): Promise<ConversationWidgetRow | null> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const now = new Date().toISOString();
        const id = nanoid();

        // Be explicit about which unique rule we're deduping against.
        // This table has multiple partial unique indexes; a bare "ON CONFLICT DO NOTHING"
        // can silently ignore inserts for the wrong uniqueness rule.
        const conflictClause =
          args.toolCallId != null
            ? `ON CONFLICT (conversation_id, tool_call_id) WHERE tool_call_id IS NOT NULL DO NOTHING`
            : args.anchorMessageId != null
              ? `ON CONFLICT (conversation_id, anchor_message_id, widget_id) WHERE anchor_message_id IS NOT NULL DO NOTHING`
              : '';

        const row = await connection.queryOne<Record<string, unknown>>(
          `
          INSERT INTO conversation_widgets (
            id, starship_id, conversation_id, widget_id, turn_id, anchor_message_id, tool_call_id, created_at, updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ${conflictClause}
          RETURNING
            id,
            starship_id,
            conversation_id,
            widget_id,
            turn_id,
            anchor_message_id,
            tool_call_id,
            created_at,
            updated_at
          `,
          [
            id,
            String(args.starshipId),
            String(args.conversationId),
            String(args.widgetId),
            args.turnId ?? null,
            args.anchorMessageId ?? null,
            args.toolCallId ?? null,
            now,
            now,
          ]
        );

        if (!row) return null;

        return {
          id: String(row.id),
          starshipId: String(row.starship_id),
          conversationId: String(row.conversation_id),
          widgetId: String(row.widget_id),
          turnId: row.turn_id != null ? String(row.turn_id) : null,
          anchorMessageId: row.anchor_message_id != null ? String(row.anchor_message_id) : null,
          toolCallId: row.tool_call_id != null ? String(row.tool_call_id) : null,
          createdAt: String(row.created_at),
          updatedAt: String(row.updated_at),
        };
      },
      'createOrIgnore',
      'ConversationWidget'
    );
  }

  async listByConversation(conversationId: string, opts?: { limit?: number }): Promise<ConversationWidgetRow[]> {
    return this.executeWithErrorHandling(
      async () => {
        const connection = this.getConnection();
        const limit = typeof opts?.limit === 'number' && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 200) : 50;
        const rows = await connection.query<Record<string, unknown>>(
          `
          SELECT
            id,
            starship_id,
            conversation_id,
            widget_id,
            turn_id,
            anchor_message_id,
            tool_call_id,
            created_at,
            updated_at
          FROM conversation_widgets
          WHERE conversation_id = $1
          ORDER BY created_at ASC
          LIMIT $2
          `,
          [conversationId, limit]
        );

        const out: ConversationWidgetRow[] = [];
        const raw = rows as unknown;
        const arr: Record<string, unknown>[] =
          raw && typeof raw === 'object' && Array.isArray((raw as { rows?: unknown[] }).rows)
            ? ((raw as { rows: Record<string, unknown>[] }).rows as Record<string, unknown>[])
            : Array.isArray(raw)
              ? (raw as Record<string, unknown>[])
              : [];
        for (const r of arr) {
          out.push({
            id: String(r.id),
            starshipId: String(r.starship_id),
            conversationId: String(r.conversation_id),
            widgetId: String(r.widget_id),
            turnId: r.turn_id != null ? String(r.turn_id) : null,
            anchorMessageId: r.anchor_message_id != null ? String(r.anchor_message_id) : null,
            toolCallId: r.tool_call_id != null ? String(r.tool_call_id) : null,
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          });
        }
        return out;
      },
      'listByConversation',
      'ConversationWidget',
      conversationId
    );
  }
}
