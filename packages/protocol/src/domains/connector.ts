/**
 * Connector Types
 *
 * Types for managing third-party connectors at the starship level.
 */

// ============================================================================
// CONNECTOR TYPES
// ============================================================================

/**
 * ConnectorProvider
 *
 * Historically this was a closed union of first-party providers. To allow
 * entirely DB-driven connectors, this is now an open string type. Known
 * first-party providers are kept as a documentation aid only.
 */
export type ConnectorProvider = 'linkedin' | 'discord' | 'starships' | 'google_drive' | 'github' | string;

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
  templateId?: string;
  version?: string;
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

/**
 * ConnectorTemplate
 *
 * Template-level definition of a connector (connector_templates table),
 * mirroring the patterns used for AgentTemplate and ToolTemplate.
 */
export interface ConnectorTemplateModel {
  id: string;
  slug: string;
  provider: ConnectorProvider;
  displayName: string;
  description: string;
  authType: ConnectorAuthType;
  requiredEnvKeys: string[];
  optionalEnvKeys?: string[];
  docsSlug?: string;
  version: string;
  category: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectWithApiKeyRequest {
  apiKey: string;
  extraConfig?: Record<string, unknown>;
}

export interface ConnectWithApiKeyResponse {
  connector: ConnectorModel;
}

// Reserved for future request fields; currently empty.
export type StartOAuthRequest = Record<string, never>;

export interface StartOAuthResponse {
  authorizationUrl: string;
}

// ============================================================================
// CONNECTOR BLUEPRINT IO CONTRACTS
// ============================================================================

export interface ConnectorConnectInput {
  starshipId: string;
  provider: ConnectorProvider;

  authType: ConnectorAuthType;
  phase: 'start' | 'complete';

  // OAuth-specific fields
  authorizeUrl?: string;
  tokenUrl?: string;
  scopes?: string[];
  redirectPath?: string;
  stateToken?: string;
  code?: string;
  callbackQuery?: Record<string, unknown>;

  // API key / custom payload from HTTP API
  apiKeyPayload?: {
    apiKey?: string;
    extraConfig?: Record<string, unknown>;
  };

  /**
   * Provider-specific configuration derived from connector_providers.runtime_config.
   * Must never contain raw secrets; those remain server-side only.
   */
  config?: Record<string, unknown>;
}

export interface ConnectorConnectOutput {
  /**
   * For OAuth "start" phase, the URL the client should redirect the user to.
   */
  authorizationUrl?: string;

  /**
   * Environment variables to persist for this connector (per starship).
   * Keys map directly to the existing environments table.
   */
  env?: Record<string, string>;

  /**
   * Connector metadata to persist on the connectors row.
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional status override for the connector after this flow completes.
   */
  status?: ConnectorStatus;

  /**
   * Optional lastError value for the connector.
   */
  lastError?: string;
}

export interface ConnectorRefreshInput {
  starshipId: string;
  provider: ConnectorProvider;
  envSnapshot: Record<string, string>;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface ConnectorRefreshOutput {
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  status?: ConnectorStatus;
  lastError?: string;
}

export interface ConnectorTestInput {
  starshipId: string;
  provider: ConnectorProvider;
  envSnapshot: Record<string, string>;
  metadata?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface ConnectorTestOutput {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}
