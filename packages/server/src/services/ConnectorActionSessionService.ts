import type {
  ConnectorDbSessionV2,
  ConnectorHttpEndpointV2,
  ConnectorProvider,
  ConnectorSessionV2,
  ConnectorTemplateRuntimeFieldsV2,
  SecretRef,
} from '@starships/protocol';
import { ConnectorRepository } from '@starships/models';
import { ConnectorSecretService } from './ConnectorSecretService';
import { PlatformSecretService } from './PlatformSecretService';
import { ConnectorRegistryClient } from './ConnectorRegistryClient';
import { connectorRegistry } from '@starships/connectors';
import { connectorEnv, makeSecretResolver } from './connectorStrategy';
import { generateJWT } from '@/utils/jwt';
import { buildBasicAuthHeaderValue } from '@/utils/basicAuth';

export type ConnectorSession = ConnectorSessionV2;

export interface ConnectorActionSessionBundle {
  connectorTemplates: Record<string, ConnectorTemplateRuntimeFieldsV2>;
  connectorSessions: Record<string, ConnectorSession>;
  connectorMetadata: Record<string, Record<string, unknown>>;
}

export class ConnectorActionSessionService {
  private templateRegistry = new ConnectorRegistryClient();
  private connectorRepo = new ConnectorRepository();
  private connectorSecrets = new ConnectorSecretService();
  private platformSecrets = new PlatformSecretService();

  private async resolveSecretRef(
    starshipId: string,
    ref: SecretRef,
    decryptedConnectorSecrets: Record<string, unknown>
  ): Promise<string | undefined> {
    if (ref.type === 'platform_secret') {
      const v = await this.platformSecrets.getSecret(ref.key);
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    }
    const raw = decryptedConnectorSecrets[ref.key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  }

  private coerceBool(v: unknown): boolean | undefined {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') {
      const s = v.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
      if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
    }
    return undefined;
  }

  private coerceInt(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
    if (typeof v === 'string' && v.trim()) {
      const n = Number(v.trim());
      if (Number.isFinite(n)) return Math.floor(n);
    }
    return undefined;
  }

  private coerceNonEmptyString(v: unknown): string | undefined {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return undefined;
  }

  private buildPostgresDbSession(args: {
    metadata: Record<string, unknown>;
    user: string;
    password?: string;
  }): ConnectorDbSessionV2 | null {
    const md = args.metadata ?? {};
    const host =
      this.coerceNonEmptyString(md.host) ??
      this.coerceNonEmptyString(md.hostname) ??
      this.coerceNonEmptyString(md.pgHost) ??
      this.coerceNonEmptyString(md.postgresHost);
    const port = this.coerceInt(md.port ?? md.pgPort ?? md.postgresPort) ?? 5432;
    const database =
      this.coerceNonEmptyString(md.database) ??
      this.coerceNonEmptyString(md.db) ??
      this.coerceNonEmptyString(md.pgDatabase) ??
      this.coerceNonEmptyString(md.postgresDatabase);

    if (!host || !database) return null;

    const ssl = this.coerceBool(md.ssl ?? md.pgSsl ?? md.postgresSsl);

    return {
      driver: 'postgres',
      host,
      port,
      database,
      user: args.user,
      ...(args.password ? { password: args.password } : {}),
      ...(ssl !== undefined ? { ssl } : {}),
    };
  }

