import { getConnectorCatalog, getConnectorDefinition } from '@/config/connectors';
import type {
  ConnectorCatalogItem,
  ConnectorConnectInput,
  ConnectorConnectOutput,
  ConnectorListItem,
  ConnectorProvider,
  ConnectWithApiKeyRequest,
} from '@starships/protocol';
import { ConnectorTemplateRepository, ConnectorRepository, EnvironmentRepository, StarshipRepository } from '@starships/models';
import { Engine, ExecutionItemUtils } from '@starships/autopilot';
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
   * Execute an inline connector connect blueprint if configured for the provider.
   *
   * This is a low-level primitive used to support fully DB-driven connector
   * behavior. For existing first-party providers, we continue to use the
   * hard-coded TypeScript flows unless a connect blueprint is explicitly
   * configured on the provider.
   */
  private async runConnectBlueprintIfPresent(input: ConnectorConnectInput): Promise<ConnectorConnectOutput | null> {
    const template = await this.connectorTemplateRepository.findByProvider(input.provider);
    if (!template || !template.connectBlueprint) {
      return null;
    }

    const engine = new Engine({
      // NOTE: For now we do not provide a HostRuntime; this means connector
      // connect blueprints should limit themselves to pure computation (Code,
      // Transform, etc.) and not perform HTTP. Future work can add a
      // server-side HostRuntime that is connector-aware.
    });

    const execution = ExecutionItemUtils.createExecution();
    const initialItems = ExecutionItemUtils.wrapSingle(input);
    execution.results.push({ nodeRef: '__initial__', items: initialItems });

    const resultItems = await engine.executeBlueprint(template.connectBlueprint, execution);
    const result = ExecutionItemUtils.unwrapSingle(resultItems) as ConnectorConnectOutput | undefined;
    if (!result || typeof result !== 'object') {
      throw new Error(`Connector connect blueprint for provider ${input.provider} did not return a valid result`);
    }

    return result;
  }

  /**
   * Get the connector catalog.
   *
   * Primary source of truth is the DB-backed connector_templates table.
   * If the table is empty or unavailable (e.g. during migration), this
   * falls back to the existing static CONNECTOR_CATALOG.
   */
  async getConnectorCatalog(): Promise<ConnectorCatalogItem[]> {
    try {
      const templates = await this.connectorTemplateRepository.list();
      if (templates.length) {
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
    } catch (error) {
      console.warn('[ConnectorService] Failed to load connector templates from DB, falling back to static catalog', error);
    }

    return getConnectorCatalog();
  }

  /**
   * Start generic OAuth flow for a starship and return the authorization URL,
   * driven by connector_templates configuration instead of per-provider
   * hard-coded logic.
   */
  async startOAuthConnector(starshipId: string, userId: string, provider: ConnectorProvider): Promise<string> {
    const template = await this.connectorTemplateRepository.findByProvider(provider);
    if (!template) {
      throw new Error(`Connector template not found for provider: ${provider}`);
    }

    if (template.authType !== 'oauth2') {
      throw new Error(`Connector ${provider} does not use OAuth2 authentication`);
    }

    const env = getEnvConfig();
    const runtimeConfig = (template.runtimeConfig || {}) as {
      clientIdEnvKey?: string;
      accessType?: string;
      prompt?: string;
      [key: string]: unknown;
    };

    const clientIdEnvKey = runtimeConfig.clientIdEnvKey;
    if (!clientIdEnvKey) {
      throw new Error(`clientIdEnvKey is not configured for connector template ${template.id}`);
    }

    const clientId = (env as unknown as Record<string, string | undefined>)[clientIdEnvKey];
    const authorizeUrl = template.oauthAuthorizeUrl;
    const redirectPath = template.oauthRedirectPath || `/api/v1/connectors/${provider}/oauth/callback`;

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

    return `${authorizeUrl}?${params.toString()}`;
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
    const template = await this.connectorTemplateRepository.findByProvider(providerFromCallback);
    if (!template) {
      throw new Error(`Connector template not found for provider: ${providerFromCallback}`);
    }

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
    const redirectPath = template.oauthRedirectPath || `/api/v1/connectors/${providerFromCallback}/oauth/callback`;

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

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    const connector =
      existing ??
      (await this.connectorRepository.create({
        starshipId,
        provider,
        status: 'connected',
        metadata,
        lastError: undefined,
        templateId: template.id,
        version: template.version,
      }));

    if (existing) {
      await this.connectorRepository.update(existing.id, {
        status: 'connected',
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
        lastError: null,
      });
    }

    // Persist env vars for this starship and link them to the connector
    for (const [key, value] of Object.entries(envUpdates)) {
      await this.upsertEnvironmentVariable(starshipId, key, value, userId, connector.id);
    }

    const starship = await this.starshipRepository.findById(starshipId);

    return {
      starshipId,
      starshipSlug: starship?.slug,
      userId,
    };
  }

  // NOTE: GitHub connector now uses a GitHub App installation token via
  // ConnectorRuntimeService. There is no per-starship OAuth flow for GitHub.

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
          scopes: template.oauthScopes || [],
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
      };
    });
  }

  /**
   * Configure GitHub connector for a starship using a GitHub App installation.
   * Stores non-secret configuration (installationId, defaults) in connector metadata.
   */
  async configureGitHubConnector(
    starshipId: string,
    userId: string,
    payload: { installationId: string; defaultOwner?: string; defaultRepo?: string }
  ) {
    const baseMetadata: Record<string, unknown> = {
      provider: 'github',
      githubInstallationId: payload.installationId,
      ...(payload.defaultOwner ? { defaultOwner: payload.defaultOwner } : {}),
      ...(payload.defaultRepo ? { defaultRepo: payload.defaultRepo } : {}),
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'github');

    if (!existing) {
      await this.connectorRepository.create({
        starshipId,
        provider: 'github',
        status: 'connected',
        metadata: baseMetadata,
        lastError: undefined,
      });
    } else {
      await this.connectorRepository.update(existing.id, {
        status: 'connected',
        metadata: {
          ...(existing.metadata || {}),
          ...baseMetadata,
        },
        lastError: null,
      });
    }

    // No env entries are managed for GitHub App; all auth is via app-level env.
    const starship = await this.starshipRepository.findById(starshipId);
    return {
      starshipId,
      starshipSlug: starship?.slug,
      userId,
    };
  }

  /**
   * Connect a provider using an API key.
   * Currently no connectors use API keys; this method is kept for
   * future providers that may adopt API-key-based flows.
   */
  async connectWithApiKey(starshipId: string, provider: ConnectorProvider, payload: ConnectWithApiKeyRequest, userId: string) {
    const definition = getConnectorDefinition(provider);
    if (!definition) {
      throw new Error(`Unsupported connector provider: ${provider}`);
    }

    if (definition.authType !== 'api_key') {
      throw new Error(`Connector ${provider} does not use API key authentication`);
    }

    // No current providers use API key authentication.
    throw new Error(`API key connector not implemented for provider: ${provider}`);
  }

  // Discord OAuth start/completion are now handled generically via
  // startOAuthConnector / completeOAuthConnector and connector_templates
  // configuration.

  /**
   * Disconnect a provider for a starship and clean up related env vars.
   */
  async disconnect(starshipId: string, provider: ConnectorProvider) {
    const definition = getConnectorDefinition(provider);
    if (!definition) {
      throw new Error(`Unsupported connector provider: ${provider}`);
    }

    // Remove managed env vars for this provider
    const envKeys = [...definition.requiredEnvKeys, ...(definition.optionalEnvKeys || [])];
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
