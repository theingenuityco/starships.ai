/**
 * @starships/connectors — core types
 *
 * Code-driven connector framework. A connector is a code object (ConnectorDefinition)
 * carrying its runtime data (baseUrl, actions, metadata schema) plus an AuthStrategy
 * that owns the connect lifecycle (begin -> complete) and runtime session building.
 *
 * The package is intentionally host-agnostic: strategies receive everything they need
 * (env, secret resolution, state signing) through injected context objects, so this
 * package has no dependency on the server, the database, or @starships/env.
 */

import type {
  ConnectorAuthTypeV2,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorProvider,
  ConnectorSessionV2,
  ConnectorStatus,
  ConnectorTemplateRuntimeFieldsV2,
  JsonSchemaObject,
  SecretRef,
} from '@starships/protocol';

// ============================================================================
// Injected host capabilities
// ============================================================================

/** Read-only environment access (host passes a process.env-backed implementation). */
export interface ConnectorEnv {
  get(key: string): string | undefined;
}

/** Resolves a SecretRef to its plaintext value. The host owns decryption + scoping. */
export interface SecretResolver {
  resolve(ref: SecretRef): Promise<string | undefined>;
}

/**
 * Host-minted tokens that require host-only signing material (e.g. the platform
 * JWT secret). GitHub App JWTs do NOT use this — they are signed in-package from
 * the App private key in env.
 */
export interface HostTokenMinter {
  /** Mint the platform JWT used by the internal "system"/"starships" connector. */
  platformJwt(claims: { id: string; starshipId: string }): Promise<string>;
}

// ============================================================================
// Auth lifecycle context
// ============================================================================

export interface BaseCtx {
  starshipId: string;
  env: ConnectorEnv;
  secrets: SecretResolver;
  /** Connector instance metadata (e.g. installation_id, guild_id, tenant). */
  metadata?: Record<string, unknown>;
}

export interface BeginCtx extends BaseCtx {
  authUserId: string;
  /** Absolute callback URL the provider redirects back to. */
  redirectUri: string;
  /** Optional post-connect return path (already validated by the host). */
  returnUrl?: string;
  /** Pre-connect metadata collected from the user (e.g. tenant subdomain). */
  requestedMetadata?: Record<string, unknown>;
  /** Sign an opaque state token (host signs a short-lived JWT). */
  encodeState(payload: Record<string, unknown>): Promise<string>;
}

/** A field the UI should collect for form-based auth (api_key / basic). */
export interface FieldSpec {
  key: string;
  label: string;
  type: 'string' | 'password' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}

export type BeginResult =
  | { kind: 'redirect'; redirectUrl: string; metadata?: Record<string, unknown>; status?: ConnectorStatus }
  | { kind: 'form'; fields: FieldSpec[] }
  | { kind: 'connected'; secrets?: Record<string, string>; metadata?: Record<string, unknown>; status?: ConnectorStatus };

export interface CompleteCtx extends BaseCtx {
  /**
   * Inputs that complete the connect flow. For OAuth this is the callback query
   * (code, state, installation_id, setup_action, error...). For form-based auth
   * this carries the submitted field values.
   */
  input: Record<string, string | undefined>;
  redirectUri: string;
  /** Verify + decode the state token issued in begin(). Null when invalid. */
  decodeState(token: string): Promise<Record<string, unknown> | null>;
}

export interface CompleteResult {
  /** connector_secret values to persist (the host encrypts + stores). */
  secrets: Record<string, string>;
  /** Merged into the connector row metadata. */
  metadata?: Record<string, unknown>;
  status: ConnectorStatus;
}

export interface SessionCtx extends BaseCtx {
  authUserId?: string;
  /** Host token minter, required only by platform_jwt connectors. */
  tokens?: HostTokenMinter;
}

// ============================================================================
// AuthStrategy
// ============================================================================

/**
 * Connector auth kinds understood by this framework. This is a superset of the
 * protocol ConnectorAuthTypeV2: 'github_app' is a host-side concept that never
 * crosses to the runner (its runtimeAuth() degrades to a runner-safe value).
 */
export type ConnectorAuthKind = ConnectorAuthTypeV2 | 'github_app';

/** Catalog/UI auth descriptor, wider than the runtime union to drive UX (e.g. "Install App"). */
export type ConnectorCatalogAuthType = ConnectorAuthKind;

export interface AuthStrategy {
  readonly kind: ConnectorAuthKind;
  /** Descriptor surfaced to the catalog/UI. */
  readonly catalogAuthType: ConnectorCatalogAuthType;

  /** Start a connect flow: redirect (oauth/app install), a form spec, or immediate connect. */
  begin(ctx: BeginCtx): Promise<BeginResult>;

  /** Finish a connect flow from callback/form input. Returns secrets + metadata to persist. */
  complete(ctx: CompleteCtx): Promise<CompleteResult>;

  /**
   * Build the runtime session (auth headers / db session) handed to the runner.
   * Returns null when the connector is not connected / has no usable credential.
   */
  buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null>;

  /** Optional credential refresh (e.g. OAuth2 refresh_token exchange). */
  refresh?(ctx: SessionCtx): Promise<{ secrets: Record<string, string> }>;

  /**
   * The auth value placed on the runtime template handed to the runner. The runner
   * applies session.headers and does not re-resolve this, so 'github_app' returns
   * { type: 'none' }; declarative connectors return their original auth object.
   */
  runtimeAuth(): ConnectorAuthV2;
}

// ============================================================================
// ConnectorDefinition + runtime template
// ============================================================================

export interface ConnectorDefinition {
  id: string;
  provider: ConnectorProvider;
  name: string;
  description: string;
  category: string;
  version: string;
  isEnabled: boolean;
  demoVideoUrl?: string;

  baseUrl: string;
  auth: AuthStrategy;
  actions: ConnectorEndpointV2[];

  metadataSchema?: JsonSchemaObject;
  variables?: NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']>;
  rateLimit?: NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']>;
  webhooks?: Record<string, unknown>;

  /**
   * For OAuth2 connectors whose authorize/token URLs contain {{vars}} (e.g. a tenant
   * subdomain), the UI must collect these values before starting the flow.
   */
  oauthRequiredMetadataKeys?: string[];
}

/**
 * ConnectorRuntimeTemplate
 *
 * Structurally identical to the server's ConnectorTemplateEntityLike (which duck-types
 * the connector_templates DB entity). The registry produces this so the server can
 * consume the in-process registry exactly where it consumes the template registry today.
 */
export interface ConnectorRuntimeTemplate {
  id: string;
  slug: string;
  provider: ConnectorProvider;
  name: string;
  description: string;
  demoVideoUrl?: string;
  authType: ConnectorAuthTypeV2;
  baseUrl: string;
  authJson: ConnectorAuthV2;
  variablesJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']>;
  rateLimitJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']>;
  metadataSchemaJson?: JsonSchemaObject;
  webhooksJson?: Record<string, unknown>;
  version: string;
  category: string;
  usageCount: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  endpoints: ConnectorEndpointV2[];
}

/** Catalog view of a connector, used to drive the connect UI. */
export interface ConnectorCatalogEntry {
  provider: ConnectorProvider;
  name: string;
  description: string;
  auth: { type: ConnectorCatalogAuthType };
  demoVideoUrl?: string;
  oauthRequiredMetadataKeys?: string[];
  metadataSchema?: JsonSchemaObject;
}
