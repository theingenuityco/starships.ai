import { getEnvConfig } from '@starships/env';
import type { HostRuntime } from '@starships/autopilot';
import type { StarshipModel } from '@starships/protocol';
import type { EnvironmentService } from '@/services/EnvironmentService';
import { importPKCS8, SignJWT } from 'jose';
import { ConnectorRepository } from '@starships/models';

// Connector base URLs for relative paths
// LinkedIn REST APIs are served under /rest; base URL must NOT include a version suffix.
const LINKEDIN_API_BASE_URL = 'https://api.linkedin.com';
const DISCORD_API_BASE_URL = 'https://discord.com/api';
const GOOGLE_DRIVE_API_BASE_URL = 'https://www.googleapis.com';
const GITHUB_API_BASE_URL = 'https://api.github.com';

/**
 * ConnectorRuntimeService
 *
 * Central place for building the Autopilot HostRuntime used by tools that
 * call external services via connectors (Starships, LinkedIn, GitHub, etc).
 *
 * This keeps connector-aware HTTP/auth behavior out of ConversationService.
 */
export class ConnectorRuntimeService {
  private readonly connectorRepository: ConnectorRepository;

  constructor(private readonly environmentService: EnvironmentService) {
    this.connectorRepository = new ConnectorRepository();
  }

