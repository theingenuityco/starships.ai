import type {
  ConnectorDbSessionV2,
  ConnectorHttpEndpointV2,
  ConnectorProvider,
  ConnectorSessionV2,
  ConnectorSqlEndpointV2,
  ConnectorTemplateRuntimeFieldsV2,
  HttpMethod,
  JsonSchemaObject,
  RequestStyle,
  SecretRef,
} from '@starships/protocol';
import { ConnectorRepository, ConnectorTemplateActionRepository, ConnectorTemplateRepository } from '@starships/models';
import { ConnectorSecretService } from './ConnectorSecretService';
import { PlatformSecretService } from './PlatformSecretService';
import { generateJWT } from '@/utils/jwt';
import { buildBasicAuthHeaderValue } from '@/utils/basicAuth';

export type ConnectorSession = ConnectorSessionV2;

export interface ConnectorActionSessionBundle {
  connectorTemplates: Record<string, ConnectorTemplateRuntimeFieldsV2>;
  connectorSessions: Record<string, ConnectorSession>;
  connectorMetadata: Record<string, Record<string, unknown>>;
}

export class ConnectorActionSessionService {
  private templateRepo = new ConnectorTemplateRepository();
  private actionRepo = new ConnectorTemplateActionRepository();
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

  private isJsonObject(v: unknown): v is JsonSchemaObject {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  async build(starshipId: string, authUserId: string): Promise<ConnectorActionSessionBundle> {
    const templates = await this.templateRepo.list();
    const connectorRows = await this.connectorRepo.findByStarship(starshipId);
    const byProvider = new Map(connectorRows.map((c) => [c.provider, c]));

    const decrypted = await this.connectorSecrets.getDecryptedSecrets(starshipId);

    // Preload all action catalogs for enabled templates in one query.
    const enabledTemplateIds = templates.filter((t) => t.isEnabled !== false).map((t) => t.id);
    const actionRows = await this.actionRepo.listActionRowsByTemplateIds(enabledTemplateIds);
    const endpointsByTemplateId = new Map<string, ConnectorTemplateRuntimeFieldsV2['endpoints']>();
    for (const row of actionRows) {
      const list = endpointsByTemplateId.get(row.template_id) ?? [];
      const kind = String(row.kind ?? 'http')
        .trim()
        .toLowerCase();

      const parameters = this.isJsonObject(row.parameters_json) ? row.parameters_json : undefined;
      const response = this.isJsonObject(row.response_json) ? row.response_json : undefined;

      if (kind === 'sql') {
        const endpoint: ConnectorSqlEndpointV2 = {
          kind: 'sql',
          name: row.action_name,
          description: row.description ?? undefined,
          driver: typeof row.driver === 'string' && row.driver.trim() ? row.driver.trim() : 'postgres',
          sql: typeof row.sql_text === 'string' ? row.sql_text : '',
          mode: row.sql_mode === 'execute' || row.sql_mode === 'query' ? row.sql_mode : undefined,
          rowLimit: typeof row.row_limit === 'number' ? row.row_limit : undefined,
          readOnly: typeof row.read_only === 'boolean' ? row.read_only : undefined,
          parameters,
          response,
          timeoutMs: row.timeout_ms ?? undefined,
        };
        list.push(endpoint);
      } else {
        const mapping = this.isJsonObject(row.mapping_json)
          ? (row.mapping_json as unknown as ConnectorHttpEndpointV2['mapping'])
          : undefined;
        const requestStyle = row.request_style ? (row.request_style as RequestStyle) : undefined;
        const endpoint: ConnectorHttpEndpointV2 = {
          name: row.action_name,
          description: row.description ?? undefined,
          method: row.method as HttpMethod,
          path: row.path,
          baseUrlOverride: row.base_url_override ?? undefined,
          parameters,
          requestStyle,
          mapping,
          response,
          timeoutMs: row.timeout_ms ?? undefined,
        };
        list.push(endpoint);
      }
      endpointsByTemplateId.set(row.template_id, list);
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
        endpoints: endpointsByTemplateId.get(tpl.id) ?? [],
        rateLimit: tpl.rateLimitJson,
        metadataSchema: tpl.metadataSchemaJson,
      };

      connectorTemplates[provider] = runtimeTemplate;
      connectorMetadata[provider] = byProvider.get(provider)?.metadata ?? {};

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

    return { connectorTemplates, connectorSessions, connectorMetadata };
  }
}
