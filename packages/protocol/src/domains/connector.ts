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

// ============================================================================
// CONNECTOR TEMPLATE RUNTIME CONFIG (runtime_config JSON)
// ============================================================================

/**
 * ConnectorTokenRef
 *
 * References a secret used by connector runtime.
 *
 * Supported formats:
 * - Legacy string:
 *   - Per-starship secret key: "GH_APP_ACCESS_TOKEN"
 *   - Platform secret ref: "platform:DISCORD_BOT_TOKEN"
 * - Explicit object (preferred):
 *   - { type: "connector_secret", key: "GH_APP_ACCESS_TOKEN" }
 *   - { type: "platform_secret",  key: "DISCORD_BOT_TOKEN" }
 */
export type ConnectorSecretRefType = 'platform_secret' | 'connector_secret';

export interface ConnectorSecretRef {
  type: ConnectorSecretRefType;
  key: string;
}

export type ConnectorTokenRef = ConnectorSecretRef;

/**
 * ConnectorOAuthRuntimeConfig
 *
 * Configuration under connector_templates.runtime_config.oauth.
 * This is intentionally open-ended (extends Record) to support DB-driven providers.
 */
export interface ConnectorOAuthRuntimeConfig extends Record<string, unknown> {
  // OAuth app credentials (host/platform secrets)
  clientId?: ConnectorTokenRef; // secret ref holding the OAuth client id
  clientSecret?: ConnectorTokenRef; // secret ref holding the OAuth client secret

  // Stored credentials (per-starship connector_secrets) OR platform refs
  accessToken?: ConnectorTokenRef;
  refreshToken?: ConnectorTokenRef; // secret ref holding refresh token
  apiKey?: ConnectorTokenRef; // secret ref holding api key

  // OAuth endpoints + behavior
  authorizeUrl?: string;
  tokenUrl?: string;
  redirectPath?: string;
  scopes?: string[];
  params?: Record<string, unknown>;
  /**
   * Optional allowlist of callback query keys to copy into persisted connector metadata.
   * Example (Discord): ["guild_id", "permissions"]
   */
  metadataFromQuery?: string[];

  // HostRuntime HTTP auth injection behavior
  authHeaderName?: string;
  authPrefix?: string; // e.g. "Bearer", "Bot", or "" for no prefix
}

/**
 * ConnectorRuntimeConfig
 *
 * Root configuration for connector templates (connector_templates.runtime_config).
 * Still open-ended, but with common keys typed.
 */
export interface ConnectorRuntimeConfig extends Record<string, unknown> {
  apiBaseUrl?: string;
  oauth?: ConnectorOAuthRuntimeConfig;

  // Host-only special behavior
  usesPlatformJwt?: boolean; // used by the internal "starships" connector
}

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
  /**
   * Non-secret connector metadata from the connectors row.
   * For example, Discord stores guild_id and permissions here.
   */
  metadata?: Record<string, unknown>;
}

export interface ConnectorListResponse {
  connectors: ConnectorListItem[];
}

export type ConnectorAuthType = 'oauth2' | 'api_key' | 'custom' | 'none';

export interface ConnectorCatalogItem {
  provider: ConnectorProvider;
  displayName: string;
  description: string;
  authType: ConnectorAuthType;
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
  isEnabled: boolean;
  version: string;
  category: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * ConnectorTemplateAdminModel
 *
 * Instance-admin view of a connector template, including runtime configuration
 * and (optional) inline autopilot blueprints.
 */
export interface ConnectorTemplateAdminModel extends ConnectorTemplateModel {
  runtimeConfig: ConnectorRuntimeConfig;
  connectBlueprint?: Record<string, unknown> | null;
  refreshBlueprint?: Record<string, unknown> | null;
  testBlueprint?: Record<string, unknown> | null;
}

// ============================================================================
// ADMIN (INSTANCE ADMIN ONLY) - CONNECTOR TEMPLATE MANAGEMENT
// ============================================================================

export interface AdminConnectorTemplateListResponse {
  connectors: ConnectorTemplateModel[];
}

export interface AdminConnectorTemplateResponse {
  connector: ConnectorTemplateAdminModel;
}

export interface UpdateConnectorTemplateRequest {
  displayName?: string;
  description?: string;
  authType?: ConnectorAuthType;
  isEnabled?: boolean;
  version?: string;
  category?: string;
  runtimeConfig?: ConnectorRuntimeConfig;
  connectBlueprint?: Record<string, unknown> | null;
  refreshBlueprint?: Record<string, unknown> | null;
  testBlueprint?: Record<string, unknown> | null;
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
   * Provider-specific configuration derived from connector_templates.runtime_config.
   * Must never contain raw secrets; those remain server-side only. Blueprints may
   * rely on this config for non-secret options such as env key names, OAuth
   * parameters, or other connector behavior hints.
   */
  config?: ConnectorRuntimeConfig;
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
  config?: ConnectorRuntimeConfig;
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
  config?: ConnectorRuntimeConfig;
}

export interface ConnectorTestOutput {
  ok: boolean;
  error?: string;
  details?: Record<string, unknown>;
}
