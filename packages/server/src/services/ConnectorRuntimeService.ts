import { ConnectorRepository, ConnectorTemplateRepository } from '@starships/models';
import type { ConnectorProvider, ConnectorRuntimeConfig, ConnectorSecretRefType, ConnectorTokenRef } from '@starships/protocol';
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

  private parseSecretRef(ref: unknown): { type: ConnectorSecretRefType; key: string } | undefined {
    // Legacy string formats (kept for backwards compatibility with older connector_templates.runtime_config):
    // - "platform:DISCORD_BOT_TOKEN" => platform_secret
    // - "GH_APP_ACCESS_TOKEN" => connector_secret
    if (typeof ref === 'string') {
      const raw = ref.trim();
      if (!raw) return undefined;
      if (raw.startsWith('platform:')) {
        const key = raw.slice('platform:'.length).trim();
        return key ? { type: 'platform_secret', key } : undefined;
      }
      return { type: 'connector_secret', key: raw };
    }

    if (ref && typeof ref === 'object') {
      const rec = ref as Record<string, unknown>;
      const type = rec.type;
      const key = rec.key;
      if ((type === 'platform_secret' || type === 'connector_secret') && typeof key === 'string' && key.trim()) {
        return { type, key: key.trim() };
      }
    }

    return undefined;
  }

  private async resolveTokenRef(tokenRef: ConnectorTokenRef, decryptedSecrets: Record<string, unknown>): Promise<string | undefined> {
    const parsed = this.parseSecretRef(tokenRef);
    if (!parsed) return undefined;

    if (parsed.type === 'platform_secret') {
      const secret = await this.platformSecretService.getSecret(parsed.key);
      return typeof secret === 'string' && secret.trim() ? secret.trim() : undefined;
    }

    const raw = decryptedSecrets[parsed.key];
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
      const accessTokenRef = oauthConfig.accessToken as ConnectorTokenRef | undefined;
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

      // Connectors should only be exposed to workflows when the connector is connected
      // for this starship (except the internal "starships" connector handled above).
      const existing = await this.connectorRepository.findByStarshipAndProvider(starshipId, provider);
      if (!existing || existing.status !== 'connected') {
        continue;
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
