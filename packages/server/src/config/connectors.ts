import type { ConnectorProvider, ConnectorAuthType } from './types';

export interface ConnectorCatalogEntry {
  provider: ConnectorProvider;
  displayName: string;
  description: string;
  authType: ConnectorAuthType;
  requiredEnvKeys: string[];
  optionalEnvKeys?: string[];
  docsSlug?: string;
}

/**
 * Static catalog of supported connectors.
 *
 * Secrets for these connectors are always stored in the existing
 * `environments` table and injected into the engine via secureEnv.
 */
export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
  {
    provider: 'linkedin',
    displayName: 'LinkedIn',
    description: 'Connect a LinkedIn account to enable tools that create and manage posts using the LinkedIn API.',
    authType: 'oauth2',
    requiredEnvKeys: ['LINKEDIN_ACCESS_TOKEN'],
    optionalEnvKeys: ['LINKEDIN_ORG_ID'],
    docsSlug: '/public-docs/environment#linkedin-connector',
  },
  {
    provider: 'discord',
    displayName: 'Discord',
    description: 'Connect a Discord bot token to enable tools that send messages or notifications to your Discord servers.',
    authType: 'api_key',
    requiredEnvKeys: ['DISCORD_BOT_TOKEN'],
    optionalEnvKeys: ['DISCORD_DEFAULT_CHANNEL_ID'],
    docsSlug: '/public-docs/environment#discord-connector',
  },
];

export function getConnectorCatalog(): ConnectorCatalogEntry[] {
  return CONNECTOR_CATALOG;
}

export function getConnectorDefinition(provider: ConnectorProvider): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((entry) => entry.provider === provider);
}
