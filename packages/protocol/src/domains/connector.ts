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
    query?: Record<string, ExprString>;
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
export type ConnectorAuthTypeV2 = 'oauth2' | 'api_key' | 'platform_jwt' | 'none';

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

export type ConnectorAuthV2 = ConnectorAuthNoneV2 | ConnectorAuthPlatformJwtV2 | ConnectorAuthApiKeyV2 | ConnectorAuthOAuth2V2;

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
}

export interface ConnectorListResponse {
  connectors: ConnectorListItem[];
}

export interface ConnectorCatalogItem {
  provider: ConnectorProvider;
  name: string;
  description: string;
  authType: ConnectorAuthTypeV2;
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
  authType: ConnectorAuthTypeV2;
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

export interface UpdateConnectorTemplateRequest {
  name?: string;
  description?: string;
  authType?: ConnectorAuthTypeV2;
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
  authType: ConnectorAuthTypeV2;
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

// Reserved for future request fields; currently empty.
export type StartOAuthRequest = Record<string, never>;

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
