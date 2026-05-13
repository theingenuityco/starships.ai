import axios from 'axios';
import { getEnvConfig } from '@starships/env';
import type {
  ConnectorAuthTypeV2,
  ConnectorAuthV2,
  ConnectorEndpointV2,
  ConnectorProvider,
  ConnectorTemplateRuntimeFieldsV2,
  JsonSchemaObject,
} from '@starships/protocol';

/**
 * A plain-object representation that duck-types ConnectorTemplateEntity.
 * Callers can use the same field names they used against the DB entity.
 */
export interface ConnectorTemplateEntityLike {
  id: string;
  slug: string;
  provider: ConnectorProvider;
  name: string;
  description: string;
  demoVideoUrl?: string;
  authType: ConnectorAuthTypeV2;
  baseUrl: string;
  authJson: ConnectorAuthV2;
  variablesJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']>;
  rateLimitJson?: NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']>;
  metadataSchemaJson?: JsonSchemaObject;
  webhooksJson?: Record<string, unknown>;
  version: string;
  category: string;
  usageCount: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Actions/endpoints — populated from bundle payload.actions. */
  endpoints: ConnectorEndpointV2[];
}

interface BundleConnectorPayload {
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
}

interface BundleConnectorContainer {
  schemaVersion: string;
  kind: string;
  exportedAt?: string;
  payload: BundleConnectorPayload;
}

function mapToEntity(container: BundleConnectorContainer): ConnectorTemplateEntityLike {
  const ct = container.payload.connectorTemplate;
  const auth = (ct.auth ?? { type: 'none' }) as unknown as ConnectorAuthV2;
  const authType = ((auth as unknown as { type?: string })?.type ?? 'none') as ConnectorAuthTypeV2;
  const exportedAt = container.exportedAt ?? new Date().toISOString();

  return {
    id: ct.id ?? ct.provider,
    slug: ct.slug ?? ct.provider,
    provider: ct.provider as ConnectorProvider,
    name: ct.name,
    description: ct.description ?? '',
    ...(ct.demoVideoUrl ? { demoVideoUrl: ct.demoVideoUrl } : {}),
    authType,
    baseUrl: ct.baseUrl ?? '',
    authJson: auth,
    ...(Array.isArray(ct.variables) ? { variablesJson: ct.variables as NonNullable<ConnectorTemplateRuntimeFieldsV2['variables']> } : {}),
    ...(ct.rateLimit && typeof ct.rateLimit === 'object'
      ? { rateLimitJson: ct.rateLimit as NonNullable<ConnectorTemplateRuntimeFieldsV2['rateLimit']> }
      : {}),
    ...(ct.metadataSchema && typeof ct.metadataSchema === 'object'
      ? { metadataSchemaJson: ct.metadataSchema as JsonSchemaObject }
      : {}),
    // webhooks can come from either payload.webhooks (top-level) or payload.connectorTemplate.webhooks
    ...(container.payload.webhooks ?? ct.webhooks ? { webhooksJson: container.payload.webhooks ?? ct.webhooks } : {}),
    version: ct.version ?? '1.0.0',
    category: ct.category ?? 'general',
    usageCount: 0,
    isEnabled: ct.isEnabled !== false,
    createdAt: exportedAt,
    updatedAt: exportedAt,
    endpoints: Array.isArray(container.payload.actions) ? (container.payload.actions as ConnectorEndpointV2[]) : [],
  };
}

/**
 * Reads connector templates from the bundle-service HTTP API instead of the DB.
 * Replaces ConnectorTemplateRepository and ConnectorTemplateActionRepository reads.
 */
export class ConnectorTemplateRegistryClient {
  private cache: { data: ConnectorTemplateEntityLike[]; expiresAt: number } | null = null;
  private readonly TTL_MS = 300_000; // 5 minutes

  private get bundleServiceUrl(): string | undefined {
    try {
      return getEnvConfig().BUNDLE_SERVICE_URL;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<ConnectorTemplateEntityLike[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    const url = this.bundleServiceUrl;
    if (!url) {
      console.warn('[ConnectorTemplateRegistryClient] BUNDLE_SERVICE_URL is not set; returning empty connector template list');
      return this.cache?.data ?? [];
    }

    try {
      const response = await axios.get<BundleConnectorContainer[]>(`${url}/api/v1/connector-templates`, {
        timeout: 10_000,
      });
      const containers = Array.isArray(response.data) ? response.data : [];
      const data = containers
        .filter((c) => c.kind === 'connector_template' && c.payload?.connectorTemplate)
        .map(mapToEntity);

      this.cache = { data, expiresAt: now + this.TTL_MS };
      return data;
    } catch (err) {
      console.error('[ConnectorTemplateRegistryClient] Failed to fetch connector templates from bundle-service', {
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      // Return stale cache if available, otherwise empty
      return this.cache?.data ?? [];
    }
  }

  async findByProvider(provider: ConnectorProvider): Promise<ConnectorTemplateEntityLike | null> {
    const all = await this.list();
    return all.find((t) => t.provider === provider) ?? null;
  }

  async findById(id: string): Promise<ConnectorTemplateEntityLike | null> {
    const all = await this.list();
    return all.find((t) => t.id === id || t.provider === id) ?? null;
  }

  /** Invalidate the in-memory cache (e.g. after bundle files change). */
  invalidate(): void {
    this.cache = null;
  }
}
