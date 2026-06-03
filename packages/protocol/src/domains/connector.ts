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
// CONNECTOR TEMPLATE V2 (ROOT RUNTIME FIELDS)
// ============================================================================

/**
 * SecretRef
 *
 * References an encrypted secret value without embedding it in templates.
 * - platform_secret: instance-wide (managed by instance admins)
 * - connector_secret: per-starship (managed by connector connect flows)
 */
export type SecretRefType = 'platform_secret' | 'connector_secret';

export interface SecretRef {
  type: SecretRefType;
  key: string;
}

/**
 * ExprString
 *
 * String that may contain template expressions, interpreted by the HostRuntime.
 * Example: `"{{ String(args.channel).trim() }}"`
 */
export type ExprString = string;

export type JsonSchemaObject = Record<string, unknown>;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export type RequestStyle = 'auto' | 'query' | 'json' | 'form' | 'multipart';

/**
 * QueryParamEncoding
 *
 * Controls how query parameter values are encoded when constructing the final URL.
 * - standard: URLSearchParams-style percent-encoding (default, backwards compatible)
 * - none: do not encode the query value (preserve it exactly)
 */
export type QueryParamEncoding = 'standard' | 'none';

export type ConnectorQueryParamMapping =
  | ExprString
  | {
      value: ExprString;
      encoding?: QueryParamEncoding;
    };

export type MultipartPart =
  | {
      kind: 'field';
      name: string;
      value: ExprString;
      contentType?: string;
    }
  | {
      kind: 'file';
      name: string;
      /**
       * Expression resolving to a file-like object. Canonical expected shape:
       * `{ filename?: string; contentType?: string; base64: string }`
       */
      file: ExprString;
      contentType?: string;
      filename?: ExprString;
    };

export type ConnectorEndpointKindV2 = 'http' | 'sql';

export type SqlDriverV2 = 'postgres' | string;

export type SqlEndpointModeV2 = 'query' | 'execute';

export interface ConnectorHttpEndpointV2 {
  /**
   * Endpoint kind. Omitted implies "http" for backwards compatibility.
   */
  kind?: 'http';
  name: string; // action key used by connector_action.action
  description?: string;

  method: HttpMethod;
  path: string; // supports `{var}` placeholders
  baseUrlOverride?: string;

  /**
   * JSON Schema for validating connector_action.args for this endpoint.
   * If omitted, args are treated as `{}`.
   */
  parameters?: JsonSchemaObject;

  /**
   * Default mapping when `mapping` is not provided:
   * - auto: GET/HEAD -> query, others -> json
   */
  requestStyle?: RequestStyle;

  /**
   * Full-power mapping with explicit placement and expressions.
   * When provided, it overrides requestStyle defaults.
   */
  mapping?: {
    path?: Record<string, ExprString>;
    /**
     * Controls default encoding for all query params in `mapping.query`.
     * Defaults to 'standard' for backwards compatibility.
     */
    queryEncoding?: QueryParamEncoding;
    /**
     * Query string parameters. Values default to `queryEncoding` (or 'standard').
     * You can override encoding per param by using `{ value, encoding }`.
     */
    query?: Record<string, ConnectorQueryParamMapping>;
    headers?: Record<string, ExprString>;

    // JSON body mapping
    body?: Record<string, ExprString>;
    rawBody?: ExprString;

    // application/x-www-form-urlencoded
    form?: Record<string, ExprString>;

    // multipart/form-data
    multipart?: {
      parts: MultipartPart[];
    };
  };

  response?: {
    select?: ExprString;
  };

  timeoutMs?: number;
}

export interface ConnectorSqlEndpointV2 {
  kind: 'sql';
  name: string; // action key used by connector_action.action
  description?: string;

  driver: SqlDriverV2;

  /**
   * SQL string (may be an expression) evaluated by the HostRuntime.
   *
   * IMPORTANT: Use parameterization for user-provided values. The host/runtime
   * should not encourage string concatenation.
   */
  sql: ExprString;

  /**
   * JSON Schema for validating connector_action.args for this endpoint.
   */
  parameters?: JsonSchemaObject;

  /**
   * query: SELECT-like statements returning rows
   * execute: statements returning only rowCount/command (writes may be blocked by runtime policy)
   */
  mode?: SqlEndpointModeV2;

  /**
   * Optional hint to cap returned rows (runtime may enforce a stricter cap).
   */
  rowLimit?: number;

  /**
   * When true, the runtime should reject non-read-only statements.
   * Defaults to true when omitted.
   */
  readOnly?: boolean;

