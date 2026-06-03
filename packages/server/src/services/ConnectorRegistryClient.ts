import type { ConnectorProvider } from '@starships/protocol';
import { connectorRegistry, githubConnector, starshipsConnector, systemConnector } from '@starships/connectors';
import type { ConnectorTemplateEntityLike } from './ConnectorTemplateRegistryClient';

/**
 * ConnectorRegistryClient
 *
 * Backed by the in-process @starships/connectors registry. Every connector is code:
 * registered via registerCode() and owning its actions as plain functions. The declarative
 * bundle-template path has been retired (legacy templates are parked under
 * packages/bundle-service/bundles/_legacy for reference).
 *
 * Returns ConnectorTemplateEntityLike-shaped objects (ConnectorRuntimeTemplate is
 * structurally identical), so all existing consumers work unchanged.
 */

let registered = false;

/** Register hand-written code connectors. */
function registerCodeConnectors(): void {
  connectorRegistry.registerCode(githubConnector);
  connectorRegistry.registerCode(starshipsConnector);
  connectorRegistry.registerCode(systemConnector);
}

/**
 * Idempotently bootstrap the in-process connector registry. Safe to call from anywhere
 * that needs the registry populated (clients, strategy dispatch, action execution).
 */
export function ensureConnectorRegistry(): void {
  if (registered) return;
  registerCodeConnectors();
  registered = true;
}

export class ConnectorRegistryClient {
  async list(): Promise<ConnectorTemplateEntityLike[]> {
    ensureConnectorRegistry();
    return connectorRegistry.listRuntimeTemplates();
  }

  async findByProvider(provider: ConnectorProvider): Promise<ConnectorTemplateEntityLike | null> {
    ensureConnectorRegistry();
    return connectorRegistry.runtimeTemplate(provider) ?? null;
  }

  async findById(id: string): Promise<ConnectorTemplateEntityLike | null> {
    ensureConnectorRegistry();
    return connectorRegistry.listRuntimeTemplates().find((t) => t.id === id || t.provider === id) ?? null;
  }

  /** Re-scan on next access. */
  invalidate(): void {
    registered = false;
  }
}
