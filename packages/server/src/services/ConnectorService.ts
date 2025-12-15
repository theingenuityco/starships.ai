import type {
  ConnectorCatalogItem,
  ConnectorConnectInput,
  ConnectorConnectOutput,
  ConnectorListItem,
  ConnectorProvider,
  ConnectWithApiKeyRequest,
  ConnectorModel,
  ConnectorRuntimeConfig,
  ConnectorTokenRef,
} from '@starships/protocol';
import {
  ConnectorTemplateRepository,
  ConnectorRepository,
  ConnectorSecretRepository,
  StarshipRepository,
  ConnectorTemplateEntity,
} from '@starships/models';
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
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

  private parseSecretKeyForPlatformSecret(ref: unknown, label: string): string {
    if (ref && typeof ref === 'object') {
      const rec = ref as Record<string, unknown>;
      const type = rec.type;
      const key = rec.key;
      if (type !== 'platform_secret') {
        throw new Error(`${label} must be a platform_secret ref`);
      }
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error(`${label} must include a non-empty key`);
      }
      return key.trim();
    }
    throw new Error(`${label} is not configured`);
  }

  private parseSecretKeyForConnectorSecret(ref: unknown, label: string): string | undefined {
    if (ref === undefined || ref === null) return undefined;
    if (ref && typeof ref === 'object') {
      const rec = ref as Record<string, unknown>;
      const type = rec.type;
      const key = rec.key;
      // Some connectors intentionally use a platform secret for runtime auth
      // and do not persist OAuth token responses as per-starship secrets.
      if (type === 'platform_secret') {
        return undefined;
      }
      if (type !== 'connector_secret') {
        throw new Error(`${label} must be a connector_secret ref`);
      }
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error(`${label} must include a non-empty key`);
      }
      return key.trim();
    }
    throw new Error(`${label} must be a string or {type,key}`);
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
   * Execute a connector connect blueprint for the given template + input.
   *
   * All blueprint-driven connect flows should go through this helper so that
   * execution and error handling remain consistent across providers.
   */
  private async runConnectBlueprint(template: ConnectorTemplateEntity, input: ConnectorConnectInput): Promise<ConnectorConnectOutput> {
    if (!template.connectBlueprint) {
      throw new Error(`Connector template ${template.id} for provider ${input.provider} does not have a connect blueprint configured`);
    }

    const execution = ExecutionItemUtils.createExecution();
    const initialItems = ExecutionItemUtils.wrapSingle(input);
    execution.results.push({ nodeRef: '__initial__', items: initialItems });

    const runner = RunnerFactory.getTopLevelRunner(0);
    const resultItems = await runner.run(template.connectBlueprint, execution);
    const result = ExecutionItemUtils.unwrapSingle(resultItems) as ConnectorConnectOutput | undefined;
    if (!result || typeof result !== 'object') {
      throw new Error(`Connector connect blueprint for provider ${input.provider} did not return a valid result`);
    }

    return result;
  }

  /**
   * Execute an inline connector connect blueprint if configured for the provider.
   *
   * This is a compatibility helper used to support DB-driven connector behavior
   * while still allowing legacy TypeScript flows to run when no blueprint is
   * present. New code should prefer loadTemplateOrThrow + runConnectBlueprint.
   */
  private async runConnectBlueprintIfPresent(input: ConnectorConnectInput): Promise<ConnectorConnectOutput | null> {
    const template = await this.connectorTemplateRepository.findByProvider(input.provider);
    if (!template || !template.connectBlueprint) {
      return null;
    }

    return this.runConnectBlueprint(template, input);
  }

  /**
   * Apply the side effects described by a ConnectorConnectOutput:
   * - Persist/update the connector row (status, metadata, lastError, template link)
   * - Persist any secrets returned in output.env to the connector_secrets table
   *
   * Returns the connector id and optional starship slug for downstream use.
   */
  private async applyConnectOutput(
    starshipId: string,
    userId: string,
    provider: ConnectorProvider,
    template: ConnectorTemplateEntity,
    output: ConnectorConnectOutput
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

    if (output.env) {
      for (const [key, value] of Object.entries(output.env)) {
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
   * Run a refresh blueprint for a connector, given the current env snapshot and metadata.
   * Applies any resulting env/metadata/status/lastError changes and returns the updated connector.
   */
  async refreshConnector(starshipId: string, provider: ConnectorProvider): Promise<ConnectorModel | null> {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template || !template.refreshBlueprint) {
      // No refresh behavior defined for this connector.
      return null;
    }

    const connector = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    if (!connector) {
      return null;
    }

    const envSnapshot = await this.getConnectorEnvSnapshot(starshipId, connector.id);

    const execution = ExecutionItemUtils.createExecution();
    const input = {
      starshipId,
      provider,
      envSnapshot,
      metadata: connector.metadata || {},
      config: (template.runtimeConfig || {}) as ConnectorRuntimeConfig,
    };
    const initialItems = ExecutionItemUtils.wrapSingle(input);
    execution.results.push({ nodeRef: '__initial__', items: initialItems });

    const runner = RunnerFactory.getTopLevelRunner(0);
    const resultItems = await runner.run(template.refreshBlueprint, execution);
    const result = ExecutionItemUtils.unwrapSingle(resultItems) as
      | {
          env?: Record<string, string>;
          metadata?: Record<string, unknown>;
          status?: string;
          lastError?: string;
        }
      | undefined;

    if (!result || typeof result !== 'object') {
      throw new Error(`Connector refresh blueprint for provider ${provider} did not return a valid result`);
    }

    // Apply env updates
    if (result.env) {
      for (const [key, value] of Object.entries(result.env)) {
        // No user context for refresh flows; attribute to system.
        await this.upsertConnectorSecret(starshipId, key, value, 'system', connector.id);
      }
    }

    const updated = await this.connectorRepository.update(connector.id, {
      status: (result.status as ConnectorModel['status']) ?? connector.status,
      metadata: {
        ...(connector.metadata || {}),
        ...(result.metadata || {}),
      },
      lastError: result.lastError ?? null,
    });

    return updated ?? connector;
  }

  /**
   * Run a test blueprint for a connector and return the result.
   * Does not mutate connector or env state.
   */
  async testConnector(
    starshipId: string,
    provider: ConnectorProvider
  ): Promise<{
    ok: boolean;
    error?: string;
    details?: Record<string, unknown>;
  } | null> {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template || !template.testBlueprint) {
      return null;
    }

    const connector = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    if (!connector) {
      return null;
    }

    const envSnapshot = await this.getConnectorEnvSnapshot(starshipId, connector.id);

    const execution = ExecutionItemUtils.createExecution();
    const input = {
      starshipId,
      provider,
      envSnapshot,
      metadata: connector.metadata || {},
      config: (template.runtimeConfig || {}) as ConnectorRuntimeConfig,
    };
    const initialItems = ExecutionItemUtils.wrapSingle(input);
    execution.results.push({ nodeRef: '__initial__', items: initialItems });

    const runner = RunnerFactory.getTopLevelRunner(0);
    const resultItems = await runner.run(template.testBlueprint, execution);
    const result = ExecutionItemUtils.unwrapSingle(resultItems) as
      | {
          ok: boolean;
          error?: string;
          details?: Record<string, unknown>;
        }
      | undefined;

    if (!result || typeof result !== 'object') {
      throw new Error(`Connector test blueprint for provider ${provider} did not return a valid result`);
    }

    return result;
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
          displayName: tpl.displayName,
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
    const env = getEnvConfig();

    const runtimeConfig = (template.runtimeConfig || {}) as ConnectorRuntimeConfig;
    const oauthConfig =
      runtimeConfig.oauth && typeof runtimeConfig.oauth === 'object'
        ? (runtimeConfig.oauth as NonNullable<ConnectorRuntimeConfig['oauth']>)
        : ({} as NonNullable<ConnectorRuntimeConfig['oauth']>);
    const oauthParams =
      oauthConfig.params && typeof oauthConfig.params === 'object'
        ? (oauthConfig.params as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    // Custom connectors (authType = 'custom') are started via connect
    // blueprints so that providers like GitHub can compute their own
    // installation URLs while the host still owns secrets and state tokens.
    if (template.authType === 'custom') {
      const appSlugEnvKey = (runtimeConfig.appSlugEnvKey as string | undefined) || 'GITHUB_APP_SLUG';
      const appSlug = await this.resolvePlatformSecret(appSlugEnvKey);

      if (!appSlug) {
        throw new Error(`Custom connector ${provider} is not configured. Missing env: ${appSlugEnvKey}`);
      }

      const state = await generateOAuthState(true, userId, {
        starshipId,
        provider,
      });

      const output = await this.runConnectBlueprint(template, {
        starshipId,
        provider,
        authType: 'custom',
        phase: 'start',
        stateToken: state,
        config: {
          ...((template.runtimeConfig || {}) as Record<string, unknown>),
          appSlug,
        },
      });

      if (!output.authorizationUrl) {
        throw new Error(`Custom connector ${provider} did not return an authorizationUrl from connect blueprint`);
      }

      return output.authorizationUrl;
    }

    if (template.authType !== 'oauth2') {
      throw new Error(`Connector ${provider} does not support start flow for authType ${template.authType}`);
    }

    const clientIdEnvKey = this.parseSecretKeyForPlatformSecret(oauthConfig.clientId as ConnectorTokenRef | undefined, `oauth.clientId`);

    const clientId = await this.resolvePlatformSecret(clientIdEnvKey);
    const authorizeUrl = oauthConfig.authorizeUrl as string | undefined;
    const redirectPath = oauthConfig.redirectPath as string | undefined;

    if (!authorizeUrl) {
      throw new Error(`oauth.authorizeUrl is not configured for connector template ${template.id}`);
    }

    if (!redirectPath) {
      throw new Error(`oauth.redirectPath is not configured for connector template ${template.id}`);
    }

    if (!clientId) {
      throw new Error(`OAuth is not configured for provider ${provider}. Missing env: ${clientIdEnvKey}`);
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider,
    });

    const redirectUri = `${env.PUBLIC_URL}${redirectPath}`;

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
    });

    const scopes = Array.isArray(oauthConfig.scopes) ? oauthConfig.scopes.map((s) => String(s)) : [];

    if (scopes.length) {
      params.set('scope', scopes.join(' '));
    }

    const accessType = oauthParams.accessType as string | undefined;
    if (accessType && typeof accessType === 'string') {
      params.set('access_type', accessType);
    }

    const prompt = oauthParams.prompt as string | undefined;
    if (prompt && typeof prompt === 'string') {
      params.set('prompt', prompt);
    }

    // Include provider-specific permission parameters when configured.
    const permissionsRaw = oauthParams.permissions;
    if (permissionsRaw !== undefined && permissionsRaw !== null) {
      const permissionsValue = typeof permissionsRaw === 'number' ? String(permissionsRaw) : String(permissionsRaw);
      if (permissionsValue) {
        params.set('permissions', permissionsValue);
      }
    }

    const baseAuthorizationUrl = `${authorizeUrl}?${params.toString()}`;

    // If a connect blueprint is configured, let it optionally refine the URL.
    if (template.connectBlueprint) {
      try {
        const output = await this.runConnectBlueprint(template, {
          starshipId,
          provider,
          authType: 'oauth2',
          phase: 'start',
          authorizeUrl: baseAuthorizationUrl,
          redirectPath,
          scopes,
          stateToken: state,
          config: runtimeConfig,
        });

        if (output.authorizationUrl) {
          return output.authorizationUrl;
        }
      } catch (error) {
        // Fall back to the static TypeScript flow if blueprint execution fails.
        console.warn('[ConnectorService] Connect blueprint failed for startOAuthConnector, falling back to static flow', {
          provider,
          error,
        });
      }
    }

    return baseAuthorizationUrl;
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

    const env = getEnvConfig();
    const runtimeConfig = (template.runtimeConfig || {}) as ConnectorRuntimeConfig;
    const oauthConfig =
      runtimeConfig.oauth && typeof runtimeConfig.oauth === 'object'
        ? (runtimeConfig.oauth as NonNullable<ConnectorRuntimeConfig['oauth']>)
        : ({} as NonNullable<ConnectorRuntimeConfig['oauth']>);

    const clientIdEnvKey = this.parseSecretKeyForPlatformSecret(oauthConfig.clientId as ConnectorTokenRef | undefined, `oauth.clientId`);
    const clientSecretEnvKey = this.parseSecretKeyForPlatformSecret(
      oauthConfig.clientSecret as ConnectorTokenRef | undefined,
      `oauth.clientSecret`
    );

    const clientId = await this.resolvePlatformSecret(clientIdEnvKey);
    const clientSecret = await this.resolvePlatformSecret(clientSecretEnvKey);
    const tokenUrl = oauthConfig.tokenUrl as string | undefined;
    const redirectPath = oauthConfig.redirectPath as string | undefined;

    if (!tokenUrl) {
      throw new Error(`oauth.tokenUrl is not configured for connector template ${template.id}`);
    }

    if (!redirectPath) {
      throw new Error(`oauth.redirectPath is not configured for connector template ${template.id}`);
    }

    if (!clientId || !clientSecret) {
      throw new Error(
        `OAuth is not configured for provider ${providerFromCallback}. Missing envs: ${clientIdEnvKey}, ${clientSecretEnvKey}`
      );
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

    const redirectUri = `${env.PUBLIC_URL}${redirectPath}`;

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
      tokenResponse = await axios.post(tokenUrl, tokenForm, {
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
          tokenUrl,
          redirectUri,
          status: err.response?.status,
          responseData: err.response?.data,
        });
      } else {
        console.error('[CONNECTOR_OAUTH] Token exchange failed with non-Axios error', {
          provider: providerFromCallback,
          tokenUrl,
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

    const accessTokenEnvKey = this.parseSecretKeyForConnectorSecret(
      oauthConfig.accessToken as ConnectorTokenRef | undefined,
      `oauth.accessToken`
    );
    const refreshTokenEnvKey = this.parseSecretKeyForConnectorSecret(
      oauthConfig.refreshToken as ConnectorTokenRef | undefined,
      `oauth.refreshToken`
    );

    if (accessTokenEnvKey && body.access_token) {
      envUpdates[accessTokenEnvKey] = String(body.access_token);
    } else if (!accessTokenEnvKey && body.access_token) {
      // If oauth.accessToken is a platform_secret ref, parseSecretKeyForConnectorSecret returns undefined.
      // This is expected for bot-style connectors (e.g. Discord) where runtime auth comes from a platform secret.
      console.warn('[CONNECTOR_OAUTH] Skipping access_token persistence because oauth.accessToken is not a connector_secret ref', {
        provider,
      });
    }
    if (refreshTokenEnvKey && body.refresh_token) {
      envUpdates[refreshTokenEnvKey] = String(body.refresh_token);
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

    // Host-computed baseline output derived from the token response. Blueprints
    // can refine or override this, but we always fall back to these values.
    const hostOutput: ConnectorConnectOutput = {
      env: envUpdates,
      metadata,
      status: 'connected',
    };

    let finalOutput = hostOutput;

    if (template.connectBlueprint) {
      try {
        const blueprintOutput = await this.runConnectBlueprint(template, {
          starshipId,
          provider: providerFromCallback,
          authType: 'oauth2',
          phase: 'complete',
          tokenUrl,
          redirectPath,
          stateToken,
          code,
          callbackQuery,
          config: runtimeConfig,
        });

        finalOutput = {
          ...hostOutput,
          ...blueprintOutput,
          env: {
            ...(hostOutput.env || {}),
            ...(blueprintOutput.env || {}),
          },
          metadata: {
            ...(hostOutput.metadata || {}),
            ...(blueprintOutput.metadata || {}),
          },
        };
      } catch (error) {
        console.warn('[ConnectorService] Connect blueprint failed for completeOAuthConnector, falling back to static flow', {
          provider: providerFromCallback,
          error,
        });
      }
    }

    const { starshipSlug } = await this.applyConnectOutput(starshipId, userId, providerFromCallback, template, finalOutput);

    return {
      starshipId,
      starshipSlug,
      userId,
    };
  }

  /**
   * Complete a custom connector flow driven by a connect blueprint.
   *
   * This is used for providers like GitHub where the external callback does
   * not follow a traditional OAuth code exchange. The host validates the
   * state token and delegates env/metadata/status computation to the
   * connect blueprint, then applies the resulting ConnectorConnectOutput.
   */
  async completeCustomConnector(
    providerFromCallback: ConnectorProvider,
    stateToken: string,
    callbackQuery: Record<string, unknown> | undefined
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const template = await this.loadTemplateOrThrow(providerFromCallback);
    if (template.isEnabled === false) {
      throw new Error(`Connector ${providerFromCallback} is disabled by the instance admin`);
    }

    if (template.authType !== 'custom') {
      throw new Error(`Connector ${providerFromCallback} does not use custom authentication`);
    }

    const stateValidation = await validateOAuthState(stateToken);
    if (!stateValidation.valid) {
      throw new Error('Invalid or expired connector state');
    }

    const { userId, context } = stateValidation;
    if (!userId) {
      throw new Error('Connector state missing user information');
    }

    const starshipId = context?.starshipId as string | undefined;
    const provider = (context?.provider as string | undefined) || providerFromCallback;

    if (!starshipId || provider !== providerFromCallback) {
      throw new Error('Connector state missing starship context');
    }

    const runtimeConfig = (template.runtimeConfig || {}) as ConnectorRuntimeConfig;

    const output = await this.runConnectBlueprint(template, {
      starshipId,
      provider: providerFromCallback,
      authType: 'custom',
      phase: 'complete',
      stateToken,
      callbackQuery,
      config: runtimeConfig,
    });

    const { starshipSlug } = await this.applyConnectOutput(starshipId, userId, providerFromCallback, template, output);

    return {
      starshipId,
      starshipSlug,
      userId,
    };
  }

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
        const runtimeConfig = (template.runtimeConfig || {}) as ConnectorRuntimeConfig;
        const oauthConfig =
          runtimeConfig.oauth && typeof runtimeConfig.oauth === 'object'
            ? (runtimeConfig.oauth as NonNullable<ConnectorRuntimeConfig['oauth']>)
            : ({} as NonNullable<ConnectorRuntimeConfig['oauth']>);
        const scopes = Array.isArray(oauthConfig.scopes) ? oauthConfig.scopes.map((s) => String(s)) : [];

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
      const runtimeConfig = (template.runtimeConfig || {}) as ConnectorRuntimeConfig;
      const oauthConfig =
        runtimeConfig.oauth && typeof runtimeConfig.oauth === 'object'
          ? (runtimeConfig.oauth as NonNullable<ConnectorRuntimeConfig['oauth']>)
          : ({} as NonNullable<ConnectorRuntimeConfig['oauth']>);
      const scopes = Array.isArray(oauthConfig.scopes) ? oauthConfig.scopes.map((s) => String(s)) : [];

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

    const input: ConnectorConnectInput = {
      starshipId,
      provider,
      authType: 'api_key',
      phase: 'complete',
      apiKeyPayload: {
        apiKey: payload.apiKey,
        extraConfig: payload.extraConfig,
      },
      config: (template.runtimeConfig || {}) as ConnectorRuntimeConfig,
    };

    const output = await this.runConnectBlueprint(template, input);
    const { connector } = await this.applyConnectOutput(starshipId, userId, provider, template, output);

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
