import { UIActionService } from '@/services/UIActionService';
import { nanoid } from 'nanoid';

type Target = { type: 'user' | 'agent'; id: string };

export async function createRoomInviteApprovalForMessage(
  conn: {
    transaction: <T>(callback: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<T>) => Promise<T>;
  },
  args: {
    starshipId: string;
    roomConversationId: string;
    conversationId: string;
    messageId: string;
    requestedByUserId: string;
    missingUserIds: string[];
    missingAgentIds: string[];
    emitUIAction?: boolean;
  }
): Promise<{ approvalId: string } | null> {
  const starshipId = String(args.starshipId || '').trim();
  const roomConversationId = String(args.roomConversationId || '').trim();
  const conversationId = String(args.conversationId || '').trim();
  const messageId = String(args.messageId || '').trim();
  const requestedByUserId = String(args.requestedByUserId || '').trim();
  if (!starshipId || !roomConversationId || !conversationId || !messageId || !requestedByUserId) return null;

  const missingUserIds = Array.isArray(args.missingUserIds) ? args.missingUserIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const missingAgentIds = Array.isArray(args.missingAgentIds) ? args.missingAgentIds.map((x) => String(x || '').trim()).filter(Boolean) : [];
  if (missingUserIds.length === 0 && missingAgentIds.length === 0) return null;

  const newApprovalId = nanoid();
  const approvalId = await conn.transaction(async (client) => {
    const approvalResult = await client.query(
      `
      INSERT INTO room_invite_approvals (
        id,
        starship_id,
        room_conversation_id,
        conversation_id,
        message_id,
        requested_by_user_id,
        status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())
      ON CONFLICT (message_id)
      DO UPDATE SET
        updated_at = NOW(),
        status = CASE WHEN room_invite_approvals.status = 'pending' THEN 'pending' ELSE room_invite_approvals.status END
      RETURNING id
      `,
      [newApprovalId, starshipId, roomConversationId, conversationId, messageId, requestedByUserId]
    );
    const row = (approvalResult.rows?.[0] as { id?: unknown } | undefined) ?? undefined;
    const approvalId = row?.id ? String(row.id).trim() : '';
    if (!approvalId) return '';

    const targets: Target[] = [
      ...missingUserIds.map((id) => ({ type: 'user' as const, id })),
      ...missingAgentIds.map((id) => ({ type: 'agent' as const, id })),
    ];

    if (targets.length > 0) {
      const params: string[] = [];
      const tuples: string[] = [];
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        params.push(approvalId, t.type, t.id);
        const base = i * 3;
        tuples.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
      }
      await client.query(
        `INSERT INTO room_invite_approval_targets (approval_id, target_type, target_id)
         VALUES ${tuples.join(',')}
         ON CONFLICT (approval_id, target_type, target_id) DO NOTHING`,
        params
      );
    }

    return approvalId;
  });
  if (!approvalId) return null;

  if (args.emitUIAction) {
    await new UIActionService().publishAction(conversationId, 'room_invite_approval_required', {
      approvalId,
      roomConversationId,
      conversationId,
      messageId,
    });
  }

  return { approvalId };
}

