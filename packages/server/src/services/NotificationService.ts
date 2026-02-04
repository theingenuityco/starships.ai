import { ChannelRepository, DirectMessageRepository, MessageMentionRepository, NotificationRepository } from '@starships/models';
import type { MessageModel, MentionTargetType } from '@starships/protocol';
import { NotificationStreamBus } from '@/services/NotificationStreamBus';

type ParsedMentions = { userIds: string[]; agentIds: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NANOID_RE = /^[a-z0-9_-]{10,64}$/i;
const isValidMentionId = (id: string): boolean => UUID_RE.test(String(id || '').trim()) || NANOID_RE.test(String(id || '').trim());

function parseMentionTokens(content: string): ParsedMentions {
  let text = typeof content === 'string' ? content : '';
  // Guard: avoid regex scanning extremely large payloads (DoS risk).
  // Messages are normally small; this just caps worst-case work.
  if (text.length > 20_000) {
    text = text.slice(0, 20_000);
  }
  const userIds = new Set<string>();
  const agentIds = new Set<string>();

  // Token format emitted by the TipTap composer (see plan):
  // - users: <@u:USER_ID>
  // - agents: <@a:AGENT_ID>
  const userRe = /<@u:([a-z0-9_-]{10,64}|[0-9a-f-]{36})>/gi;
  const agentRe = /<@a:([a-z0-9_-]{10,64}|[0-9a-f-]{36})>/gi;
  let m: RegExpExecArray | null;
  while ((m = userRe.exec(text))) {
    const id = String(m[1] || '').trim();
    if (id && isValidMentionId(id)) userIds.add(id);
  }
  while ((m = agentRe.exec(text))) {
    const id = String(m[1] || '').trim();
    if (id && isValidMentionId(id)) agentIds.add(id);
  }
  return { userIds: Array.from(userIds), agentIds: Array.from(agentIds) };
}

export class NotificationService {
  private readonly channelRepo = new ChannelRepository();
  private readonly dmRepo = new DirectMessageRepository();
  private readonly mentionRepo = new MessageMentionRepository();
  private readonly notificationRepo = new NotificationRepository();
  private readonly streamBus = NotificationStreamBus.getInstance();

  /**
   * Best-effort: create mention index rows + notification rows for channels/DMs.
   *
   * - DM notifications: type='dm' for DM recipients (excluding author userId when available)
   * - Mention notifications: type='mention' for <@u:...> targets (excluding author userId when available)
   * - Mention index: inserts both user+agent mentions into message_mentions
   */
  async handleMessageAppend(args: { conversationId: string; message: MessageModel }): Promise<void> {
    const conversationId = String(args.conversationId || '').trim();
    const message = args.message;
    if (!conversationId || !message) return;

    // Only notify for user/assistant authored messages (Slack/Discord-like).
    // Never notify on tool/system rows.
    const role = String(message.role || '');
    if (role !== 'user' && role !== 'assistant') return;

    // Ignore hidden/system instruction style messages if any are ever persisted with role=user/assistant.
    const messageType = String((message as any).messageType || '');
    if (messageType === 'system_instruction') return;

    const starshipId = String((message as any).starshipId || '').trim();
    const messageId = String((message as any).id || '').trim();
    if (!starshipId || !messageId) return;

    const authorUserId = typeof (message as any).userId === 'string' ? String((message as any).userId).trim() : '';

    // Identify whether this conversation is a channel or a DM (channels/DMs only per scope).
    const [dm, channel] = await Promise.all([
      this.dmRepo.findByConversationId(conversationId).catch(() => null),
      this.channelRepo.findByConversationId(conversationId).catch(() => null),
    ]);
    const isDm = !!dm;
    const isChannel = !!channel;
    if (!isDm && !isChannel) {
      // Out of scope for v1 notifications.
      return;
    }

    let { userIds, agentIds } = parseMentionTokens(String((message as any).content || ''));

    // DMs: only allow mentions of the other participant.
    // This prevents @mention notifications (and mention indexing) from being used to target arbitrary users/agents from a DM.
    if (isDm && dm) {
      const authorUserId = typeof (message as any).userId === 'string' ? String((message as any).userId).trim() : '';
      const authorAgentId = typeof (message as any).agentId === 'string' ? String((message as any).agentId).trim() : '';

      const allowUserIds = new Set<string>();
      const allowAgentIds = new Set<string>();

      if (dm.dmType === 'user_user') {
        // Only allow mentioning the other user in this DM (never self, never third parties).
        const a = typeof (dm as any).userAId === 'string' ? String((dm as any).userAId).trim() : '';
        const b = typeof (dm as any).userBId === 'string' ? String((dm as any).userBId).trim() : '';
        if (authorUserId && a && b) {
          const other = authorUserId === a ? b : authorUserId === b ? a : '';
          if (other) allowUserIds.add(other);
        }
      } else if (dm.dmType === 'user_agent') {
        const dmUserId = typeof (dm as any).userId === 'string' ? String((dm as any).userId).trim() : '';
        const dmAgentId = typeof (dm as any).agentId === 'string' ? String((dm as any).agentId).trim() : '';
        // If the human authored the message, only allow mentioning the agent (the other participant).
        if (authorUserId) {
          if (dmAgentId) allowAgentIds.add(dmAgentId);
        } else if (authorAgentId) {
          // If the agent authored the message, only allow mentioning the human (the other participant).
          if (dmUserId) allowUserIds.add(dmUserId);
        }
      }

      if (userIds.length > 0) userIds = userIds.filter((id) => allowUserIds.has(String(id || '').trim()));
      if (agentIds.length > 0) agentIds = agentIds.filter((id) => allowAgentIds.has(String(id || '').trim()));
    }

    // 1) Insert mention index rows (users + agents)
    const mentionTuples: Array<{ targetType: MentionTargetType; targetId: string }> = [];
    for (const uid of userIds) mentionTuples.push({ targetType: 'user', targetId: uid });
    for (const aid of agentIds) mentionTuples.push({ targetType: 'agent', targetId: aid });
    if (mentionTuples.length > 0) {
      await this.mentionRepo
        .insertManyIgnore({
          messageId,
          conversationId,
          starshipId,
          mentions: mentionTuples,
        })
        .catch(() => undefined);
    }

    // 2) DM notifications
    if (isDm && dm) {
      const recipients = new Set<string>();
      if (dm.dmType === 'user_agent') {
        const uid = typeof (dm as any).userId === 'string' ? String((dm as any).userId).trim() : '';
        if (uid) recipients.add(uid);
      } else if (dm.dmType === 'user_user') {
        const a = typeof (dm as any).userAId === 'string' ? String((dm as any).userAId).trim() : '';
        const b = typeof (dm as any).userBId === 'string' ? String((dm as any).userBId).trim() : '';
        if (a) recipients.add(a);
        if (b) recipients.add(b);
      }
      if (authorUserId) recipients.delete(authorUserId);

      const results = await Promise.all(
        Array.from(recipients).map((uid) =>
          this.notificationRepo
            .createOrIgnoreByUserTypeMessage({
              starshipId,
              userId: uid,
              type: 'dm',
              conversationId,
              messageId,
            })
            .then((r) => ({ uid, r }))
        )
      ).catch(() => []);
      for (const it of results as any[]) {
        const uid = String(it?.uid || '');
        const created = Boolean(it?.r?.created);
        const notification = it?.r?.notification as any;
        if (uid && created && notification) {
          try {
            await this.streamBus.publish(starshipId, uid, { type: 'notification.append', data: { notification } });
            const unread = await this.notificationRepo.getUnreadCounts({ starshipId, userId: uid });
            await this.streamBus.publish(starshipId, uid, { type: 'notification.state', data: { unread } });
          } catch {
            /* best-effort */
          }
        }
      }
    }

    // 3) Mention notifications (users only)
    if (userIds.length > 0) {
      const targets = new Set(userIds.map((x) => String(x).trim()).filter(Boolean));
      if (authorUserId) targets.delete(authorUserId);
      const results = await Promise.all(
        Array.from(targets).map((uid) =>
          this.notificationRepo
            .createOrIgnoreByUserTypeMessage({
              starshipId,
              userId: uid,
              type: 'mention',
              conversationId,
              messageId,
            })
            .then((r) => ({ uid, r }))
        )
      ).catch(() => []);
      for (const it of results as any[]) {
        const uid = String(it?.uid || '');
        const created = Boolean(it?.r?.created);
        const notification = it?.r?.notification as any;
        if (uid && created && notification) {
          try {
            await this.streamBus.publish(starshipId, uid, { type: 'notification.append', data: { notification } });
            const unread = await this.notificationRepo.getUnreadCounts({ starshipId, userId: uid });
            await this.streamBus.publish(starshipId, uid, { type: 'notification.state', data: { unread } });
          } catch {
            /* best-effort */
          }
        }
      }
    }
  }
}
