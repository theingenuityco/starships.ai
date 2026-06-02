/**
 * Bridges the @starships/connectors AuthStrategy context (ConnectorEnv, SecretResolver,
 * HostTokenMinter) to server services, and provides the dispatch predicate used to route
 * code-driven connectors (e.g. GitHub App) through their strategy instead of the legacy
 * OAuth/api-key/basic code paths.
 */

import type { ConnectorEnv, HostTokenMinter, SecretResolver } from '@starships/connectors';
import { connectorRegistry } from '@starships/connectors';
import type { ConnectorProvider, SecretRef } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { PlatformSecretService } from './PlatformSecretService';
import { generateJWT } from '@/utils/jwt';
import { ensureConnectorRegistry } from './ConnectorRegistryClient';

const platformSecrets = new PlatformSecretService();

/** Env access for strategies: prefer process.env, fall back to the validated config. */
export const connectorEnv: ConnectorEnv = {
  get(key: string): string | undefined {
    const fromProc = process.env[key];
    if (typeof fromProc === 'string' && fromProc.length > 0) return fromProc;
    try {
      const cfg = getEnvConfig() as unknown as Record<string, unknown>;
      const v = cfg[key];
      return typeof v === 'string' && v.length > 0 ? v : undefined;
    } catch {
      return undefined;
    }
  },
};

/**
 * SecretResolver backed by platform secrets (instance-admin managed) and a snapshot of
 * decrypted connector secrets for the current starship/connector.
 */
export function makeSecretResolver(decryptedConnectorSecrets: Record<string, unknown> = {}): SecretResolver {
  return {
    async resolve(ref: SecretRef): Promise<string | undefined> {
      if (ref.type === 'platform_secret') {
        const v = await platformSecrets.getSecret(ref.key);
        return typeof v === 'string' && v.trim() ? v.trim() : undefined;
      }
      const raw = decryptedConnectorSecrets[ref.key];
      return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
    },
  };
}

/** Host token minter for platform_jwt connectors (uses the server JWT signing path). */
export const hostTokenMinter: HostTokenMinter = {
  platformJwt(claims: { id: string; starshipId: string }): Promise<string> {
    return generateJWT({ id: claims.id, starshipId: claims.starshipId });
  },
};

/**
 * True when the provider is a hand-written code connector whose connect/session
 * lifecycle must be dispatched to its AuthStrategy rather than the legacy code paths.
 * Today this is the GitHub App connector.
 */
export function isStrategyDispatchProvider(provider: ConnectorProvider | string): boolean {
  ensureConnectorRegistry();
  return connectorRegistry.get(provider)?.auth.kind === 'github_app';
}
