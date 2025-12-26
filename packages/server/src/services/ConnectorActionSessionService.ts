import type { ConnectorProvider, ConnectorTemplateRuntimeFieldsV2, SecretRef } from '@starships/protocol';
import { ConnectorRepository, ConnectorTemplateRepository } from '@starships/models';
import { ConnectorSecretService } from './ConnectorSecretService';
import { PlatformSecretService } from './PlatformSecretService';
import { generateJWT } from '@/utils/jwt';

export interface ConnectorSession {
  headers: Record<string, string>;
}

export interface ConnectorActionSessionBundle {
  connectorTemplates: Record<string, ConnectorTemplateRuntimeFieldsV2>;
  connectorSessions: Record<string, ConnectorSession>;
  connectorMetadata: Record<string, Record<string, unknown>>;
}

export class ConnectorActionSessionService {
  private templateRepo = new ConnectorTemplateRepository();
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

  async build(starshipId: string, authUserId: string): Promise<ConnectorActionSessionBundle> {
    const templates = await this.templateRepo.list();
    const connectorRows = await this.connectorRepo.findByStarship(starshipId);
    const byProvider = new Map(connectorRows.map((c) => [c.provider, c]));

    const decrypted = await this.connectorSecrets.getDecryptedSecrets(starshipId);

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
        endpoints: tpl.endpointsJson,
        rateLimit: tpl.rateLimitJson,
        metadataSchema: tpl.metadataSchemaJson,
      };

      connectorTemplates[provider] = runtimeTemplate;
      connectorMetadata[provider] = byProvider.get(provider)?.metadata ?? {};

      const auth = runtimeTemplate.auth;
      const type = auth.type;

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
    }

    return { connectorTemplates, connectorSessions, connectorMetadata };
  }
}
