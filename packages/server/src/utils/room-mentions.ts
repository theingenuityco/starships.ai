import { ConversationParticipantRepository } from '@starships/models';
import { resolveRoomConversationContext } from '@/utils/conversation-membership';
import { parseMentionTokens } from '@/utils/mentions';

export type RoomMentionAllowlistAnalysis = {
  ctx: { roomConversationId: string };
  missingUserIds: string[];
  missingAgentIds: string[];
  sanitizedContentForMessage: string;
  sanitizedAgentIdForMessage: string | null;
};

function sanitizeDisallowedAgentMentions(args: { content: string; disallowedAgentIds: Set<string> }): string {
  if (!args.disallowedAgentIds || args.disallowedAgentIds.size === 0) return args.content;
  return String(args.content || '').replace(/<@a:([a-z0-9_-]{10,64}|[0-9a-f-]{36})>/gi, (full, id) => {
    const v = String(id || '').trim();
    return args.disallowedAgentIds.has(v) ? '' : full;
  });
}

export async function analyzeRoomMentionsAndAgentAllowlist(args: {
  conversationId: string;
  content: string;
  requestedAgentId?: string | null;
}): Promise<RoomMentionAllowlistAnalysis | null> {
  const ctx = await resolveRoomConversationContext({ conversationId: args.conversationId });
  if (!ctx) return null;

  const participantRepo = new ConversationParticipantRepository();
  const [userIds, agentIds] = await Promise.all([
    participantRepo.listUserIdsByConversation(ctx.roomConversationId).catch(() => []),
    participantRepo.listAgentIdsByConversation(ctx.roomConversationId).catch(() => []),
  ]);
  const allowUsers = new Set((userIds || []).map((x) => String(x || '').trim()).filter(Boolean));
  const allowAgents = new Set((agentIds || []).map((x) => String(x || '').trim()).filter(Boolean));

  const content = String(args.content || '');
  const { userIds: mentionedUserIds, agentIds: mentionedAgentIds } = parseMentionTokens(content);
  const missingUserIds = mentionedUserIds.map((id) => String(id || '').trim()).filter(Boolean).filter((id) => !allowUsers.has(id));
  const missingAgentIdsFromMentions = mentionedAgentIds
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .filter((id) => !allowAgents.has(id));

  const requestedAgentId = typeof args.requestedAgentId === 'string' ? args.requestedAgentId.trim() : '';
  const requestedAgentDisallowed = Boolean(requestedAgentId && !allowAgents.has(requestedAgentId));
  const missingAgentIds = Array.from(
    new Set([...(missingAgentIdsFromMentions || []), ...(requestedAgentDisallowed ? [requestedAgentId] : [])].filter(Boolean))
  );

  const disallowedMentionIdSet = new Set(missingAgentIdsFromMentions.map((x) => String(x || '').trim()).filter(Boolean));
  const sanitizedContentForMessage = sanitizeDisallowedAgentMentions({ content, disallowedAgentIds: disallowedMentionIdSet });

  return {
    ctx: { roomConversationId: ctx.roomConversationId },
    missingUserIds,
    missingAgentIds,
    sanitizedContentForMessage,
    sanitizedAgentIdForMessage: requestedAgentDisallowed ? null : requestedAgentId || null,
  };
}

