import type {
  ConnectorCatalogItem,
  ConnectorConnectInput,
  ConnectorConnectOutput,
  ConnectorListItem,
  ConnectorProvider,
  ConnectWithApiKeyRequest,
  ConnectorModel,
} from '@starships/protocol';
import {
  ConnectorTemplateRepository,
  ConnectorRepository,
  EnvironmentRepository,
  StarshipRepository,
  ConnectorTemplateEntity,
} from '@starships/models';
import { ExecutionItemUtils, RunnerFactory } from '@starships/autopilot';
import { EnvironmentService } from './EnvironmentService';
import { getEnvConfig } from '@starships/env';
import axios from 'axios';
import { generateOAuthState, validateOAuthState } from '@/utils/jwt';

/**
 * Connector Service - Layer 4
 *
 * Orchestrates connector configuration for starships while keeping
 * all runtime secrets in the existing environments table.
 */
export class ConnectorService {
  private connectorRepository: ConnectorRepository;
  private connectorTemplateRepository: ConnectorTemplateRepository;
  private environmentRepository: EnvironmentRepository;
  private environmentService: EnvironmentService;
  private starshipRepository: StarshipRepository;

  constructor() {
    this.connectorRepository = new ConnectorRepository();
    this.connectorTemplateRepository = new ConnectorTemplateRepository();
    this.environmentRepository = new EnvironmentRepository();
    this.environmentService = new EnvironmentService();
    this.starshipRepository = new StarshipRepository();
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
   * - Persist any env vars returned in output.env to the environments table
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
        await this.upsertEnvironmentVariable(starshipId, key, value, userId, connector.id);
      }
    }

    const starship = await this.starshipRepository.findById(starshipId);

    return { connector, starshipSlug: starship?.slug };
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

    // Snapshot env vars managed for this connector based on template configuration.
    const envSnapshot: Record<string, string> = {};
    const envKeys = [...(template.requiredEnvKeys || []), ...(template.optionalEnvKeys || [])];
    for (const key of envKeys) {
      const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);
      if (existing && typeof (existing as unknown as { decryptedValue?: string }).decryptedValue === 'string') {
        envSnapshot[key] = (existing as unknown as { decryptedValue: string }).decryptedValue;
      }
    }

    const execution = ExecutionItemUtils.createExecution();
    const input = {
      starshipId,
      provider,
      envSnapshot,
      metadata: connector.metadata || {},
      config: (template.runtimeConfig || {}) as Record<string, unknown>,
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
        await this.upsertEnvironmentVariable(starshipId, key, value, 'system', connector.id);
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

    const envSnapshot: Record<string, string> = {};
    const envKeys = [...(template.requiredEnvKeys || []), ...(template.optionalEnvKeys || [])];
    for (const key of envKeys) {
      const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);
      if (existing && typeof (existing as unknown as { decryptedValue?: string }).decryptedValue === 'string') {
        envSnapshot[key] = (existing as unknown as { decryptedValue: string }).decryptedValue;
      }
    }

    const execution = ExecutionItemUtils.createExecution();
    const input = {
      starshipId,
      provider,
      envSnapshot,
      metadata: connector.metadata || {},
      config: (template.runtimeConfig || {}) as Record<string, unknown>,
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
    return templates.map(
      (tpl): ConnectorCatalogItem => ({
        provider: tpl.provider as ConnectorProvider,
        displayName: tpl.displayName,
        description: tpl.description,
        authType: tpl.authType as ConnectorCatalogItem['authType'],
        requiredEnvKeys: tpl.requiredEnvKeys || [],
        optionalEnvKeys: tpl.optionalEnvKeys || [],
        docsSlug: tpl.docsSlug ?? undefined,
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
    const env = getEnvConfig();

    const runtimeConfig = (template.runtimeConfig || {}) as {
      clientIdEnvKey?: string;
      clientSecretEnvKey?: string;
      accessType?: string;
      prompt?: string;
      /**
       * Optional provider-specific permissions value to include in the OAuth
       * authorization URL. For example, Discord expects the "permissions"
       * query param when installing a bot.
       */
      permissions?: string | number;
      // Custom connectors (e.g. GitHub App installation) may use additional
      // keys interpreted by provider-specific blueprints.
      [key: string]: unknown;
    };

    // Custom connectors (authType = 'custom') are started via connect
    // blueprints so that providers like GitHub can compute their own
    // installation URLs while the host still owns secrets and state tokens.
    if (template.authType === 'custom') {
      const appSlugEnvKey = (runtimeConfig.appSlugEnvKey as string | undefined) || 'GITHUB_APP_SLUG';
      const appSlug = (env as unknown as Record<string, string | undefined>)[appSlugEnvKey];

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

    const clientIdEnvKey = runtimeConfig.clientIdEnvKey;
    if (!clientIdEnvKey) {
      throw new Error(`clientIdEnvKey is not configured for connector template ${template.id}`);
    }

    const clientId = (env as unknown as Record<string, string | undefined>)[clientIdEnvKey];
    const authorizeUrl = template.oauthAuthorizeUrl;
    const redirectPath = template.oauthRedirectPath || `/api/v1/connectors/${provider}/callback`;

    if (!authorizeUrl) {
      throw new Error(`oauthAuthorizeUrl is not configured for connector template ${template.id}`);
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

    if (Array.isArray(template.oauthScopes) && template.oauthScopes.length) {
      params.set('scope', template.oauthScopes.join(' '));
    }

    if (runtimeConfig.accessType && typeof runtimeConfig.accessType === 'string') {
      params.set('access_type', runtimeConfig.accessType);
    }

    if (runtimeConfig.prompt && typeof runtimeConfig.prompt === 'string') {
      params.set('prompt', runtimeConfig.prompt);
    }

    // Include provider-specific permissions when configured (e.g. Discord bot install).
    if (runtimeConfig.permissions !== undefined && runtimeConfig.permissions !== null) {
      const permissionsValue =
        typeof runtimeConfig.permissions === 'number' ? String(runtimeConfig.permissions) : String(runtimeConfig.permissions);
      if (permissionsValue) {
        params.set('permissions', permissionsValue);
      }
    }

    const baseAuthorizationUrl = `${authorizeUrl}?${params.toString()}`;

    // If a connect blueprint is configured, let it optionally refine the URL.
    try {
      const output = await this.runConnectBlueprint(template, {
        starshipId,
        provider,
        authType: 'oauth2',
        phase: 'start',
        authorizeUrl: baseAuthorizationUrl,
        redirectPath,
        scopes: template.oauthScopes || [],
        stateToken: state,
        config: runtimeConfig as Record<string, unknown>,
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

    if (template.authType !== 'oauth2') {
      throw new Error(`Connector ${providerFromCallback} does not use OAuth2 authentication`);
    }

    const env = getEnvConfig();
    const runtimeConfig = (template.runtimeConfig || {}) as {
      clientIdEnvKey?: string;
      clientSecretEnvKey?: string;
      accessTokenEnvKey?: string;
      refreshTokenEnvKey?: string;
      metadataFromQuery?: string[];
      [key: string]: unknown;
    };

    const clientIdEnvKey = runtimeConfig.clientIdEnvKey;
    const clientSecretEnvKey = runtimeConfig.clientSecretEnvKey;
    if (!clientIdEnvKey || !clientSecretEnvKey) {
      throw new Error(`clientIdEnvKey/clientSecretEnvKey not configured for connector template ${template.id}`);
    }

    const clientId = (env as unknown as Record<string, string | undefined>)[clientIdEnvKey];
    const clientSecret = (env as unknown as Record<string, string | undefined>)[clientSecretEnvKey];
    const tokenUrl = template.oauthTokenUrl;
    const redirectPath = template.oauthRedirectPath || `/api/v1/connectors/${providerFromCallback}/callback`;

    if (!tokenUrl) {
      throw new Error(`oauthTokenUrl is not configured for connector template ${template.id}`);
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

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await axios.post(tokenUrl, tokenParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const body = tokenResponse.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      [key: string]: unknown;
    };

    const envUpdates: Record<string, string> = {};

    if (runtimeConfig.accessTokenEnvKey && body.access_token) {
      envUpdates[runtimeConfig.accessTokenEnvKey] = String(body.access_token);
    }
    if (runtimeConfig.refreshTokenEnvKey && body.refresh_token) {
      envUpdates[runtimeConfig.refreshTokenEnvKey] = String(body.refresh_token);
    }

    const metadata: Record<string, unknown> = {
      provider,
      ...(typeof body.expires_in === 'number' ? { expiresIn: body.expires_in } : {}),
      ...(body.scope ? { scope: body.scope } : {}),
    };

    // Optionally copy selected fields from callback query into metadata
    if (Array.isArray(runtimeConfig.metadataFromQuery) && callbackQuery) {
      for (const key of runtimeConfig.metadataFromQuery) {
        const val = callbackQuery[key];
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
        config: runtimeConfig as Record<string, unknown>,
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

    const runtimeConfig = (template.runtimeConfig || {}) as Record<string, unknown>;

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

    const now = new Date().toISOString();

    return templates.map<ConnectorListItem>((template) => {
      const existing = byProvider.get(template.provider);

      if (existing) {
        return {
          id: existing.id,
          starshipId: existing.starshipId,
          provider: existing.provider,
          status: existing.status,
          lastError: existing.lastError,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          // Expose non-secret connector metadata (e.g. Discord guild_id) to tools/agents.
          metadata: existing.metadata || {},
        };
      }

      // Virtual connector entry for providers without a persisted record yet.
      // For Starships, treat the connector as always available for the current
      // starship; it reuses the platform's JWT + SERVER_URL and does not
      // require additional managed env vars.
      const status = template.provider === 'starships' ? 'connected' : 'disconnected';

      return {
        id: `${starshipId}:${template.provider}`,
        starshipId,
        provider: template.provider,
        status,
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        scopes: template.oauthScopes || [],
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
      config: (template.runtimeConfig || {}) as Record<string, unknown>,
    };

    const output = await this.runConnectBlueprint(template, input);
    const { connector } = await this.applyConnectOutput(starshipId, userId, provider, template, output);

    return connector;
  }

  // Discord OAuth start/completion are now handled generically via
  // startOAuthConnector / completeOAuthConnector and connector_templates
  // configuration.

  /**
   * Disconnect a provider for a starship and clean up related env vars.
   */
  async disconnect(starshipId: string, provider: ConnectorProvider) {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template) {
      throw new Error(`Connector template not found for provider: ${provider}`);
    }

    // Remove managed env vars for this provider based on connector template configuration.
    const envKeys = [...(template.requiredEnvKeys || []), ...(template.optionalEnvKeys || [])];
    await Promise.all(
      envKeys.map(async (key) => {
        const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);
        if (existing) {
          await this.environmentRepository.delete(existing.id);
        }
      })
    );

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    if (!existing) {
      // Nothing else to do
      return false;
    }

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
  private async upsertEnvironmentVariable(
    starshipId: string,
    key: string,
    value: string,
    userId: string,
    connectorId?: string
  ): Promise<void> {
    const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);

    if (!existing) {
      await this.environmentRepository.create({
        starshipId,
        key,
        value,
        description: `Managed by connector`,
        createdBy: userId,
        connectorId,
      });
      return;
    }

    await this.environmentRepository.update(existing.id, {
      value,
      description: existing.description,
      updatedBy: userId,
    });
  }
}
