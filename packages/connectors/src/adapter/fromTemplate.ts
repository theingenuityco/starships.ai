/**
 * fromTemplate — adapt a declarative connector template container (the JSON shape
 * served by the bundle-service today) into a code ConnectorDefinition, selecting the
 * appropriate AuthStrategy from the declared auth type. This is how the ~78 simple
 * REST connectors keep working unchanged under the code-driven framework.
 */

import type {
  ConnectorAuthApiKeyV2,
  ConnectorAuthBasicV2,
  ConnectorAuthOAuth2V2,
  ConnectorAuthPlatformJwtV2,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorProvider,
} from '@starships/protocol';
import type { AuthStrategy, ConnectorDefinition } from '../types';
import { OAuth2Strategy } from '../strategies/OAuth2Strategy';
import { ApiKeyStrategy } from '../strategies/ApiKeyStrategy';
import { BasicStrategy } from '../strategies/BasicStrategy';
import { PlatformJwtStrategy } from '../strategies/PlatformJwtStrategy';
import { NoneStrategy } from '../strategies/NoneStrategy';
import { extractTemplateVarKeys } from '../strategies/shared';

/** The connector template container shape (mirrors bundle-service ConnectorTemplateContainer). */
export interface ConnectorTemplateContainer {
  schemaVersion?: string;
  kind?: string;
  exportedAt?: string;
  payload: {
    connectorTemplate: {
      id?: string;
      slug?: string;
      provider: string;
      name: string;
      description?: string;
      isEnabled?: boolean;
      version?: string;
      category?: string;
      baseUrl?: string;
      auth?: Record<string, unknown>;
      variables?: unknown[];
      rateLimit?: Record<string, unknown>;
      metadataSchema?: Record<string, unknown>;
      demoVideoUrl?: string;
      webhooks?: Record<string, unknown>;
    };
    actions?: unknown[];
    webhooks?: Record<string, unknown>;
  };
}

function buildStrategy(auth: ConnectorAuthV2, opts: { hasSqlEndpoints: boolean }): AuthStrategy {
  switch (auth.type) {
    case 'oauth2':
      return new OAuth2Strategy(auth as ConnectorAuthOAuth2V2);
    case 'api_key':
      return new ApiKeyStrategy(auth as ConnectorAuthApiKeyV2);
    case 'basic':
      return new BasicStrategy(auth as ConnectorAuthBasicV2, opts);
    case 'platform_jwt':
      return new PlatformJwtStrategy(auth as ConnectorAuthPlatformJwtV2);
    case 'none':
    default:
      return new NoneStrategy();
  }
}

/** OAuth2 connectors whose authorize/token URLs contain {{vars}} need pre-connect metadata. */
function oauthRequiredMetadataKeys(auth: ConnectorAuthV2): string[] | undefined {
  if (auth.type !== 'oauth2') return undefined;
  const keys = new Set<string>([...extractTemplateVarKeys(auth.authorizationUrl), ...extractTemplateVarKeys(auth.tokenUrl)]);
  return keys.size > 0 ? [...keys] : undefined;
}

export function fromTemplate(container: ConnectorTemplateContainer): ConnectorDefinition {
  const ct = container.payload.connectorTemplate;
  const auth = (ct.auth ?? { type: 'none' }) as unknown as ConnectorAuthV2;
  const actions = (Array.isArray(container.payload.actions) ? container.payload.actions : []) as ConnectorEndpointV2[];
  const hasSqlEndpoints = actions.some((e) => e.kind === 'sql');
  const webhooks = container.payload.webhooks ?? ct.webhooks;
  const required = oauthRequiredMetadataKeys(auth);

  return {
    id: ct.id ?? ct.provider,
    provider: ct.provider as ConnectorProvider,
    name: ct.name,
    description: ct.description ?? '',
    category: ct.category ?? 'general',
    version: ct.version ?? '1.0.0',
    isEnabled: ct.isEnabled !== false,
    ...(ct.demoVideoUrl ? { demoVideoUrl: ct.demoVideoUrl } : {}),
    baseUrl: ct.baseUrl ?? '',
    auth: buildStrategy(auth, { hasSqlEndpoints }),
    actions,
    ...(ct.metadataSchema && typeof ct.metadataSchema === 'object' ? { metadataSchema: ct.metadataSchema } : {}),
    ...(Array.isArray(ct.variables) ? { variables: ct.variables as NonNullable<ConnectorDefinition['variables']> } : {}),
    ...(ct.rateLimit && typeof ct.rateLimit === 'object' ? { rateLimit: ct.rateLimit as NonNullable<ConnectorDefinition['rateLimit']> } : {}),
    ...(webhooks ? { webhooks } : {}),
    ...(required ? { oauthRequiredMetadataKeys: required } : {}),
  };
}