  response?: {
    select?: ExprString;
  };

  timeoutMs?: number;
}

export type ConnectorEndpointV2 = ConnectorHttpEndpointV2 | ConnectorSqlEndpointV2;

// ============================================================================
// CONNECTOR SESSIONS (HOST -> RUNNER) - NON-WORKFLOW
// ============================================================================

/**
 * ConnectorDbSessionV2
 *
 * Connection configuration passed from an embedding host (API server) to the runner.
 * This may include sensitive values (e.g. password) and must never be exposed to workflows.
 */
export interface ConnectorDbSessionV2 {
  driver: SqlDriverV2;
  host: string;
  port: number;
  database: string;
  user: string;
  /**
   * Sensitive: database password (or token) for authentication.
   */
  password?: string;
  /**
   * SSL/TLS controls. Runtimes may override for safety.
   */
  ssl?: boolean;
}

export interface ConnectorSessionV2 {
  headers?: Record<string, string>;
  db?: ConnectorDbSessionV2;
}

/**
 * ConnectorAuthV2
 *
 * Declarative auth configuration stored on connector_templates.auth_json.
 * Must never contain raw secret values; only SecretRefs.
 */
/**
 * Connector auth descriptor types. 'github_app' is a host-side connect kind (GitHub
 * App installation, bot identity) surfaced to the catalog/UI; it is NOT a member of
 * the declarative ConnectorAuthV2 union (its runtime auth degrades to { type: 'none' }
 * with a host-minted installation token injected via the session headers).
 */
export type ConnectorAuthTypeV2 = 'oauth2' | 'api_key' | 'basic' | 'platform_jwt' | 'none' | 'github_app';

export interface ConnectorAuthNoneV2 {
  type: 'none';
}

export interface ConnectorAuthPlatformJwtV2 {
  type: 'platform_jwt';
  headerName?: string; // default "Authorization"
  tokenPrefix?: string; // default "Bearer"
}

export interface ConnectorAuthApiKeyV2 {
  type: 'api_key';
  apiKeyRef: SecretRef;
  injection: {
    style: 'header' | 'query';
    headerName?: string; // default "Authorization"
    queryParamName?: string; // required when style = query
    tokenPrefix?: string; // default "" (raw key)
  };
}

/**
 * ConnectorAuthBasicV2
 *
 * HTTP Basic Authentication (RFC 7617):
 * Authorization: Basic base64("username:password")
 *
 * Common API-key-only case:
 * - usernameRef = API key
 * - passwordRef omitted (defaults to empty string)
 * -> base64("API_KEY:")
 */
export interface ConnectorAuthBasicV2 {
  type: 'basic';
  usernameRef: SecretRef;
  passwordRef?: SecretRef; // optional (defaults to empty string if omitted)
  headerName?: string; // default "Authorization"
}

export interface ConnectorAuthOAuth2V2 {
  type: 'oauth2';

  clientIdRef: SecretRef; // must be platform_secret
  clientSecretRef: SecretRef; // must be platform_secret

  authorizationUrl: string;
  tokenUrl: string;

  scopes?: string[];
  scopeDelimiter?: ' ' | ',';
  extraAuthorizeParams?: Record<string, string>;

  accessTokenRef: SecretRef;
  refreshTokenRef?: SecretRef;

  /**
   * How to authenticate the token exchange request.
   * - 'body' (default): client_id + client_secret in the POST form body
   * - 'basic': HTTP Basic Auth header (required by Notion, some others)
   */
  tokenAuthStyle?: 'body' | 'basic';

  injection: {
    style: 'header' | 'query';
    headerName?: string; // default "Authorization"
    queryParamName?: string; // required when style = query
    tokenPrefix?: string; // default "Bearer"
  };

  tokenResponse?: {
    accessTokenField?: string; // default "access_token"
    refreshTokenField?: string; // default "refresh_token"
    expiresInField?: string; // default "expires_in"
    scopeField?: string; // default "scope"
    tokenTypeField?: string; // default "token_type"
  };
}

export type ConnectorAuthV2 =
  | ConnectorAuthNoneV2
  | ConnectorAuthPlatformJwtV2
  | ConnectorAuthApiKeyV2
  | ConnectorAuthBasicV2
  | ConnectorAuthOAuth2V2;