  async build(starshipId: string, authUserId: string): Promise<ConnectorActionSessionBundle> {
    const templates = await this.templateRegistry.list();
    const connectorRows = await this.connectorRepo.findByStarship(starshipId);
    const byProvider = new Map(connectorRows.map((c) => [c.provider, c]));

    const decrypted = await this.connectorSecrets.getDecryptedSecrets(starshipId);

    // Reserved "system" connector metadata is injected from platform secrets (instance-admin managed).
    // These values are non-secret configuration (e.g. zone names) but are still managed centrally.
    const systemInjectedMetadata: Record<string, unknown> = {};
    try {
      const webFetchZone = await this.platformSecrets.getSecret('SYSTEM_CONNECTOR_WEBFETCH_ZONE');
      const webSearchZone = await this.platformSecrets.getSecret('SYSTEM_CONNECTOR_WEBSEARCH_ZONE');
      if (typeof webFetchZone === 'string' && webFetchZone.trim()) systemInjectedMetadata.webFetchZone = webFetchZone.trim();
      if (typeof webSearchZone === 'string' && webSearchZone.trim()) systemInjectedMetadata.webSearchZone = webSearchZone.trim();
    } catch {
      // best-effort
    }

    const connectorTemplates: Record<string, ConnectorTemplateRuntimeFieldsV2> = {};
    const connectorSessions: Record<string, ConnectorSession> = {};
    const connectorMetadata: Record<string, Record<string, unknown>> = {};

    for (const tpl of templates) {
      if (tpl.isEnabled === false) continue;
      const provider = tpl.provider as ConnectorProvider;

      const runtimeTemplate: ConnectorTemplateRuntimeFieldsV2 = {
        baseUrl: tpl.baseUrl,
        auth: tpl.authJson,
        variables: tpl.variablesJson,
        endpoints: tpl.endpoints,
        rateLimit: tpl.rateLimitJson,
        metadataSchema: tpl.metadataSchemaJson,
      };

      connectorTemplates[provider] = runtimeTemplate;
      connectorMetadata[provider] = byProvider.get(provider)?.metadata ?? {};

      // Code-driven connectors (e.g. GitHub App) build their session via the strategy:
      // the host mints a short-lived credential (installation token) per session and
      // injects it as session headers. Only exposed when the connector is connected.
      const codeDef = connectorRegistry.get(provider);
      if (codeDef && codeDef.auth.kind === 'github_app') {
        const conn = byProvider.get(provider);
        if (!conn || conn.status !== 'connected') continue;
        try {
          const session = await codeDef.auth.buildSession({
            starshipId,
            authUserId,
            env: connectorEnv,
            secrets: makeSecretResolver(decrypted as Record<string, unknown>),
            metadata: conn.metadata ?? {},
          });
          if (session) connectorSessions[provider] = session;
        } catch (err) {
          // A misconfigured App (or a transient GitHub error) must not break the whole
          // session bundle for other connectors; just skip this connector's session.
          console.error('[CONNECTOR] Failed to build code-connector session', {
            provider,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }

      const auth = runtimeTemplate.auth;
      const type = auth.type;
      const hasSqlEndpoints = Array.isArray(runtimeTemplate.endpoints) ? runtimeTemplate.endpoints.some((e) => e.kind === 'sql') : false;

      // Internal connector: always available.
      if (type === 'platform_jwt') {
        const token = await generateJWT({ id: authUserId, starshipId });
        const headerName = typeof auth.headerName === 'string' && auth.headerName.trim() ? auth.headerName.trim() : 'Authorization';
        const prefix = typeof auth.tokenPrefix === 'string' ? auth.tokenPrefix : 'Bearer';
        connectorSessions[provider] = {
          headers: { [headerName]: prefix ? `${prefix} ${token}` : token },
        };
        continue;
      }

      // For non-internal connectors, only expose sessions when connected.
      const conn = byProvider.get(provider);
      if (!conn || conn.status !== 'connected') continue;

      if (type === 'none') {
        connectorSessions[provider] = { headers: {} };
        continue;
      }

      if (type === 'oauth2') {
        const token = await this.resolveSecretRef(starshipId, auth.accessTokenRef, decrypted as Record<string, unknown>);
        if (!token) continue;
        const inj = auth.injection || { style: 'header' };
        if (inj.style !== 'header') {
          // Query-style injection is intentionally unsupported in v2 runtime sessions for now.
          continue;
        }
        const headerName = typeof inj.headerName === 'string' && inj.headerName.trim() ? inj.headerName.trim() : 'Authorization';
        const prefix = typeof inj.tokenPrefix === 'string' ? inj.tokenPrefix : 'Bearer';
        connectorSessions[provider] = {
          headers: { [headerName]: prefix ? `${prefix} ${token}` : token },
        };
        continue;
      }

      if (type === 'api_key') {
        const token = await this.resolveSecretRef(starshipId, auth.apiKeyRef, decrypted as Record<string, unknown>);
        if (!token) continue;
        const inj = auth.injection || { style: 'header' };
        if (inj.style !== 'header') continue;
        const headerName = typeof inj.headerName === 'string' && inj.headerName.trim() ? inj.headerName.trim() : 'Authorization';
        const prefix = typeof inj.tokenPrefix === 'string' ? inj.tokenPrefix : '';
        connectorSessions[provider] = {
          headers: { [headerName]: prefix ? `${prefix} ${token}` : token },
        };
        continue;
      }

      if (type === 'basic') {
        const username = await this.resolveSecretRef(starshipId, auth.usernameRef, decrypted as Record<string, unknown>);
        if (!username) continue;
        const password = auth.passwordRef
          ? await this.resolveSecretRef(starshipId, auth.passwordRef, decrypted as Record<string, unknown>)
          : '';
        // If passwordRef is provided but missing/blank, don't expose a session (connector isn't ready).
        if (auth.passwordRef && password === undefined) continue;

        const headerName = typeof auth.headerName === 'string' && auth.headerName.trim() ? auth.headerName.trim() : 'Authorization';
        const headers = { [headerName]: buildBasicAuthHeaderValue(username, password ?? '') };

        // For SQL-capable connectors, also pass a db session alongside headers.
        if (hasSqlEndpoints) {
          const db = this.buildPostgresDbSession({
            metadata: connectorMetadata[provider] ?? {},
            user: username,
            password: password ?? undefined,
          });
          if (!db) continue;
          connectorSessions[provider] = { headers, db };
          continue;
        }

        connectorSessions[provider] = { headers };
        continue;
      }
    }

    // Built-in reserved "system" connector (NOT DB-backed).
    // This connector is injected into every runner session bundle and is enabled when
    // the required platform secrets exist.
    //
    // Backend implementation details (Bright Data endpoints, etc.) are intentionally hidden
    // behind stable action names so we can swap providers later without changing tools.
    {
      const provider: ConnectorProvider = 'system';

      const runtimeTemplate: ConnectorTemplateRuntimeFieldsV2 = {
        baseUrl: 'https://api.brightdata.com',
        auth: {
          type: 'api_key',
          apiKeyRef: { type: 'platform_secret', key: 'SYSTEM_CONNECTOR_WEB_GATEWAY_API_KEY' },
          injection: { style: 'header', headerName: 'Authorization', tokenPrefix: 'Bearer' },
        },
        endpoints: [
          {
            name: 'webFetch',
            description: 'Fetch a public URL via the system web fetch gateway',
            method: 'POST',
            path: '/request',
            requestStyle: 'json',
            timeoutMs: 60000,
            parameters: {
              type: 'object',
              required: ['url'],
              properties: {
                url: { type: 'string', description: 'Target URL to fetch (absolute http(s) URL)' },
                method: { type: 'string', description: 'HTTP method (GET, POST, ...). Default GET.' },
                headers: { type: 'object', description: 'Optional headers to send to the target site.' },
                body: { description: 'Optional request body (string or JSON object). Ignored for GET/HEAD.' },
                format: { type: 'string', enum: ['raw', 'json'], description: 'Backend response format. Default raw.' },
                dataFormat: { type: 'string', description: 'Optional backend data_format (e.g. markdown, screenshot).' },
                country: { type: 'string', description: 'Optional ISO country code for routing.' },
              },
              additionalProperties: true,
            },
            mapping: {
              body: {
                zone: '{{ String(metadata.webFetchZone ?? "") }}',
                url: '{{ String(args.url ?? "") }}',
                format: '{{ String(args.format ?? "raw") }}',
                method: '{{ String(args.method ?? "GET").toUpperCase() }}',
                country: '{{ args.country }}',
                data_format: '{{ args.dataFormat }}',
                headers:
                  '{{ (() => { const h = args.headers; if (!h || typeof h !== "object" || Array.isArray(h)) return undefined; const out = {}; for (const [k, v] of Object.entries(h)) { if (!k) continue; if (v === undefined || v === null) continue; out[k] = Array.isArray(v) ? v.map((x) => String(x)).join(",") : String(v); } return out; })() }}',
                body:
                  '{{ (() => { const m = String(args.method ?? "GET").toUpperCase(); if (m === "GET" || m === "HEAD") return undefined; const b = args.body; if (b === undefined || b === null) return undefined; if (typeof b === "string") return b; try { return JSON.stringify(b); } catch { return String(b); } })() }}',
              },
            },
          } satisfies ConnectorHttpEndpointV2,
          {
            name: 'webSearch',
            description: 'Run a web search via the system search gateway',
            method: 'POST',
            path: '/request',
            requestStyle: 'json',
            timeoutMs: 45000,
            parameters: {
              type: 'object',
              required: ['q'],
              properties: {
                q: { type: 'string', description: 'Search query' },
                engine: { type: 'string', enum: ['google', 'bing'], description: 'Search engine (default google)' },
                hl: { type: 'string', description: 'Language code (e.g. en)' },
                gl: { type: 'string', description: 'Country code (e.g. us)' },
                num: { type: 'number', description: 'Requested number of results (engine dependent)' },
                start: { type: 'number', description: 'Result offset / page start (engine dependent)' },
                format: { type: 'string', enum: ['raw', 'json'], description: 'Backend response format. Default json.' },
                dataFormat: { type: 'string', description: 'Optional backend data_format (e.g. parsed_light, markdown).' },
                country: { type: 'string', description: 'Optional ISO country code for routing.' },
                url: { type: 'string', description: 'Optional override: full SERP URL to request (advanced)' },
              },
              additionalProperties: true,
            },
            mapping: {
              body: {
                zone: '{{ String(metadata.webSearchZone ?? "") }}',
                url:
                  '{{ (() => { const override = typeof args.url === "string" ? args.url.trim() : ""; if (override) return override; const q = String(args.q ?? "").trim(); const engine = String(args.engine ?? "google").toLowerCase(); const hl = String(args.hl ?? "en").trim(); const gl = String(args.gl ?? "us").trim(); const num = args.num; const start = args.start; if (engine === "bing") { let u = "https://www.bing.com/search?q=" + encodeURIComponent(q); if (hl) u += "&setlang=" + encodeURIComponent(hl); if (gl) u += "&cc=" + encodeURIComponent(gl); if (typeof start === "number" && Number.isFinite(start) && start > 0) u += "&first=" + encodeURIComponent(String(Math.floor(start))); return u; } let u = "https://www.google.com/search?q=" + encodeURIComponent(q); if (hl) u += "&hl=" + encodeURIComponent(hl); if (gl) u += "&gl=" + encodeURIComponent(gl); if (typeof num === "number" && Number.isFinite(num) && num > 0) u += "&num=" + encodeURIComponent(String(Math.floor(num))); if (typeof start === "number" && Number.isFinite(start) && start > 0) u += "&start=" + encodeURIComponent(String(Math.floor(start))); return u; })() }}',
                format: '{{ String(args.format ?? "json") }}',
                country: '{{ args.country }}',
                data_format: '{{ args.dataFormat }}',
              },
            },
          } satisfies ConnectorHttpEndpointV2,
        ],
        metadataSchema: {
          type: 'object',
          properties: {
            webFetchZone: { type: 'string' },
            webSearchZone: { type: 'string' },
          },
          additionalProperties: true,
        },
      };

      connectorTemplates[provider] = runtimeTemplate;
      connectorMetadata[provider] = {
        ...(byProvider.get(provider)?.metadata ?? {}),
        ...systemInjectedMetadata,
      };

      // Only inject auth when configured; callers will receive 401s otherwise.
      const apiKey = await this.platformSecrets.getSecret('SYSTEM_CONNECTOR_WEB_GATEWAY_API_KEY').catch(() => undefined);
      if (typeof apiKey === 'string' && apiKey.trim()) {
        connectorSessions[provider] = { headers: { Authorization: `Bearer ${apiKey.trim()}` } };
      }
    }

    return { connectorTemplates, connectorSessions, connectorMetadata };
  }
}
