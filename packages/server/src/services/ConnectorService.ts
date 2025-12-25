import type {
  ConnectorCatalogItem,
  ConnectorListItem,
  ConnectorProvider,
  ConnectWithApiKeyRequest,
  ConnectorModel,
  ConnectorAuthOAuth2V2,
  ConnectorAuthApiKeyV2,
  ConnectorAuthPlatformJwtV2,
  SecretRef,
  SecretRefType,
} from '@starships/protocol';
import {
  ConnectorTemplateRepository,
  ConnectorRepository,
  ConnectorSecretRepository,
  StarshipRepository,
  ConnectorTemplateEntity,
} from '@starships/models';
import { ConnectorSecretService } from './ConnectorSecretService';
import { getEnvConfig } from '@starships/env';
import axios from 'axios';
import { generateOAuthState, validateOAuthState } from '@/utils/jwt';
import { PlatformSecretService } from './PlatformSecretService';

/**
 * Connector Service - Layer 4
 *
 * Orchestrates connector configuration for starships while keeping
 * all runtime secrets in the connector_secrets table.
 */
export class ConnectorService {
  private connectorRepository: ConnectorRepository;
  private connectorTemplateRepository: ConnectorTemplateRepository;
  private connectorSecretRepository: ConnectorSecretRepository;
  private connectorSecretService: ConnectorSecretService;
  private starshipRepository: StarshipRepository;
  private platformSecretService: PlatformSecretService;

  constructor() {
    this.connectorRepository = new ConnectorRepository();
    this.connectorTemplateRepository = new ConnectorTemplateRepository();
    this.connectorSecretRepository = new ConnectorSecretRepository();
    this.connectorSecretService = new ConnectorSecretService();
    this.starshipRepository = new StarshipRepository();
    this.platformSecretService = new PlatformSecretService();
  }

  private parseSecretRef(ref: unknown, label: string): SecretRef {
    if (!ref || typeof ref !== 'object') {
      throw new Error(`${label} is not configured`);
    }
    const rec = ref as Record<string, unknown>;
    const type = rec.type as SecretRefType | undefined;
    const key = rec.key as string | undefined;
    if ((type !== 'platform_secret' && type !== 'connector_secret') || typeof key !== 'string' || !key.trim()) {
      throw new Error(`${label} must be a SecretRef {type,key}`);
    }
    return { type, key: key.trim() };
  }

  private async resolvePlatformSecret(envKey: string): Promise<string | undefined> {
    const fromDb = await this.platformSecretService.getSecret(envKey);
    if (fromDb && fromDb.trim()) return fromDb.trim();
    return undefined;
  }

