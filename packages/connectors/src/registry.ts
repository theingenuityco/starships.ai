/**
 * ConnectorRegistry — the in-process source of truth for connectors.
 *
 * Code connectors (hand-written, e.g. GitHub App) take precedence over declarative
 * connectors registered from JSON templates with the same provider. The server
 * consumes `listRuntimeTemplates()` exactly where it consumes the template registry
 * client today, and dispatches connect/session flows through each definition's
 * AuthStrategy.
 */

import type { ConnectorProvider } from '@starships/protocol';
import type { ConnectorCatalogEntry, ConnectorDefinition, ConnectorRuntimeTemplate } from './types';
import { codeActionToEndpoint } from './framework';

export class ConnectorRegistry {
  private readonly codeDefs = new Map<string, ConnectorDefinition>();

  /** Register a hand-written code connector. */
  registerCode(def: ConnectorDefinition): void {
    this.codeDefs.set(def.provider, def);
  }

  get(provider: ConnectorProvider): ConnectorDefinition | undefined {
    return this.codeDefs.get(provider);
  }

  list(): ConnectorDefinition[] {
    return [...this.codeDefs.values()];
  }

  /** Runtime template fields for every connector, structurally compatible with the server's consumer. */
  listRuntimeTemplates(): ConnectorRuntimeTemplate[] {
    return this.list().map((def) => toRuntimeTemplate(def));
  }

  runtimeTemplate(provider: ConnectorProvider): ConnectorRuntimeTemplate | undefined {
    const def = this.get(provider);
    return def ? toRuntimeTemplate(def) : undefined;
  }

  /** Catalog entries for enabled connectors, to drive the connect UI. */
  catalog(): ConnectorCatalogEntry[] {
    return this.list()
      .filter((def) => def.isEnabled)
      .map((def) => ({
        provider: def.provider,
        name: def.name,
        description: def.description,
        auth: { type: def.auth.catalogAuthType },
        ...(def.demoVideoUrl ? { demoVideoUrl: def.demoVideoUrl } : {}),
        ...(def.oauthRequiredMetadataKeys ? { oauthRequiredMetadataKeys: def.oauthRequiredMetadataKeys } : {}),
        ...(def.metadataSchema ? { metadataSchema: def.metadataSchema } : {}),
        ...(def.auth.configFields ? { configFields: def.auth.configFields } : {}),
      }));
  }
}

/** Convert a ConnectorDefinition into the ConnectorRuntimeTemplate the runner/host consume. */
export function toRuntimeTemplate(def: ConnectorDefinition): ConnectorRuntimeTemplate {
  const authJson = def.auth.runtimeAuth();
  const now = new Date().toISOString();
  return {
    id: def.id,
    slug: def.id,
    provider: def.provider,
    name: def.name,
    description: def.description,
    ...(def.demoVideoUrl ? { demoVideoUrl: def.demoVideoUrl } : {}),
    authType: authJson.type,
    baseUrl: def.baseUrl,
    authJson,
    ...(def.variables ? { variablesJson: def.variables } : {}),
    ...(def.rateLimit ? { rateLimitJson: def.rateLimit } : {}),
    ...(def.metadataSchema ? { metadataSchemaJson: def.metadataSchema } : {}),
    ...(def.webhooks ? { webhooksJson: def.webhooks } : {}),
    version: def.version,
    category: def.category,
    usageCount: 0,
    isEnabled: def.isEnabled,
    createdAt: now,
    updatedAt: now,
    endpoints: def.actions.map(codeActionToEndpoint),
  };
}

/**
 * The shared registry singleton. Empty until the host bootstraps it (registers
 * declarative connectors from disk and any hand-written code connectors). This keeps
 * the package decoupled from where connector data lives and lets the host control
 * when a provider flips from declarative to code-driven.
 */
export const connectorRegistry = new ConnectorRegistry();