export interface ConnectorTemplateRuntimeFieldsV2 {
  baseUrl: string;
  auth: ConnectorAuthV2;
  variables?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    source: 'args' | 'metadata' | 'runtimeEnv';
    key: string;
    transform?: ExprString;
  }>;
  endpoints: ConnectorEndpointV2[];
  rateLimit?: {
    tier?: string;
    burstLimit?: number;
    requestsPerMinute?: number;
  };
  metadataSchema?: JsonSchemaObject;
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

  /**
   * Template fields for this connector provider, joined from connector_templates.
   *
   * NOTE: This intentionally mixes concerns (connector instance + template definition),
   * but is convenient for callers that need runtime endpoint definitions (e.g. Daedalus).
   */
  template?: ConnectorTemplateRuntimePublicModel;
}

/**
 * ConnectorTemplateRuntimePublicModel
 *
 * Public (non-admin) view of connector template runtime fields that are safe to
 * expose broadly, typically to drive UI or agent/runtime decisions.
 */
export interface ConnectorTemplateRuntimePublicModel {
  id: string;
  provider: ConnectorProvider;
  name: string;
  description: string;
  /**
   * Minimal auth descriptor for UI/catalog decisions without exposing full auth config.
   * Source of truth is connector_templates.auth_json.type.
   */
  auth: { type: ConnectorAuthTypeV2 };
  version: string;
  category: string;

  // runtime fields
  baseUrl: string;
}

export interface ConnectorListResponse {
  connectors: ConnectorListItem[];
}

/**
 * A platform-level configuration field for a connector (e.g. GitHub App credentials).
 * Collected from an instance admin and stored as platform secrets. Never carries values.
 */
export interface ConnectorConfigField {
  key: string;
  label: string;
  type: 'string' | 'password' | 'textarea' | 'file';
  required: boolean;
  description?: string;
  /** For type 'file': the accept attribute hint (e.g. '.pem,.txt'). */
  accept?: string;
}

export interface ConnectorCatalogItem {
  provider: ConnectorProvider;
  name: string;
  description: string;
  auth: { type: ConnectorAuthTypeV2 };
  /**
   * Optional demo video URL (e.g. YouTube) used for
   * in-product connector education in the Connect Apps step.
   */
  demoVideoUrl?: string;
  /**
   * For OAuth2 connectors whose OAuth URLs contain {{vars}} (e.g. a tenant subdomain),
   * the client should collect these values before initiating OAuth.
   */
  oauthRequiredMetadataKeys?: string[];
  /**
   * Optional JSON schema describing connector metadata. Safe to expose (non-secret).
   * Used by the UI to validate pre-OAuth metadata inputs.
   */
  metadataSchema?: JsonSchemaObject;
  /**
   * True when this connector needs instance-wide platform config (e.g. a GitHub App)
   * before it can be connected. When true, `configured` reflects whether that setup is done.
   */
  configurable?: boolean;
  configured?: boolean;
  /** The platform-level fields an instance admin must provide (never includes values). */
  configFields?: ConnectorConfigField[];
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
  name: string;
  description: string;
  auth: { type: ConnectorAuthTypeV2 };
  /**
   * Optional demo video URL for this connector template.
   * Intended for short product walkthroughs in the UI.
   */
  demoVideoUrl?: string;
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
 * Instance-admin view of a connector template, including runtime fields.
 */
export interface ConnectorTemplateAdminModel extends ConnectorTemplateModel {
  demoVideoUrl?: string;
  baseUrl: string;
  auth: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  rateLimit?: ConnectorTemplateRuntimeFieldsV2['rateLimit'];
  metadataSchema?: ConnectorTemplateRuntimeFieldsV2['metadataSchema'];
}

// ============================================================================
// ADMIN (INSTANCE ADMIN ONLY) - CONNECTOR TEMPLATE MANAGEMENT
// ============================================================================

export interface AdminConnectorTemplateListResponse {
  connectors: ConnectorTemplateModel[];
  /**
   * Total number of connector templates.
   * Included to support reliable pagination/hasMore calculations if the UI paginates client-side.
   */
  total: number;
}

export interface AdminConnectorTemplateResponse {
  connector: ConnectorTemplateAdminModel;
}

export interface AdminConnectorTemplateImportResponse {
  connector: ConnectorTemplateAdminModel;
  /**
   * True when a new template was created; false when an existing template was updated (upsert).
   */
  created: boolean;
  warnings?: string[];
}

export interface AdminConnectorTemplateDeleteResponse {
  /**
   * Human-readable confirmation message returned after deleting a template.
   */
  message: string;
  /**
   * Number of connectors that were deleted as part of the cascade.
   */
  deletedConnectors?: number;
}

export interface UpdateConnectorTemplateRequest {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  version?: string;
  demoVideoUrl?: string;
  category?: string;
  baseUrl?: string;
  auth?: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  rateLimit?: ConnectorTemplateRuntimeFieldsV2['rateLimit'];
  metadataSchema?: ConnectorTemplateRuntimeFieldsV2['metadataSchema'];
}

export interface CreateConnectorTemplateRequest {
  /**
   * Optional explicit id. If omitted, server defaults to provider (stable ids for templates).
   */
  id?: string;
  /**
   * Optional explicit slug. If omitted, server generates a unique slug.
   */
  slug?: string;
  provider: ConnectorProvider;
  name: string;
  description: string;
  isEnabled?: boolean;
  version?: string;
  category?: string;
  demoVideoUrl?: string;

