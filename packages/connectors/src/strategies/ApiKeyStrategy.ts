/** ApiKeyStrategy — single API key injected as a header. */

import type { ConnectorAuthApiKeyV2, ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
import type {
  AuthStrategy,
  BeginCtx,
  BeginResult,
  CompleteCtx,
  CompleteResult,
  ConnectorAuthKind,
  ConnectorCatalogAuthType,
  SessionCtx,
} from '../types';
import { buildHeaderInjection } from './shared';

export class ApiKeyStrategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'api_key';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'api_key';

  constructor(private readonly config: ConnectorAuthApiKeyV2) {}

  async begin(_ctx: BeginCtx): Promise<BeginResult> {
    return { kind: 'form', fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }] };
  }

  async complete(ctx: CompleteCtx): Promise<CompleteResult> {
    const apiKey = ctx.input.apiKey;
    if (!apiKey) throw new Error('API key is required');
    const secrets: Record<string, string> = {};
    if (this.config.apiKeyRef.type === 'connector_secret') secrets[this.config.apiKeyRef.key] = apiKey;
    return { secrets, status: 'connected' };
  }

  async buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    const token = await ctx.secrets.resolve(this.config.apiKeyRef);
    if (!token) return null;
    const headers = buildHeaderInjection(this.config.injection, token, '');
    if (!headers) return null;
    return { headers };
  }

  runtimeAuth(): ConnectorAuthV2 {
    return this.config;
  }
}
