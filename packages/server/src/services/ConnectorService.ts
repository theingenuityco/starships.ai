import { getConnectorCatalog, getConnectorDefinition } from '@/config/connectors';
import type {
  ConnectorCatalogItem,
  ConnectorListItem,
  ConnectorProvider,
  ConnectWithApiKeyRequest,
} from '@starships/protocol';
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
    const redirectUri = env.LINKEDIN_REDIRECT_URL;

    if (!clientId || !redirectUri) {
      throw new Error('LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URL.');
    }

    const state = await generateOAuthState(true, userId, {
      starshipId,
      provider: 'linkedin',
    });

    const scope = 'w_member_social';
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
  async completeLinkedInOAuth(
    code: string,
    stateToken: string,
  ): Promise<{ starshipId: string; starshipSlug?: string; userId: string }> {
    const env = getEnvConfig();
    const clientId = env.LINKEDIN_CLIENT_ID;
    const clientSecret = env.LINKEDIN_CLIENT_SECRET;
    const redirectUri = env.LINKEDIN_REDIRECT_URL;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'LinkedIn OAuth is not configured. Please set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URL.',
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

    // Persist env var for this starship
    await this.upsertEnvironmentVariable(starshipId, 'LINKEDIN_ACCESS_TOKEN', accessToken, userId);

    const metadata: Record<string, unknown> = {
      ...(expiresIn ? { expiresIn } : {}),
      provider: 'linkedin',
    };

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, 'linkedin');
    if (!existing) {
      await this.connectorRepository.create({
        starshipId,
        provider: 'linkedin',
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

      // Virtual connector entry for providers without a persisted record yet
      return {
        id: `${starshipId}:${entry.provider}`,
        starshipId,
        provider: entry.provider,
        status: 'disconnected',
        metadata: {},
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        managedEnvKeys,
      };
    });
  }

  /**
   * Connect a provider using an API key (e.g., Discord).
   * This method is provider-aware and will upsert the appropriate
   * environment variables for the starship.
   */
  async connectWithApiKey(
    starshipId: string,
    provider: ConnectorProvider,
    payload: ConnectWithApiKeyRequest,
    userId: string,
  ) {
    const definition = getConnectorDefinition(provider);
    if (!definition) {
      throw new Error(`Unsupported connector provider: ${provider}`);
    }

    if (definition.authType !== 'api_key') {
      throw new Error(`Connector ${provider} does not use API key authentication`);
    }

    // Provider-specific handling
    switch (provider) {
      case 'discord': {
        await this.upsertEnvironmentVariable(starshipId, 'DISCORD_BOT_TOKEN', payload.apiKey, userId);

        const defaultChannelId = (payload.extraConfig as any)?.defaultChannelId;
        if (typeof defaultChannelId === 'string' && defaultChannelId.trim().length > 0) {
          await this.upsertEnvironmentVariable(
            starshipId,
            'DISCORD_DEFAULT_CHANNEL_ID',
            defaultChannelId.trim(),
            userId,
          );
        }
        break;
      }
      default:
        throw new Error(`API key connector not implemented for provider: ${provider}`);
    }

    const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
    const mergedMetadata = {
      ...(existing?.metadata || {}),
      ...(payload.extraConfig || {}),
    };

    if (!existing) {
      return this.connectorRepository.create({
        starshipId,
        provider,
        status: 'connected',
        metadata: mergedMetadata,
        lastError: undefined,
      });
    }

    return this.connectorRepository.update(existing.id, {
      status: 'connected',
      metadata: mergedMetadata,
      lastError: null,
    });
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
      }),
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
   */
  private async upsertEnvironmentVariable(
    starshipId: string,
    key: string,
    value: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.environmentRepository.findByStarshipAndKey(starshipId, key);

    if (!existing) {
      await this.environmentRepository.create({
        starshipId,
        key,
        value,
        description: `Managed by connector`,
        createdBy: userId,
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


