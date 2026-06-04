import type { ConnectorProvider } from '@starships/protocol';
import { bootstrapCodeConnectors, connectorRegistry, resetCodeConnectorBootstrap } from '@starships/connectors';
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

/**
 * Idempotently bootstrap the in-process connector registry. Safe to call from anywhere
 * that needs the registry populated (clients, strategy dispatch, action execution).
 *
 * Delegates to the connectors package so the registered set has a single source of
 * truth shared with the agent's catalog builder (see @starships/connectors/bootstrap).
 */
export function ensureConnectorRegistry(): void {
  bootstrapCodeConnectors();
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
    resetCodeConnectorBootstrap();
  }
}
