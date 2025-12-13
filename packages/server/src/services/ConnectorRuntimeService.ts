import { ConnectorTemplateRepository } from '@starships/models';
import type { ConnectorProvider } from '@starships/protocol';
import { getEnvConfig } from '@starships/env';
import { EnvironmentService } from './EnvironmentService';
import { generateJWT } from '@/utils/jwt';

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
  private environmentService: EnvironmentService;

  constructor() {
    this.connectorTemplateRepository = new ConnectorTemplateRepository();
    this.environmentService = new EnvironmentService();
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

    // Decrypt per-starship env vars once for all connectors.
    const decryptedEnv = await this.environmentService.getDecryptedEnvironment(starshipId);

    for (const tpl of templates) {
      const provider = tpl.provider as ConnectorProvider;
      const runtimeConfig = (tpl.runtimeConfig || {}) as Record<string, unknown>;

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
      const accessTokenEnvKey = runtimeConfig.accessTokenEnvKey as string | undefined;
      if (!accessTokenEnvKey) {
        continue;
      }

      const rawToken = (decryptedEnv as Record<string, unknown>)[accessTokenEnvKey];
      if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
        continue;
      }

      const baseUrl = this.getApiBaseUrl(tpl.provider as string, runtimeConfig);
      if (!baseUrl) {
        // Connector does not expose an HTTP base URL (or is not HTTP-based).
        continue;
      }

      connectors[provider] = {
        baseUrl,
        headers: {
          Authorization: `Bearer ${rawToken}`,
        },
      };
    }

    return connectors;
  }

  /**
   * Resolve the base API URL for a connector provider.
   *
   * Prefer an explicit apiBaseUrl in runtime_config when present, then fall
   * back to known first-party defaults for built-in connectors.
   */
  private getApiBaseUrl(provider: string, runtimeConfig: Record<string, unknown>): string | undefined {
    const rcBase = runtimeConfig.apiBaseUrl;
    if (typeof rcBase === 'string' && rcBase.trim().length > 0) {
      return rcBase.trim();
    }

    switch (provider) {
      case 'google_drive':
        return 'https://www.googleapis.com';
      case 'github':
        return 'https://api.github.com';
      case 'linkedin':
        return 'https://api.linkedin.com';
      case 'discord':
        return 'https://discord.com';
      default:
        return undefined;
    }
  }
}
