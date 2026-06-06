import { createHash } from 'crypto';
import { AgentPersonaRepository, AgentRuntimeRepository, AgentRuntimeTokenRepository } from '@starships/models';

export interface AgentRuntimeContext {
  runtimeId: string;
  starshipId: string;
  tokenId: string;
  /**
   * Whether writes are permitted. Derived from the personas currently assigned
   * to this runtime: a runtime hosting at least one `contributor` persona may
   * write. NOTE: this is a deliberate simplification. Once tokens are minted
   * per-persona, write access should be gated on the acting persona's role
   * rather than the runtime's most-privileged persona. See TODO(persona-token).
   */
  canWrite: boolean;
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Resolve an agent runtime from a bearer connection token.
 *
 * Returns null when the token is missing/invalid/revoked/expired, or when its
 * runtime no longer exists. Every authenticated call is scoped to one starship
 * and one runtime (the engine); the personas it hosts are resolved per dispatch.
 */
export async function resolveRuntimeContext(authHeader: string | undefined): Promise<AgentRuntimeContext | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const secret = m?.[1]?.trim();
  if (!secret) return null;

  const tokenRepo = new AgentRuntimeTokenRepository();
  const token = await tokenRepo.findActiveByHash(sha256(secret));
  if (!token) return null;

  const runtime = await new AgentRuntimeRepository().findById(token.runtimeId);
  if (!runtime || String(runtime.starshipId) !== String(token.starshipId)) return null;

  // Best-effort last-used bump (do not block the request on it).
  void tokenRepo.touchLastUsed(token.id).catch(() => undefined);

  const personas = await new AgentPersonaRepository().listByRuntime(runtime.id);
  const canWrite = personas.some((p) => p.accessRole === 'contributor');

  return {
    runtimeId: runtime.id,
    starshipId: token.starshipId,
    tokenId: token.id,
    canWrite,
  };
}
