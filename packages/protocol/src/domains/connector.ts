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

export interface ConnectorEndpointV2 {
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

/**
 * ConnectorAuthV2
 *
 * Declarative auth configuration stored on connector_templates.auth_json.
 * Must never contain raw secret values; only SecretRefs.
 */
export type ConnectorAuthTypeV2 = 'oauth2' | 'api_key' | 'basic' | 'platform_jwt' | 'none';

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
  endpoints: ConnectorEndpointV2[];
}

export interface ConnectorListResponse {
  connectors: ConnectorListItem[];
}

export interface ConnectorCatalogItem {
  provider: ConnectorProvider;
  name: string;
  description: string;
  auth: { type: ConnectorAuthTypeV2 };
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
  baseUrl: string;
  auth: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  endpoints: ConnectorEndpointV2[];
  rateLimit?: ConnectorTemplateRuntimeFieldsV2['rateLimit'];
  metadataSchema?: ConnectorTemplateRuntimeFieldsV2['metadataSchema'];
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

export interface AdminConnectorTemplateImportResponse {
  connector: ConnectorTemplateAdminModel;
  /**
   * True when a new template was created; false when an existing template was updated (upsert).
   */
  created: boolean;
  warnings?: string[];
}

export interface UpdateConnectorTemplateRequest {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  version?: string;
  category?: string;
  baseUrl?: string;
  auth?: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  endpoints?: ConnectorEndpointV2[];
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

  // runtime fields (root columns in connector_templates)
  baseUrl: string;
  auth: ConnectorAuthV2;
  variables?: ConnectorTemplateRuntimeFieldsV2['variables'];
  endpoints: ConnectorEndpointV2[];
  rateLimit?: ConnectorTemplateRuntimeFieldsV2['rateLimit'];
  metadataSchema?: ConnectorTemplateRuntimeFieldsV2['metadataSchema'];
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