  /**
   * Load a connector template for a provider or throw a descriptive error.
   */
  private async loadTemplateOrThrow(provider: ConnectorProvider): Promise<ConnectorTemplateEntity> {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template) {
      throw new Error(`Connector template not found for provider: ${provider}`);
    }
    return template;
  }

  /**
   * Apply the side effects described by a connect completion:
   * - Persist/update the connector row (status, metadata, lastError, template link)
   * - Persist any secrets returned in envUpdates to the connector_secrets table
   *
   * Returns the connector id and optional starship slug for downstream use.
   */
  private async applyConnectOutput(
    starshipId: string,
    userId: string,
    provider: ConnectorProvider,
    template: ConnectorTemplateEntity,
    output: { envUpdates?: Record<string, string>; metadata?: Record<string, unknown>; status?: ConnectorModel['status']; lastError?: string | null }
  ): Promise<{ connector: ConnectorModel; starshipSlug?: string }> {
    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);

    const status = output.status ?? 'connected';
    const metadata = output.metadata ?? {};
    const lastError: string | null | undefined = output.lastError ?? null;

    let connector =
      existing ??
      (await this.connectorRepository.create({
        starshipId,
        provider,
        status,
        metadata,
        lastError: lastError ?? undefined,
        templateId: template.id,
        version: template.version,
      }));

    if (existing) {
      const updated = await this.connectorRepository.update(existing.id, {
        status,
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
        lastError,
      });

      if (updated) {
        connector = updated;
      }
    }

    if (output.envUpdates) {
      for (const [key, value] of Object.entries(output.envUpdates)) {
        await this.upsertConnectorSecret(starshipId, key, value, userId, connector.id);
      }
    }

    const starship = await this.starshipRepository.findById(starshipId);

    return { connector, starshipSlug: starship?.slug };
  }

  /**
   * Build a decrypted snapshot of env vars for a connector.
   *
   * Source of truth is connector_secrets.connector_id linkage.
   */
  private async getConnectorEnvSnapshot(starshipId: string, connectorId: string): Promise<Record<string, string>> {
    return this.connectorSecretRepository.getDecryptedSecretsByConnector(connectorId);
  }

  /**
   * Refresh connector behavior is removed in v2 (no blueprint fallback).
   */
  async refreshConnector(starshipId: string, provider: ConnectorProvider): Promise<ConnectorModel | null> {
    void starshipId;
    void provider;
    return null;
  }

  /**
   * Test connector behavior is removed in v2 (no blueprint fallback).
   */
  async testConnector(
    starshipId: string,
    provider: ConnectorProvider
  ): Promise<{
    ok: boolean;
    error?: string;
    details?: Record<string, unknown>;
  } | null> {
    void starshipId;
    void provider;
    return null;
  }

  /**
   * Get the connector catalog.
   *
   * Source of truth is the DB-backed connector_templates table.
   */
  async getConnectorCatalog(): Promise<ConnectorCatalogItem[]> {
    const templates = await this.connectorTemplateRepository.list();
    return templates
      .filter((tpl) => tpl.isEnabled !== false)
      .map(
        (tpl): ConnectorCatalogItem => ({
          provider: tpl.provider as ConnectorProvider,
          name: tpl.name,
          description: tpl.description,
          authType: tpl.authType as ConnectorCatalogItem['authType'],
        })
      );
  }

  /**
   * Start a connector flow for a starship and return the authorization URL.
   *
   * For authType = 'oauth2', this builds a standard OAuth authorization URL
   * driven by connector_templates configuration. For authType = 'custom'
   * (e.g. GitHub App), this delegates URL construction to a provider-specific
   * connect blueprint.
   */
  async startConnector(starshipId: string, userId: string, provider: ConnectorProvider): Promise<string> {
    const template = await this.loadTemplateOrThrow(provider);
    if (template.isEnabled === false) {
      throw new Error(`Connector ${provider} is disabled by the instance admin`);
    }
    if (template.authType !== 'oauth2') {
      throw new Error(`Connector ${provider} does not support start flow for authType ${template.authType}`);
    }

    const auth = template.authJson as unknown as ConnectorAuthOAuth2V2;
    if (!auth || auth.type !== 'oauth2') {
      throw new Error(`Connector ${provider} is missing oauth2 auth_json configuration`);
    }

    const clientIdRef = this.parseSecretRef(auth.clientIdRef, 'auth.clientIdRef');
    if (clientIdRef.type !== 'platform_secret') {
      throw new Error('auth.clientIdRef must be a platform_secret ref');
    }

    const clientId = await this.resolvePlatformSecret(clientIdRef.key);
    if (!clientId) {
      throw new Error(`OAuth is not configured for provider ${provider}. Missing env: ${clientIdRef.key}`);
    }

    const state = await generateOAuthState(true, userId, { starshipId, provider });

    // Redirect URI is derived from the standard callback route (no template field).
    const env = getEnvConfig();
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/${encodeURIComponent(String(provider))}/callback`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });

    const scopes = Array.isArray(auth.scopes) ? auth.scopes.map((s) => String(s)) : [];
    if (scopes.length) {
      params.set('scope', scopes.join(auth.scopeDelimiter === ',' ? ',' : ' '));
    }

    const extra = auth.extraAuthorizeParams && typeof auth.extraAuthorizeParams === 'object' ? auth.extraAuthorizeParams : {};
    for (const [k, v] of Object.entries(extra)) {
      if (typeof v === 'string') params.set(k, v);
    }

    return `${auth.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Complete generic OAuth flow for a connector. Uses connector_templates
   * configuration (token URL, redirect path, runtime_config) to exchange the
   * code for tokens and persist connector/env state.
   */
  async completeOAuthConnector(
    providerFromCallback: ConnectorProvider,
    code: string,
    stateToken: string,
    callbackQuery: Record<string, unknown> | undefined
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const template = await this.loadTemplateOrThrow(providerFromCallback);
    if (template.isEnabled === false) {
      throw new Error(`Connector ${providerFromCallback} is disabled by the instance admin`);
    }

    if (template.authType !== 'oauth2') {
      throw new Error(`Connector ${providerFromCallback} does not use OAuth2 authentication`);
    }

    const auth = template.authJson as unknown as ConnectorAuthOAuth2V2;
    if (!auth || auth.type !== 'oauth2') {
      throw new Error(`Connector ${providerFromCallback} is missing oauth2 auth_json configuration`);
    }

    const clientIdRef = this.parseSecretRef(auth.clientIdRef, 'auth.clientIdRef');
    const clientSecretRef = this.parseSecretRef(auth.clientSecretRef, 'auth.clientSecretRef');
    if (clientIdRef.type !== 'platform_secret' || clientSecretRef.type !== 'platform_secret') {
      throw new Error('OAuth2 clientIdRef/clientSecretRef must be platform_secret refs');
    }

    const clientId = await this.resolvePlatformSecret(clientIdRef.key);
    const clientSecret = await this.resolvePlatformSecret(clientSecretRef.key);
    if (!clientId || !clientSecret) {
      throw new Error(`OAuth is not configured for provider ${providerFromCallback}. Missing envs: ${clientIdRef.key}, ${clientSecretRef.key}`);
    }

    const stateValidation = await validateOAuthState(stateToken);
    if (!stateValidation.valid) {
      throw new Error('Invalid or expired OAuth state');
    }

    const { userId, context } = stateValidation;
    if (!userId) {
      throw new Error('OAuth state missing user information');
    }

    const starshipId = context?.starshipId as string | undefined;
    const provider = context?.provider as string | undefined;

    if (!starshipId || provider !== providerFromCallback) {
      throw new Error('OAuth state missing starship context');
    }

    const env = getEnvConfig();
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/${encodeURIComponent(String(providerFromCallback))}/callback`;

    const tokenPayload = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    };

    // Most OAuth2 token endpoints expect
    // `application/x-www-form-urlencoded` for the token exchange.
    const tokenForm = new URLSearchParams();
    for (const [key, value] of Object.entries(tokenPayload)) {
      tokenForm.set(key, String(value));
    }

    let tokenResponse;
    try {
      tokenResponse = await axios.post(auth.tokenUrl, tokenForm, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        // Keep error logs minimal and safe (no code/state/client_secret leakage).
        console.error('[CONNECTOR_OAUTH] Token exchange failed', {
          provider: providerFromCallback,
          tokenUrl: auth.tokenUrl,
          redirectUri,
          status: err.response?.status,
          responseData: err.response?.data,
        });
      } else {
        console.error('[CONNECTOR_OAUTH] Token exchange failed with non-Axios error', {
          provider: providerFromCallback,
          tokenUrl: auth.tokenUrl,
          redirectUri,
          errorMessage: (err as Error | undefined)?.message,
          errorName: (err as Error | undefined)?.name,
        });
      }
      throw err;
    }

    // Normalise token response into a common shape. We expect providers to
    // return JSON here; tokenResponse.data should already be the parsed object.
    const body = tokenResponse.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      [key: string]: unknown;
    };

    const envUpdates: Record<string, string> = {};

    const accessRef = this.parseSecretRef(auth.accessTokenRef, 'auth.accessTokenRef');
    if (accessRef.type !== 'connector_secret') {
      throw new Error('auth.accessTokenRef must be a connector_secret ref');
    }
    if (body.access_token) {
      envUpdates[accessRef.key] = String(body.access_token);
    }

    if (auth.refreshTokenRef) {
      const refreshRef = this.parseSecretRef(auth.refreshTokenRef, 'auth.refreshTokenRef');
      if (refreshRef.type === 'connector_secret' && body.refresh_token) {
        envUpdates[refreshRef.key] = String(body.refresh_token);
      }
    }

    const metadata: Record<string, unknown> = {
      provider,
      ...(typeof body.expires_in === 'number' ? { expiresIn: body.expires_in } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
    };

    // Copy callback query fields into metadata (non-secret), excluding OAuth plumbing.
    // This captures provider-specific extras like Discord's guild_id/permissions.
    if (callbackQuery && typeof callbackQuery === 'object') {
      const excluded = new Set(['code', 'state']);
      for (const [key, val] of Object.entries(callbackQuery)) {
        if (!key || excluded.has(key)) continue;
        if (val !== undefined) {
          metadata[key] = val;
        }
      }
    }

    const { starshipSlug } = await this.applyConnectOutput(starshipId, userId, providerFromCallback, template, {
      envUpdates,
      metadata,
      status: 'connected',
    });

    return {
      starshipId,
      starshipSlug,
      userId,
    };
  }

  // Custom connector flows are intentionally removed in v2 (no fallback).

  // NOTE: GitHub connector now uses a GitHub OAuth App user token with
  // per-starship access/refresh tokens managed via the environments table.

  /**
   * List connectors for a starship, enriched with managed env key presence.
   */
  async listStarshipConnectors(starshipId: string): Promise<ConnectorListItem[]> {
    const [templates, connectors] = await Promise.all([
      this.connectorTemplateRepository.list(),
      this.connectorRepository.findByStarship(starshipId),
    ]);
    const byProvider = new Map(connectors.map((c) => [c.provider, c]));
    const visibleTemplates = templates.filter((t) => t.isEnabled !== false || byProvider.has(t.provider));

    const now = new Date().toISOString();

    return visibleTemplates.map<ConnectorListItem>((template) => {
      const existing = byProvider.get(template.provider);

      if (existing) {
        const scopes =
          template.authType === 'oauth2'
            ? (Array.isArray((template.authJson as any)?.scopes) ? (template.authJson as any).scopes.map((s: any) => String(s)) : [])
            : [];

        return {
          id: existing.id,
          starshipId: existing.starshipId,
          provider: existing.provider,
          status: existing.status,
          lastError: existing.lastError,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          // Keep list item schema consistent with virtual connectors.
          scopes,
          // Expose non-secret connector metadata to tools/agents.
          metadata: existing.metadata || {},
        };
      }

      // Virtual connector entry for providers without a persisted record yet.
      // For Starships, treat the connector as always available for the current
      // starship; it reuses the platform's JWT + SERVER_URL and does not
      // require additional managed env vars.
      const status = template.provider === 'starships' ? 'connected' : 'disconnected';
      const scopes =
        template.authType === 'oauth2'
          ? (Array.isArray((template.authJson as any)?.scopes) ? (template.authJson as any).scopes.map((s: any) => String(s)) : [])
          : [];

      return {
        id: `${starshipId}:${template.provider}`,
        starshipId,
        provider: template.provider,
        status,
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        scopes,
        metadata: {},
      };
    });
  }

  /**
   * Connect a provider using an API key.
   * Currently no connectors use API keys; this method is kept for
   * future providers that may adopt API-key-based flows.
   */
  async connectWithApiKey(starshipId: string, provider: ConnectorProvider, payload: ConnectWithApiKeyRequest, userId: string) {
    const template = await this.loadTemplateOrThrow(provider);
    if (template.isEnabled === false) {
      throw new Error(`Connector ${provider} is disabled by the instance admin`);
    }

    if (template.authType !== 'api_key') {
      throw new Error(`Connector ${provider} does not use API key authentication`);
    }

    const auth = template.authJson as unknown as ConnectorAuthApiKeyV2;
    if (!auth || auth.type !== 'api_key') {
      throw new Error(`Connector ${provider} is missing api_key auth_json configuration`);
    }
    const ref = this.parseSecretRef(auth.apiKeyRef, 'auth.apiKeyRef');
    if (ref.type !== 'connector_secret') {
      throw new Error('auth.apiKeyRef must be a connector_secret ref');
    }

    const { connector } = await this.applyConnectOutput(starshipId, userId, provider, template, {
      envUpdates: { [ref.key]: payload.apiKey },
      metadata: { ...(payload.extraConfig || {}) },
      status: 'connected',
    });
    return connector;
  }

  // OAuth start/completion are handled generically via startOAuthConnector /
  // completeOAuthConnector and connector_templates configuration.

  /**
   * Disconnect a provider for a starship and clean up related env vars.
   */
  async disconnect(starshipId: string, provider: ConnectorProvider) {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template) {
      throw new Error(`Connector template not found for provider: ${provider}`);
    }

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    if (!existing) {
      // Nothing else to do
      return false;
    }

    // Remove env vars managed by this connector (connector_id linkage).
    await this.connectorSecretRepository.deleteByConnectorId(existing.id);

    let newMetadata = existing.metadata || {};

    // For GitHub, also clear per-starship GitHub App configuration stored in metadata.
    if (provider === 'github') {
      const current = (newMetadata || {}) as Record<string, unknown>;
      delete current.githubInstallationId;
      delete current.defaultOwner;
      delete current.defaultRepo;
      newMetadata = current;
    }

    await this.connectorRepository.update(existing.id, {
      status: 'disconnected',
      metadata: newMetadata,
      lastError: null,
    });

    return true;
  }

  /**
   * Helper to create or update an environment variable with encryption.
   * Optionally associates the variable with a connector.
   */
  private async upsertConnectorSecret(starshipId: string, key: string, value: string, userId: string, connectorId?: string): Promise<void> {
    const existing = await this.connectorSecretRepository.findByStarshipAndKey(starshipId, key);

    if (!existing) {
      await this.connectorSecretRepository.create({
        starshipId,
        key,
        value,
        description: `Managed by connector`,
        createdBy: userId,
        connectorId,
      });
      return;
    }

    await this.connectorSecretRepository.update(existing.id, {
      value,
      description: existing.description,
      connectorId,
      updatedBy: userId,
    });
  }
}
