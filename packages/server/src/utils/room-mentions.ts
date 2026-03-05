import { ConversationParticipantRepository, getConnection } from '@starships/models';
import { resolveRoomConversationContext } from '@/utils/conversation-membership';
import { parseMentionTokens } from '@/utils/mentions';

export type RoomMentionAllowlistAnalysis = {
  ctx: { roomConversationId: string };
  missingUserIds: string[];
  missingAgentIds: string[];
  sanitizedContentForMessage: string;
  sanitizedAgentIdForMessage: string | null;
};

function sanitizeDisallowedAgentMentions(args: {
  content: string;
  disallowedAgentIds: Set<string>;
  agentIdByRef: Map<string, string>;
}): string {
  if (!args.disallowedAgentIds || args.disallowedAgentIds.size === 0) return args.content;
  return String(args.content || '').replace(/<@a:([^>\s]{1,100})>/gi, (full, refRaw) => {
    const ref = String(refRaw || '').trim();
    const resolvedId = ref ? args.agentIdByRef.get(ref) : null;
    if (resolvedId && args.disallowedAgentIds.has(resolvedId)) return '';
    return full;
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
  const { userRefs: mentionedUserRefs, agentRefs: mentionedAgentRefs } = parseMentionTokens(content);

  const starshipId = String((ctx.room as any)?.starshipId || '').trim();
  const conn = getConnection();

  const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => String(x || '').trim()).filter(Boolean)));
  const userRefs = uniq(mentionedUserRefs || []);
  const agentRefs = uniq(mentionedAgentRefs || []);

  const [resolvedUsers, resolvedAgents] = await Promise.all([
    userRefs.length > 0 && starshipId
      ? conn
          .query<{ id: string; slug: string | null }>(
            `
            SELECT u.id, u.slug
              FROM users u
             WHERE (u.id = ANY($2::text[]) OR u.slug = ANY($2::text[]))
               AND (
                 u.id = (SELECT owner_id FROM starships WHERE id = $1)
                 OR EXISTS (SELECT 1 FROM starship_members sm WHERE sm.starship_id = $1 AND sm.user_id = u.id)
               )
            `,
            [starshipId, userRefs]
          )
          .catch(() => [])
      : Promise.resolve([] as Array<{ id: string; slug: string | null }>),
    agentRefs.length > 0 && starshipId
      ? conn
          .query<{ id: string; slug: string | null }>(
            `
            SELECT id, slug
              FROM agents
             WHERE starship_id = $1
               AND (id = ANY($2::text[]) OR slug = ANY($2::text[]))
            `,
            [starshipId, agentRefs]
          )
          .catch(() => [])
      : Promise.resolve([] as Array<{ id: string; slug: string | null }>),
  ]);

  const userIdByRef = new Map<string, string>();
  for (const r of Array.isArray(resolvedUsers) ? resolvedUsers : []) {
    const id = String((r as any)?.id || '').trim();
    const slug = typeof (r as any)?.slug === 'string' ? String((r as any).slug).trim() : '';
    if (id) {
      userIdByRef.set(id, id);
      if (slug) userIdByRef.set(slug, id);
    }
  }
  const agentIdByRef = new Map<string, string>();
  for (const r of Array.isArray(resolvedAgents) ? resolvedAgents : []) {
    const id = String((r as any)?.id || '').trim();
    const slug = typeof (r as any)?.slug === 'string' ? String((r as any).slug).trim() : '';
    if (id) {
      agentIdByRef.set(id, id);
      if (slug) agentIdByRef.set(slug, id);
    }
  }

  const mentionedUserIds = uniq(userRefs.map((ref) => userIdByRef.get(ref) || ''));
  const mentionedAgentIds = uniq(agentRefs.map((ref) => agentIdByRef.get(ref) || ''));

  const missingUserIds = mentionedUserIds.filter((id) => id && !allowUsers.has(id));
  const missingAgentIdsFromMentions = mentionedAgentIds.filter((id) => id && !allowAgents.has(id));

  const requestedAgentId = typeof args.requestedAgentId === 'string' ? args.requestedAgentId.trim() : '';
  const requestedAgentDisallowed = Boolean(requestedAgentId && !allowAgents.has(requestedAgentId));
  const missingAgentIds = Array.from(
    new Set([...(missingAgentIdsFromMentions || []), ...(requestedAgentDisallowed ? [requestedAgentId] : [])].filter(Boolean))
  );

  const disallowedMentionIdSet = new Set(missingAgentIdsFromMentions.map((x) => String(x || '').trim()).filter(Boolean));
  const sanitizedContentForMessage = sanitizeDisallowedAgentMentions({
    content,
    disallowedAgentIds: disallowedMentionIdSet,
    agentIdByRef,
  });

  return {
    ctx: { roomConversationId: ctx.roomConversationId },
    missingUserIds,
    missingAgentIds,
    sanitizedContentForMessage,
    sanitizedAgentIdForMessage: requestedAgentDisallowed ? null : requestedAgentId || null,
  };
}

