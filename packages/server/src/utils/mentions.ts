type ParsedMentions = { userIds: string[]; agentIds: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NANOID_RE = /^[a-z0-9_-]{10,64}$/i;

function isValidMentionId(id: string): boolean {
  const v = String(id || '').trim();
  return UUID_RE.test(v) || NANOID_RE.test(v);
}

/**
 * Parse structured mention tokens from message content.
 *
 * Token format emitted by the TipTap composer:
 * - users:  `<@u:USER_ID>`
 * - agents: `<@a:AGENT_ID>`
 */
export function parseMentionTokens(content: string): ParsedMentions {
  let text = typeof content === 'string' ? content : '';

  // Guard: cap worst-case regex work.
  if (text.length > 20_000) text = text.slice(0, 20_000);

  const userIds = new Set<string>();
  const agentIds = new Set<string>();

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

