import { ConnectorRepository, ConnectorTemplateRepository } from '@starships/models';
import type { ConnectorProvider, ConnectorRuntimeConfig } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { ConnectorSecretService } from './ConnectorSecretService';
import { generateJWT } from '@/utils/jwt';
import { PlatformSecretService } from './PlatformSecretService';

export interface ConnectorHttpConfig {
  baseUrl: string;
  headers: Record<string, string>;
}

/**
 * ConnectorRuntimeService
 *
 * Builds HostRuntime HTTP connector configuration from:
 * - connector_templates (runtime_config, provider)
 * - per-starship decrypted environments
 * - current user/starship context
 *
 * Workflows only ever see connector slugs (e.g. "starships", "google_drive", "github").
 * This service is the single place where we translate those into base URLs and auth headers.
 */
export class ConnectorRuntimeService {
  private connectorTemplateRepository: ConnectorTemplateRepository;
  private connectorRepository: ConnectorRepository;
  private connectorSecretService: ConnectorSecretService;
  private platformSecretService: PlatformSecretService;

  constructor() {
    this.connectorTemplateRepository = new ConnectorTemplateRepository();
    this.connectorRepository = new ConnectorRepository();
    this.connectorSecretService = new ConnectorSecretService();
    this.platformSecretService = new PlatformSecretService();
  }

  private async resolveTokenRef(tokenRef: string, decryptedSecrets: Record<string, unknown>): Promise<string | undefined> {
    const ref = tokenRef.trim();
    if (!ref) return undefined;

    // Allow connector_templates.runtime_config.oauth.accessToken to reference platform secrets
    // without hard-coding providers in host code.
    //
    // Example (host-level secret token with a prefix):
    //   oauth.accessToken = "platform:MY_SERVICE_TOKEN"
    //   oauth.authPrefix  = "Bearer"
    if (ref.startsWith('platform:')) {
      const envKey = ref.slice('platform:'.length).trim();
      if (!envKey) return undefined;
      const secret = await this.platformSecretService.getSecret(envKey);
      return typeof secret === 'string' && secret.trim() ? secret.trim() : undefined;
    }

    const raw = decryptedSecrets[ref];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }

  private buildAuthHeaderValue(prefix: string | undefined, token: string): string {
    const p = typeof prefix === 'string' ? prefix.trim() : '';
    if (!p) return token;
    return `${p} ${token}`.trim();
  }

  /**
   * Build connector-aware HTTP configuration for the current starship/user
   * context. This is passed to the remote Autopilot runner and consumed only
   * inside the runner HostRuntime.
   *
   * If authUserId is missing, we currently do not build any connector config,
   * matching the historical behavior of ConversationService.
   */
  async buildConnectorHttpConfig(starshipId: string, authUserId?: string): Promise<Record<string, ConnectorHttpConfig>> {
    if (!authUserId) {
      return {};
    }

    const env = getEnvConfig();
    const connectors: Record<string, ConnectorHttpConfig> = {};

    // Load templates to understand which connectors exist and how they are wired.
    const templates = await this.connectorTemplateRepository.list();

    // Decrypt per-starship secrets once for all connectors.
    const decryptedSecrets = await this.connectorSecretService.getDecryptedSecrets(starshipId);

    for (const tpl of templates) {
      const provider = tpl.provider as ConnectorProvider;
      const runtimeConfig = (tpl.runtimeConfig || {}) as ConnectorRuntimeConfig;
      const oauthConfig = (runtimeConfig.oauth && typeof runtimeConfig.oauth === 'object' ? runtimeConfig.oauth : {}) as NonNullable<
        ConnectorRuntimeConfig['oauth']
      >;

      // Starships connector uses a platform JWT instead of a stored access token.
      if (runtimeConfig.usesPlatformJwt === true && provider === 'starships') {
        try {
          const token = await generateJWT({
            id: authUserId,
            starshipId,
          });
          const baseUrl = `${env.SERVER_URL}/api/v1`;
          connectors[provider] = {
            baseUrl,
            headers: {
              Authorization: `Bearer ${token}`,
            },
          };
        } catch (error) {
          console.error('[ConnectorRuntimeService] Failed to build starships connector HTTP configuration', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      // OAuth-style connectors typically specify which env key holds the access token.
      const accessTokenRef = typeof oauthConfig.accessToken === 'string' ? oauthConfig.accessToken : undefined;
      if (!accessTokenRef) {
        continue;
      }

      const resolvedToken = await this.resolveTokenRef(accessTokenRef, decryptedSecrets as Record<string, unknown>);
      if (!resolvedToken) {
        continue;
      }

      const baseUrl = this.getApiBaseUrl(tpl.provider as string, runtimeConfig);
      if (!baseUrl) {
        // Connector does not expose an HTTP base URL (or is not HTTP-based).
        continue;
      }

      // Some connectors (e.g. platform-secret-backed bot tokens) must only be exposed
      // to workflows when there is a connected record for this starship/provider.
      const requiresConnected =
        oauthConfig.requiresConnected === true || runtimeConfig.requiresConnected === true || accessTokenRef.trim().startsWith('platform:');
      if (requiresConnected) {
        const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
        if (!existing || existing.status !== 'connected') {
          continue;
        }
      }

      const authHeaderName =
        typeof oauthConfig.authHeaderName === 'string' && oauthConfig.authHeaderName.trim()
          ? oauthConfig.authHeaderName.trim()
          : 'Authorization';
      const authPrefix =
        typeof oauthConfig.authPrefix === 'string' && oauthConfig.authPrefix.trim().length >= 0 ? oauthConfig.authPrefix : 'Bearer';

      connectors[provider] = {
        baseUrl,
        headers: {
          [authHeaderName]: this.buildAuthHeaderValue(authPrefix, resolvedToken),
        },
      };
    }

    return connectors;
  }

  /**
   * Resolve the base API URL for a connector provider.
   *
   * Source of truth is connector_templates.runtime_config.apiBaseUrl.
   */
  private getApiBaseUrl(provider: string, runtimeConfig: ConnectorRuntimeConfig): string | undefined {
    const rcBase = runtimeConfig.apiBaseUrl;
    if (typeof rcBase === 'string' && rcBase.trim().length > 0) {
      return rcBase.trim();
    }
    return undefined;
  }
}