  /**
   * Create a HostRuntime for a given starship and optional caller auth header.
   *
   * - Normalizes relative URLs:
   *   - connector === 'starships' or undefined => SERVER_URL/api/v1
   *   - connector === 'linkedin' => LinkedIn API base (LINKEDIN_API_BASE_URL or https://api.linkedin.com)
   *   - connector === 'discord' => Discord API base (DISCORD_API_BASE_URL or https://discord.com/api)
   * - Injects Starships JWT when connector === 'starships'
   * - Injects LinkedIn access token from managed env when connector === 'linkedin'
   */
  createHostRuntime(starship: StarshipModel, authorizationHeader?: string): HostRuntime {
    const env = getEnvConfig();
    const starshipsBaseUrl = `${env.SERVER_URL}/api/v1`;

    const rawAuth = authorizationHeader ?? '';
    const authToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;

    const hostRuntime: HostRuntime = {
      http: async ({ method, url, headers = {}, body, timeoutMs, connector }) => {
        const controller = new AbortController();
        const timeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // Normalize URL and apply connector-aware auth in the outer scope so
        // we can safely reference finalUrl in both success and error paths.
        let finalUrl = url;

        // Normalize URL: prefix connector-specific base URL for relative paths
        if (finalUrl.startsWith('/')) {
          let baseUrl: string;

          if (connector === 'linkedin') {
            // LinkedIn REST API base
            baseUrl = LINKEDIN_API_BASE_URL;
          } else if (connector === 'discord') {
            // Discord HTTP API base
            baseUrl = DISCORD_API_BASE_URL;
          } else if (connector === 'google_drive') {
            // Google Drive REST API base (e.g. /drive/v3/files)
            baseUrl = GOOGLE_DRIVE_API_BASE_URL;
          } else if (connector === 'github') {
            // GitHub REST API base
            baseUrl = GITHUB_API_BASE_URL;
          } else {
            // Default: Starships API (tools, docs, etc.)
            baseUrl = starshipsBaseUrl;
          }

          finalUrl = baseUrl + finalUrl;
        }

        // Connector-aware auth injection
        if (connector === 'starships') {
          // Ensure Authorization header is present when we have an auth token
          if (authToken) {
            const lowered: Record<string, unknown> = {};
            Object.entries(headers).forEach(([k, v]) => {
              lowered[k.toLowerCase()] = v;
            });
            if (!lowered['authorization']) {
              headers = {
                ...headers,
                Authorization: `Bearer ${authToken}`,
              };
            }
          }
        } else if (connector === 'linkedin') {
          // Use managed LinkedIn connector secret from encrypted environments
          // and inject required REST headers (protocol + version) when missing.
          try {
            const decryptedEnv = await this.environmentService.getDecryptedEnvironment(starship.id);
            const rawToken = decryptedEnv['LINKEDIN_ACCESS_TOKEN'];
            const accessToken = typeof rawToken === 'string' ? rawToken.trim() : '';

            const lowered: Record<string, unknown> = {};
            Object.entries(headers).forEach(([k, v]) => {
              lowered[k.toLowerCase()] = v;
            });

            // Only inject Authorization if caller hasn't explicitly set it
            if (accessToken && !lowered['authorization']) {
              headers = {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
              };
            }

            // Ensure Rest.li protocol version header is present
            if (!lowered['x-restli-protocol-version']) {
              headers = {
                ...headers,
                'X-RestLi-Protocol-Version': '2.0.0',
              };
            }

            // Hardcode LinkedIn API version header unless caller overrides it
            if (!lowered['linkedin-version']) {
              headers = {
                ...headers,
                'LinkedIn-Version': '202511',
              };
            }
          } catch (err) {
            // Surface a clear connector-level error while preserving the original method/URL
            const reason = err instanceof Error ? err.message : 'Unknown LinkedIn connector error';
            console.error('[ConnectorRuntimeService] LinkedIn connector error', {
              method,
              url: finalUrl,
              starshipId: starship.id,
              error: reason,
            });
            throw new Error(`HTTP request failed: ${method.toUpperCase()} ${finalUrl} -> LinkedIn connector error: ${reason}`);
          }
        } else if (connector === 'discord') {
          // Inject Discord bot token from platform env (not starship-scoped)
          const botToken = env.DISCORD_BOT_TOKEN?.trim();
          if (botToken) {
            const lowered: Record<string, unknown> = {};
            Object.entries(headers).forEach(([k, v]) => {
              lowered[k.toLowerCase()] = v;
            });

            if (!lowered['authorization']) {
              headers = {
                ...headers,
                Authorization: `Bot ${botToken}`,
              };
            }
          }
        } else if (connector === 'google_drive') {
          // Use managed Google Drive connector secret from encrypted environments
          try {
            const decryptedEnv = await this.environmentService.getDecryptedEnvironment(starship.id);
            const rawToken = decryptedEnv['GOOGLE_DRIVE_ACCESS_TOKEN'];
            const accessToken = typeof rawToken === 'string' ? rawToken.trim() : '';

            if (accessToken) {
              const lowered: Record<string, unknown> = {};
              Object.entries(headers).forEach(([k, v]) => {
                lowered[k.toLowerCase()] = v;
              });

              // Only inject if caller hasn't explicitly set an Authorization header
              if (!lowered['authorization']) {
                headers = {
                  ...headers,
                  Authorization: `Bearer ${accessToken}`,
                };
              }
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Unknown Google Drive connector error';
            console.error('[ConnectorRuntimeService] Google Drive connector error', {
              method,
              url: finalUrl,
              starshipId: starship.id,
              error: reason,
            });
            throw new Error(`HTTP request failed: ${method.toUpperCase()} ${finalUrl} -> Google Drive connector error: ${reason}`);
          }
        } else if (connector === 'github') {
          // Use GitHub App installation token derived from platform env +
          // per-starship GitHub connector metadata (githubInstallationId).
          try {
            const appId = env.GITHUB_APP_ID?.trim();
            const privateKeyBase64 = env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
            if (!appId || !privateKeyBase64) {
              throw new Error('GitHub App is not configured. Please set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_BASE64.');
            }

            const githubConnector = await this.connectorRepository.findByStarshipAndProvider(starship.id, 'github');
            const githubMetadata = (githubConnector?.metadata || {}) as Record<string, unknown>;
            const installationIdRaw = githubMetadata.githubInstallationId;
            const installationId = typeof installationIdRaw === 'string' ? installationIdRaw.trim() : undefined;

            if (!installationId) {
              throw new Error('GitHub connector is not configured for this starship (missing githubInstallationId).');
            }

            const privateKeyPem = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
            const alg = 'RS256';
            const key = await importPKCS8(privateKeyPem, alg);

            const now = Math.floor(Date.now() / 1000);
            const jwt = await new SignJWT({})
              .setProtectedHeader({ alg })
              .setIssuedAt(now)
              .setExpirationTime(now + 600) // 10 minutes
              .setIssuer(appId)
              .sign(key);

            const tokenResp = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${jwt}`,
                Accept: 'application/vnd.github+json',
                'User-Agent': 'starships.ai/1.0',
              },
            });

            if (!tokenResp.ok) {
              const text = await tokenResp.text();
              throw new Error(`Failed to get GitHub App installation token: ${tokenResp.status} ${text}`);
            }

            const tokenJson = (await tokenResp.json()) as { token?: string };
            const installationToken = tokenJson.token?.trim();

            if (!installationToken) {
              throw new Error('GitHub App installation token missing in response');
            }

            const lowered: Record<string, unknown> = {};
            Object.entries(headers).forEach(([k, v]) => {
              lowered[k.toLowerCase()] = v;
            });

            if (!lowered['authorization']) {
              headers = {
                ...headers,
                Authorization: `Bearer ${installationToken}`,
              };
            }
          } catch (err) {
            const reason = err instanceof Error ? err.message : 'Unknown GitHub App connector error';
            console.error('[ConnectorRuntimeService] GitHub connector error', {
              method,
              url: finalUrl,
              starshipId: starship.id,
              error: reason,
            });
            throw new Error(`HTTP request failed: ${method.toUpperCase()} ${finalUrl} -> GitHub connector error: ${reason}`);
          }
        }

        try {
          const finalMethod = method.toUpperCase();
          const init: RequestInit = {
            method: finalMethod,
            headers: headers as Record<string, string>,
            signal: controller.signal,
          };

          if (body !== undefined && finalMethod !== 'GET' && finalMethod !== 'HEAD') {
            if (typeof body === 'string') {
              init.body = body;
            } else if (body && typeof body === 'object') {
              init.body = JSON.stringify(body);
              (init.headers as Record<string, string>) =
                typeof init.headers === 'object' && !Array.isArray(init.headers)
                  ? { 'content-type': 'application/json', ...(init.headers as Record<string, string>) }
                  : { 'content-type': 'application/json' };
            }
          }

          // Debug log for connector HTTP calls, especially LinkedIn body forwarding.
          // Safe for dev; consider gating or removing for production if too noisy.
          const debugBodyPreview =
            typeof init.body === 'string' ? init.body.slice(0, 500) : init.body === undefined ? undefined : '<non-string-body>';
          console.info('[ConnectorRuntimeService] outgoing HTTP', {
            method: finalMethod,
            url: finalUrl,
            connector,
            headers: init.headers,
            bodyPreview: debugBodyPreview,
          });

          // NOTE: connector is currently a hint; future versions can
          // route via connector records instead of direct HTTP.
          // For now we treat all HTTP uniformly and rely on URL/auth headers.

          const resp = await fetch(finalUrl, init);
          const contentType = resp.headers.get('content-type') || '';
          let responseBody: unknown;
          if (contentType.includes('application/json')) {
            try {
              responseBody = await resp.json();
            } catch {
              responseBody = await resp.text();
            }
          } else {
            responseBody = await resp.text();
          }

          const responseHeaders: Record<string, unknown> = {};
          resp.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          const result = {
            status: resp.status,
            statusText: resp.statusText,
            headers: responseHeaders,
            body: responseBody,
            url: resp.url,
          };
          return result;
        } catch (error) {
          const reason =
            controller.signal.aborted && !(error instanceof Error)
              ? `timeout after ${timeout}ms`
              : error instanceof Error
                ? error.message
                : 'Unknown error';
          console.error('[ConnectorRuntimeService] hostRuntime.http error', {
            method,
            url: finalUrl,
            connector,
            timeoutMs: timeout,
            reason,
          });
          throw new Error(`HTTP request failed: ${method.toUpperCase()} ${finalUrl} -> ${reason}`);
        } finally {
          clearTimeout(timeoutId);
        }
      },
    };

    return hostRuntime;
  }
}
