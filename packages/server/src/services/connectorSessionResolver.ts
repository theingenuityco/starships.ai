/**
 * Shared per-connector session resolution.
 *
 * Builds a connector's runtime auth session + instance metadata for a starship using its
 * AuthStrategy. This is the single path both ConnectorActionExecutor (to run actions) and
 * the native git-workspace flow (to obtain the GitHub installation token) use, so the
 * server no longer ships connector sessions to the runner.
 */

import type { ConnectorProvider, ConnectorSessionV2 } from '@starships/protocol';
import { connectorRegistry } from '@starships/connectors';
import { ConnectorRepository } from '@starships/models';
import { ConnectorSecretService } from './ConnectorSecretService';
import { PlatformSecretService } from './PlatformSecretService';
import { ensureConnectorRegistry } from './ConnectorRegistryClient';
import { connectorEnv, makeSecretResolver, hostTokenMinter } from './connectorStrategy';

const connectorRepo = new ConnectorRepository();
const connectorSecrets = new ConnectorSecretService();
const platformSecrets = new PlatformSecretService();

export interface ConnectorContext {
  metadata: Record<string, unknown>;
  session: ConnectorSessionV2 | null;
}

/** Resolve a connector's metadata + auth session for a starship. Returns null context when the connector is unknown. */
export async function resolveConnectorContext(
  provider: ConnectorProvider,
  starshipId: string,
  authUserId: string
): Promise<ConnectorContext> {
  ensureConnectorRegistry();
  const def = connectorRegistry.get(provider);
  if (!def) return { metadata: {}, session: null };

  const rows = await connectorRepo.findByStarship(starshipId);
  const conn = rows.find((c) => c.provider === provider);
  let metadata: Record<string, unknown> = (conn?.metadata as Record<string, unknown>) ?? {};
  if (provider === 'system') {
    metadata = { ...metadata, ...(await systemZones()) };
  }

  const decrypted = await connectorSecrets.getDecryptedSecrets(starshipId);
  const session = await def.auth.buildSession({
    starshipId,
    authUserId,
    env: connectorEnv,
    secrets: makeSecretResolver(decrypted as Record<string, unknown>),
    metadata,
    tokens: hostTokenMinter,
  });

  return { metadata, session };
}

/** Convenience: just the session (used by the git-credential flow). */
export async function buildConnectorSession(
  provider: ConnectorProvider,
  starshipId: string,
  authUserId: string
): Promise<ConnectorSessionV2 | null> {
  return (await resolveConnectorContext(provider, starshipId, authUserId)).session;
}

/** Reserved "system" connector zone metadata, sourced from platform secrets. */
async function systemZones(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    const webFetchZone = await platformSecrets.getSecret('SYSTEM_CONNECTOR_WEBFETCH_ZONE');
    const webSearchZone = await platformSecrets.getSecret('SYSTEM_CONNECTOR_WEBSEARCH_ZONE');
    if (typeof webFetchZone === 'string' && webFetchZone.trim()) out.webFetchZone = webFetchZone.trim();
    if (typeof webSearchZone === 'string' && webSearchZone.trim()) out.webSearchZone = webSearchZone.trim();
  } catch {
    // best-effort
  }
  return out;
}
