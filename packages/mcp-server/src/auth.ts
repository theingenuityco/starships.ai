import { createHash } from 'crypto';
import { AgentRepository, AgentTokenRepository } from '@starships/models';
import type { AgentAccessRole } from '@starships/protocol';

export interface AgentContext {
  agentId: string;
  starshipId: string;
  accessRole: AgentAccessRole;
  tokenId: string;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Resolve an external agent from a bearer connection token.
 *
 * Returns null when the token is missing/invalid/revoked/expired, or when its
 * agent no longer exists. Every authenticated call is implicitly scoped to one
 * starship and one agent.
 */
export async function resolveAgentContext(authHeader: string | undefined): Promise<AgentContext | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const secret = m?.[1]?.trim();
  if (!secret) return null;

  const tokenRepo = new AgentTokenRepository();
  const token = await tokenRepo.findActiveByHash(sha256(secret));
  if (!token) return null;

  const agent = await new AgentRepository().findById(token.agentId);
  if (!agent || String(agent.starshipId) !== String(token.starshipId)) return null;

  // Best-effort last-used bump (do not block the request on it).
  void tokenRepo.touchLastUsed(token.id).catch(() => undefined);

  return {
    agentId: agent.id,
    starshipId: token.starshipId,
    accessRole: agent.accessRole,
    tokenId: token.id,
  };
}
