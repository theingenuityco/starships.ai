type ParsedMentions = { userRefs: string[]; agentRefs: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NANOID_RE = /^[a-z0-9_-]{10,64}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function isValidMentionRef(ref: string): boolean {
  const v = String(ref || '').trim();
  return UUID_RE.test(v) || NANOID_RE.test(v) || SLUG_RE.test(v);
}

/**
 * Parse structured mention tokens from message content.
 *
 * Token format emitted by the TipTap composer:
 * - users:  `<@u:USER_SLUG>` (legacy: `<@u:USER_ID>`)
 * - agents: `<@a:AGENT_SLUG>` (legacy: `<@a:AGENT_ID>`)
 */
export function parseMentionTokens(content: string): ParsedMentions {
  let text = typeof content === 'string' ? content : '';

  // Guard: cap worst-case regex work.
  if (text.length > 20_000) text = text.slice(0, 20_000);

  const userRefs = new Set<string>();
  const agentRefs = new Set<string>();

  const userRe = /<@u:([^>\s]{1,100})>/gi;
  const agentRe = /<@a:([^>\s]{1,100})>/gi;

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