  // runtime fields (root columns in connector_templates)
  baseUrl: string;
  auth: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  rateLimit?: ConnectorTemplateRuntimeFieldsV2['rateLimit'];
  metadataSchema?: ConnectorTemplateRuntimeFieldsV2['metadataSchema'];
}

// ============================================================================
// ADMIN (INSTANCE ADMIN ONLY) - CONNECTOR TEMPLATE ACTION CATALOG
// ============================================================================

export interface ConnectorTemplateActionSummary {
  templateId: string;
  actionName: string;
  ordinal: number;
  method: HttpMethod;
  path: string;
  description?: string;
  baseUrlOverride?: string;
  timeoutMs?: number;
  requestStyle?: RequestStyle;
  updatedAt: string;
}

export interface AdminConnectorTemplateActionsListResponse {
  actions: ConnectorTemplateActionSummary[];
  limit: number;
  offset: number;
  /**
   * Total number of matching actions (ignores pagination).
   * Used for reliable pagination/hasMore calculations.
   */
  total: number;
  q?: string;
}

export interface AdminConnectorTemplateActionResponse {
  action: ConnectorEndpointV2;
}

export interface UpsertConnectorTemplateActionRequest {
  action: ConnectorEndpointV2;
  ordinal?: number;
}

export interface BulkReplaceConnectorTemplateActionsRequest {
  actions: ConnectorEndpointV2[];
}

export interface ConnectWithApiKeyRequest {
  apiKey: string;
  extraConfig?: Record<string, unknown>;
}

export interface ConnectWithApiKeyResponse {
  connector: ConnectorModel;
}

export interface ConnectWithBasicAuthRequest {
  username: string;
  /**
   * Optional; only required if the connector template auth config includes passwordRef.
   * When omitted and passwordRef is not configured, the runtime defaults to empty password.
   */
  password?: string;
  extraConfig?: Record<string, unknown>;
}

export interface ConnectWithBasicAuthResponse {
  connector: ConnectorModel;
}

/**
 * StartOAuthRequest
 *
 * Optional metadata that may be required to construct dynamic OAuth URLs
 * (e.g. a tenant subdomain).
 */
export interface StartOAuthRequest {
  metadata?: Record<string, unknown>;
  /**
   * Optional post-auth redirect path within the Starships UI.
   * Must be a relative path beginning with `/` (server will validate).
   *
   * Used to return users back to the onboarding conversation after connecting a connector.
   */
  returnUrl?: string;
}

export interface StartOAuthResponse {
  authorizationUrl: string;
}

// ============================================================================
// CONNECTOR ACTION (connector_action node) IO CONTRACTS
// ============================================================================

export interface ConnectorActionRequest {
  connector: ConnectorProvider;
  action: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface ConnectorActionResponse {
  status: number;
  statusText: string;
  headers: Record<string, unknown>;
  body: unknown;
  url: string;
  /**
   * Optional convenience projection when endpoint.response.select is configured.
   */
  selected?: unknown;
}

// ============================================================================
// CONNECTOR EVENTS (INBOUND)
// ============================================================================

/**
 * Normalized connector event model, persisted server-side.
 *
 * NOTE: Connector providers vary widely; eventType is an open string.
 */
export interface ConnectorEventModel {
  id: string;
  starshipId: string;
  connectorId: string;
  provider: ConnectorProvider;
  eventType: string;
  /**
   * Provider-supplied stable identifier for deduplication (nullable).
   */
  externalEventId?: string | null;
  /**
   * Normalized event payload (JSON-safe).
   */
  payloadJson: Record<string, unknown>;
  /**
   * Optional raw payload (for debugging/audit).
   */
  rawPayloadJson?: Record<string, unknown> | null;
  /**
   * Optional captured headers (for debugging; sensitive values should be redacted server-side).
   */
  headersJson?: Record<string, unknown> | null;
  receivedAt: string;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
