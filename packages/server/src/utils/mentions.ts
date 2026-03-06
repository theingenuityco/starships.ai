type ParsedMentions = { userRefs: string[]; agentRefs: string[] };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function isValidMentionRef(ref: string): boolean {
  const v = String(ref || '').trim();
  return SLUG_RE.test(v);
}

/**
 * Parse structured mention tokens from message content.
 *
 * Token format emitted by the TipTap composer:
 * - users:  `<@u:USER_SLUG>`
 * - agents: `<@a:AGENT_SLUG>`
 */
export function parseMentionTokens(content: string): ParsedMentions {
  let text = typeof content === 'string' ? content : '';

  // Guard: cap worst-case regex work.
  if (text.length > 20_000) text = text.slice(0, 20_000);

  const userRefs = new Set<string>();
  const agentRefs = new Set<string>();

  const userRe = /<@u:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi;
  const agentRe = /<@a:([a-z0-9]+(?:-[a-z0-9]+)*)>/gi;

  let m: RegExpExecArray | null;
  while ((m = userRe.exec(text))) {
    const ref = String(m[1] || '').trim();
    if (ref && isValidMentionRef(ref)) userRefs.add(ref);
  }
  while ((m = agentRe.exec(text))) {
    const ref = String(m[1] || '').trim();
    if (ref && isValidMentionRef(ref)) agentRefs.add(ref);
  }

  return { userRefs: Array.from(userRefs), agentRefs: Array.from(agentRefs) };
}

