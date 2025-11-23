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
 * `environments` table and consumed exclusively by server-side connector
 * execution; they are never exposed to workflows or templates.
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
    description:
      'Connect a Discord bot to enable tools that send messages or notifications to your Discord servers via an installed bot.',
    authType: 'oauth2',
    requiredEnvKeys: [],
    optionalEnvKeys: [],
    docsSlug: '/public-docs/environment#discord-connector',
  },
  {
    provider: 'google_drive',
    displayName: 'Google Drive',
    description: 'Connect a Google Drive account to enable tools that list, read, and write files via the Google Drive API.',
    authType: 'oauth2',
    // Google Drive connector expects an access token managed in the starship environment.
    // You can provision this token via an external OAuth flow and store it as
    // GOOGLE_DRIVE_ACCESS_TOKEN for now.
    requiredEnvKeys: ['GOOGLE_DRIVE_ACCESS_TOKEN'],
    optionalEnvKeys: ['GOOGLE_DRIVE_REFRESH_TOKEN'],
    docsSlug: '/public-docs/environment#google-drive-connector',
  },
  {
    provider: 'github',
    displayName: 'GitHub',
    description:
      'Connect a GitHub account to enable tools that read and write repositories, issues, and pull requests via the GitHub API.',
    authType: 'oauth2',
    // GitHub connector expects an access token managed in the starship environment.
    // The token is obtained via the GitHub connector OAuth flow and stored as
    // GITHUB_ACCESS_TOKEN for the starship.
    requiredEnvKeys: ['GITHUB_ACCESS_TOKEN'],
    optionalEnvKeys: [],
    docsSlug: '/public-docs/environment#github-connector',
  },
  {
    provider: 'starships',
    displayName: 'Starships',
    description:
      'Use the Starships API itself (tools, docs, models, etc.) as a connector-backed capability for this starship.',
    authType: 'oauth2',
    // Starships connector reuses the platform\'s existing JWT + SERVER_URL; no extra env keys are required.
    requiredEnvKeys: [],
    optionalEnvKeys: [],
    docsSlug: '/public-docs/environment#starships-connector',
  },
];

export function getConnectorCatalog(): ConnectorCatalogEntry[] {
  return CONNECTOR_CATALOG;
}

export function getConnectorDefinition(provider: ConnectorProvider): ConnectorCatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((entry) => entry.provider === provider);
}
