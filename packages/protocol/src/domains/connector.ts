/**
 * Connector Types
 *
 * Types for managing third-party connectors at the starship level.
 */

// ============================================================================
// CONNECTOR TYPES
// ============================================================================

export type ConnectorProvider = 'linkedin' | 'discord' | 'starships' | 'google_drive' | 'github';

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

export interface ConnectorListItem {
  id: string;
  starshipId: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * OAuth scopes requested for this connector (if applicable).
   * For non-OAuth connectors, this may be an empty array or undefined.
   */
  scopes?: string[];
}

export interface ConnectorListResponse {
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
