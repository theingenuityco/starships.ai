/**
 * Connector Types
 *
 * Types for managing third-party connectors at the starship level.
 */

// ============================================================================
// CONNECTOR TYPES
// ============================================================================

export type ConnectorProvider = 'linkedin' | 'discord' | 'starships' | 'google_drive';

export type ConnectorStatus = 'disconnected' | 'pending' | 'connected' | 'error';

/**
 * Core connector entity
 */
export interface ConnectorModel {
  id: string;
  starshipId: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  metadata?: Record<string, unknown>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface ConnectorListItem extends ConnectorModel {
  managedEnvKeys: {
    key: string;
    present: boolean;
  }[];
}

export interface ConnectorListResponse {
  starshipId: string;
  connectors: ConnectorListItem[];
}

export type ConnectorAuthType = 'oauth2' | 'api_key';

export interface ConnectorCatalogItem {
  provider: ConnectorProvider;
  displayName: string;
  description: string;
  authType: ConnectorAuthType;
  requiredEnvKeys: string[];
  optionalEnvKeys?: string[];
  docsSlug?: string;
}

export interface ConnectorCatalogResponse {
  connectors: ConnectorCatalogItem[];
}

export interface ConnectWithApiKeyRequest {
  apiKey: string;
  extraConfig?: Record<string, unknown>;
}

export interface ConnectWithApiKeyResponse {
  connector: ConnectorModel;
}

export interface StartOAuthRequest {
  // reserved for future use
}

export interface StartOAuthResponse {
  authorizationUrl: string;
}
