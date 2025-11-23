import { getConnectorCatalog, getConnectorDefinition } from '@/config/connectors';
import type { ConnectorCatalogItem, ConnectorListItem, ConnectorProvider, ConnectWithApiKeyRequest } from '@starships/protocol';
import { ConnectorRepository, EnvironmentRepository, StarshipRepository } from '@starships/models';
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
  private environmentRepository: EnvironmentRepository;
  private environmentService: EnvironmentService;
  private starshipRepository: StarshipRepository;

  constructor() {
    this.connectorRepository = new ConnectorRepository();
    this.environmentRepository = new EnvironmentRepository();
    this.environmentService = new EnvironmentService();
    this.starshipRepository = new StarshipRepository();
  }

  getConnectorCatalog(): ConnectorCatalogItem[] {
    return getConnectorCatalog();
  }

  /**
   * Start LinkedIn OAuth flow for a starship and return the authorization URL.
   */
  async startLinkedInOAuth(starshipId: string, userId: string): Promise<string> {
    const env = getEnvConfig();
    const clientId = env.LINKEDIN_CLIENT_ID;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/linkedin/oauth/callback`;

    if (!clientId) {
      throw new Error('LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID.');
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider: 'linkedin',
    });

    // Request the minimal set of scopes needed for posting on behalf of a member:
    // - w_member_social: create and manage member posts
    // - openid profile email: basic OIDC identity for the connected member
    const scope = 'w_member_social openid profile email';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      state,
      scope,
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  /**
   * Complete LinkedIn OAuth flow: validate state, exchange code for token,
   * store LINKEDIN_ACCESS_TOKEN env var, and update connector status/metadata.
   */
  async completeLinkedInOAuth(code: string, stateToken: string): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.LINKEDIN_CLIENT_ID;
    const clientSecret = env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/linkedin/oauth/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET.');
    }

    const stateValidation = await validateOAuthState(stateToken);
    if (!stateValidation.valid) {
      throw new Error('Invalid or expired OAuth state');
    }

    const { userId, context } = stateValidation;
    if (!userId) {
      throw new Error('OAuth state missing user information');
    }

    const starshipId = (context as any)?.starshipId as string | undefined;
    const provider = (context as any)?.provider as string | undefined;

    if (!starshipId || provider !== 'linkedin') {
      throw new Error('OAuth state missing starship context');
    }

    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', tokenParams.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token as string | undefined;
    const expiresIn = tokenResponse.data.expires_in as number | undefined;

    if (!accessToken) {
      throw new Error('Failed to obtain LinkedIn access token');
    }

    const metadata: Record<string, unknown> = {
      ...(expiresIn ? { expiresIn } : {}),
      provider: 'linkedin',
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'linkedin');
    const connector =
      existing ??
      (await this.connectorRepository.create({
        starshipId,
        provider: 'linkedin',
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

    // Persist env var for this starship and link it to the connector
    await this.upsertEnvironmentVariable(starshipId, 'LINKEDIN_ACCESS_TOKEN', accessToken, userId, connector.id);

    const starship = await this.starshipRepository.findById(starshipId);

    return {
      starshipId,
      starshipSlug: starship?.slug,
      userId,
    };
  }

  /**
   * Start Google Drive OAuth flow for a starship and return the authorization URL.
   */
  async startGoogleDriveOAuth(starshipId: string, userId: string): Promise<string> {
    const env = getEnvConfig();
    const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/google_drive/oauth/callback`;

    if (!clientId) {
      throw new Error('Google Drive OAuth is not configured. Please set GOOGLE_DRIVE_CLIENT_ID.');
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider: 'google_drive',
    });

    // Request typical Drive scopes; adjust to your needs:
    // - drive.file: per-file access created/opened via the app
    // - drive.metadata.readonly: read metadata for files
    const scope = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Complete Google Drive OAuth flow: validate state, exchange code for token,
   * store GOOGLE_DRIVE_ACCESS_TOKEN / GOOGLE_DRIVE_REFRESH_TOKEN env vars,
   * and update connector status/metadata.
   */
  async completeGoogleDriveOAuth(
    code: string,
    stateToken: string
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/google_drive/oauth/callback`;

    if (!clientId || !clientSecret) {
      throw new Error(
        'Google Drive OAuth is not configured. Please set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.'
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

    const starshipId = (context as any)?.starshipId as string | undefined;
    const provider = (context as any)?.provider as string | undefined;

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

  /**
   * Start GitHub OAuth flow for a starship and return the authorization URL.
   */
  async startGitHubOAuth(starshipId: string, userId: string): Promise<string> {
    const env = getEnvConfig();
    const clientId = env.GH_OAUTH_CLIENT_ID;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/github/oauth/callback`;

    if (!clientId || !redirectUri) {
      throw new Error('GitHub OAuth is not configured. Please set GH_OAUTH_CLIENT_ID.');
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider: 'github',
    });

    // Request repo and basic user scopes so tools can interact with repositories
    // and read basic profile data as needed.
    const scope = 'repo read:user user:email';

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Complete GitHub OAuth flow: validate state, exchange code for token,
   * store GITHUB_ACCESS_TOKEN env var, and update connector status/metadata.
   */
  async completeGitHubOAuth(
    code: string,
    stateToken: string
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.GH_OAUTH_CLIENT_ID;
    const clientSecret = env.GH_OAUTH_CLIENT_SECRET;
    const redirectUri = `${env.PUBLIC_URL}/api/v1/connectors/github/oauth/callback`;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('GitHub OAuth is not configured. Please set GH_OAUTH_CLIENT_ID and GH_OAUTH_CLIENT_SECRET.');
    }

    const stateValidation = await validateOAuthState(stateToken);
    if (!stateValidation.valid) {
      throw new Error('Invalid or expired OAuth state');
    }

    const { userId, context } = stateValidation;
    if (!userId) {
      throw new Error('OAuth state missing user information');
    }

    const starshipId = (context as any)?.starshipId as string | undefined;
    const provider = (context as any)?.provider as string | undefined;

    if (!starshipId || provider !== 'github') {
      throw new Error('OAuth state missing starship context');
    }

    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'starships.ai/1.0',
        },
      }
    );

    const tokenData = tokenResponse.data as any;
    const accessToken = tokenData?.access_token as string | undefined;

    if (!accessToken) {
      throw new Error('Failed to obtain GitHub access token');
    }

    const metadata: Record<string, unknown> = {
      provider: 'github',
      scope: tokenData?.scope,
      tokenType: tokenData?.token_type,
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'github');
    const connector =
      existing ??
      (await this.connectorRepository.create({
        starshipId,
        provider: 'github',
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

    // Persist env var for this starship and link it to the connector
    await this.upsertEnvironmentVariable(starshipId, 'GITHUB_ACCESS_TOKEN', accessToken, userId, connector.id);

    const starship = await this.starshipRepository.findById(starshipId);

    return {
      starshipId,
      starshipSlug: starship?.slug,
      userId,
    };
  }

  /**
   * List connectors for a starship, enriched with managed env key presence.
   */
  async listStarshipConnectors(starshipId: string): Promise<ConnectorListItem[]> {
    const [catalog, connectors, envSummaries] = await Promise.all([
      Promise.resolve(getConnectorCatalog()),
      this.connectorRepository.findByStarship(starshipId),
      this.environmentService.getEnvironmentVariables(starshipId),
    ]);

    const envKeys = new Set(envSummaries.map((env) => env.key));
    const byProvider = new Map(connectors.map((c) => [c.provider, c]));

    const now = new Date().toISOString();

    return catalog.map<ConnectorListItem>((entry) => {
      const existing = byProvider.get(entry.provider);

      const managedEnvKeys = [
        ...entry.requiredEnvKeys.map((key) => ({
          key,
          present: envKeys.has(key),
        })),
        ...(entry.optionalEnvKeys || []).map((key) => ({
          key,
          present: envKeys.has(key),
        })),
      ];

      if (existing) {
        return {
          ...existing,
          managedEnvKeys,
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
        metadata: {},
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        managedEnvKeys,
      };
    });
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
    const scope = 'bot applications.commands identify';

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

    const starshipId = (context as any)?.starshipId as string | undefined;
    const provider = (context as any)?.provider as string | undefined;

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

    await this.connectorRepository.update(existing.id, {
      status: 'disconnected',
      metadata: existing.metadata || {},
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
