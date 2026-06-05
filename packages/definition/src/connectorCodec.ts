import type { ConnectorModel } from '@starships/protocol';
import type { ConnectorDefinition } from './types';
import { compact, dumpYaml, loadYaml, requireString } from './yaml';

/**
 * Codec between a {@link ConnectorModel} (index row) and its
 * `.autopilot/connectors/<provider>.yaml` file: the wiring only. Secrets live in
 * connector_secrets (DB) and never touch the file; runtime health
 * (status/lastError) is index-only. One connector per provider per starship, so
 * the provider is the filename.
 */

export function connectorFilename(provider: string): string {
  return `${provider}.yaml`;
}

export function connectorProviderFromFilename(filename: string): string {
  return filename.replace(/\.yaml$/i, '');
}

export function connectorModelToDefinition(connector: ConnectorModel): ConnectorDefinition {
  return compact({
    id: connector.id,
    provider: connector.provider,
    templateId: connector.templateId,
    version: connector.version,
    metadata: connector.metadata && Object.keys(connector.metadata).length > 0 ? connector.metadata : undefined,
  }) as ConnectorDefinition;
}

export function serializeConnectorDefinition(def: ConnectorDefinition): string {
  return dumpYaml(
    compact({
      id: def.id,
      provider: def.provider,
      templateId: def.templateId,
      version: def.version,
      metadata: def.metadata && Object.keys(def.metadata).length > 0 ? def.metadata : undefined,
    })
  );
}

export function serializeConnector(connector: ConnectorModel): string {
  return serializeConnectorDefinition(connectorModelToDefinition(connector));
}

export function parseConnector(raw: string): ConnectorDefinition {
  const data = loadYaml(raw);
  const metadata =
    data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
      ? (data.metadata as Record<string, unknown>)
      : undefined;
  return compact({
    id: requireString(data, 'id', 'connector'),
    provider: requireString(data, 'provider', 'connector'),
    templateId: typeof data.templateId === 'string' ? data.templateId : undefined,
    version: typeof data.version === 'string' ? data.version : undefined,
    metadata,
  }) as ConnectorDefinition;
}
