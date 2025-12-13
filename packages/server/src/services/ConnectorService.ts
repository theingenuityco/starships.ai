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

const LINKEDIN_SCOPES = [
  // Member-level posting and analytics
  'r_basicprofile',
  'w_member_social',
  'r_member_postAnalytics',
  'r_member_profileAnalytics',
  // Organization-level posting and analytics
  'rw_organization_admin',
  'r_organization_social',
  'w_organization_social',
  'r_organization_social_feed',
  'r_organization_followers',
];

const GOOGLE_DRIVE_SCOPES = [
  // Per-file access created/opened via the app
  'https://www.googleapis.com/auth/drive.file',
  // Read metadata for files
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const DISCORD_SCOPES = ['bot', 'applications.commands', 'identify'];

function getProviderScopes(provider: ConnectorProvider): string[] {
  switch (provider) {
    case 'linkedin':
      return LINKEDIN_SCOPES;
    case 'google_drive':
      return GOOGLE_DRIVE_SCOPES;
    case 'discord':
      return DISCORD_SCOPES;
    default:
      return [];
  }
}

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
   * Complete Google Drive OAuth flow: validate state, exchange code for token,
   * store GOOGLE_DRIVE_ACCESS_TOKEN / GOOGLE_DRIVE_REFRESH_TOKEN env vars,
   * and update connector status/metadata.
   */
  async completeGoogleDriveOAuth(code: string, stateToken: string): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/google_drive/oauth/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google Drive OAuth is not configured. Please set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.');
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

    if (!starshipId || provider !== 'google_drive') {
      throw new Error('OAuth state missing starship context');
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', tokenParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token as string | undefined;
    const refreshToken = tokenResponse.data.refresh_token as string | undefined;
    const expiresIn = tokenResponse.data.expires_in as number | undefined;

    if (!accessToken) {
      throw new Error('Failed to obtain Google Drive access token');
    }

    const metadata: Record<string, unknown> = {
      provider: 'google_drive',
      ...(expiresIn ? { expiresIn } : {}),
      hasRefreshToken: !!refreshToken,
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'google_drive');
    const connector =
      existing ??
      (await this.connectorRepository.create({
        starshipId,
        provider: 'google_drive',
        status: 'connected',
        metadata,
        lastError: undefined,
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
    await this.upsertEnvironmentVariable(starshipId, 'GOOGLE_DRIVE_ACCESS_TOKEN', accessToken, userId, connector.id);
    if (refreshToken) {
      await this.upsertEnvironmentVariable(starshipId, 'GOOGLE_DRIVE_REFRESH_TOKEN', refreshToken, userId, connector.id);
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
    const [catalog, connectors] = await Promise.all([this.getConnectorCatalog(), this.connectorRepository.findByStarship(starshipId)]);
    const byProvider = new Map(connectors.map((c) => [c.provider, c]));

    const now = new Date().toISOString();

    return catalog.map<ConnectorListItem>((entry) => {
      const existing = byProvider.get(entry.provider);

      if (existing) {
        return {
          id: existing.id,
          starshipId: existing.starshipId,
          provider: existing.provider,
          status: existing.status,
          lastError: existing.lastError,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          scopes: getProviderScopes(entry.provider),
        };
      }

      // Virtual connector entry for providers without a persisted record yet.
      // For Starships, treat the connector as always available for the current
      // starship; it reuses the platform's JWT + SERVER_URL and does not
      // require additional managed env vars.
      const status = entry.provider === 'starships' ? 'connected' : 'disconnected';

      return {
        id: `${starshipId}:${entry.provider}`,
        starshipId,
        provider: entry.provider,
        status,
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        scopes: getProviderScopes(entry.provider),
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

  /**
   * Start Discord OAuth flow for a starship and return the authorization URL.
   */
  async startDiscordOAuth(starshipId: string, userId: string): Promise<string> {
    const env = getEnvConfig();
    const clientId = env.DISCORD_CLIENT_ID;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/discord/oauth/callback`;

    if (!clientId) {
      throw new Error('Discord OAuth is not configured. Please set DISCORD_CLIENT_ID.');
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider: 'discord',
    });

    // Permissions bitmask: Make-style admin-ish set + SEND_MESSAGES.
    // Includes: CREATE_INSTANT_INVITE, MANAGE_CHANNELS, VIEW_CHANNEL,
    // SEND_MESSAGES, MANAGE_MESSAGES, MANAGE_ROLES, MANAGE_WEBHOOKS.
    const permissions = '805317649';
    const scope = DISCORD_SCOPES.join(' ');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope,
      permissions,
      state,
    });

    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Complete Discord OAuth flow: validate state, exchange code (if needed),
   * record guild configuration, and update connector status/metadata.
   */
  async completeDiscordOAuth(
    code: string,
    stateToken: string,
    callbackParams: { guild_id?: string; permissions?: string }
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.DISCORD_CLIENT_ID;
    const clientSecret = env.DISCORD_CLIENT_SECRET;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/discord/oauth/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Discord OAuth is not configured. Please set DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET.');
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

    if (!starshipId || provider !== 'discord') {
      throw new Error('OAuth state missing starship context');
    }

    // Exchange code for an access token (not strictly needed for posting as a bot,
    // but kept for future use or validation if necessary).
    const tokenParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    await axios.post('https://discord.com/api/oauth2/token', tokenParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const guildId = callbackParams.guild_id;
    const permissions = callbackParams.permissions;

    const metadata: Record<string, unknown> = {
      provider: 'discord',
      ...(guildId ? { guildId } : {}),
      ...(permissions ? { permissions } : {}),
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'discord');
    if (!existing) {
      await this.connectorRepository.create({
        starshipId,
        provider: 'discord',
        status: 'connected',
        metadata,
        lastError: undefined,
      });
    } else {
      await this.connectorRepository.update(existing.id, {
        status: 'connected',
        metadata: {
          ...(existing.metadata || {}),
          ...metadata,
        },
        lastError: null,
      });
    }

    const starship = await this.starshipRepository.findById(starshipId);

    return {
      starshipId,
      starshipSlug: starship?.slug,
      userId,
    };
  }

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
