/** BasicStrategy — HTTP Basic auth, optionally also providing a Postgres DB session. */

import type { ConnectorAuthBasicV2, ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
import type {
  AuthStrategy,
  BeginCtx,
  BeginResult,
  CompleteCtx,
  CompleteResult,
  ConnectorAuthKind,
  ConnectorCatalogAuthType,
  FieldSpec,
  SessionCtx,
} from '../types';
import { buildBasicAuthHeaderValue, buildPostgresDbSession } from './shared';

export class BasicStrategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'basic';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'basic';

  constructor(
    private readonly config: ConnectorAuthBasicV2,
    private readonly opts: { hasSqlEndpoints: boolean } = { hasSqlEndpoints: false }
  ) {}

  async begin(_ctx: BeginCtx): Promise<BeginResult> {
    const fields: FieldSpec[] = [
      { key: 'username', label: 'Username', type: 'string', required: true },
      { key: 'password', label: 'Password', type: 'password', required: Boolean(this.config.passwordRef) },
    ];
    return { kind: 'form', fields };
  }

  async complete(ctx: CompleteCtx): Promise<CompleteResult> {
    const username = ctx.input.username;
    if (!username) throw new Error('Username is required');
    const password = ctx.input.password;

    const secrets: Record<string, string> = {};
    if (this.config.usernameRef.type === 'connector_secret') secrets[this.config.usernameRef.key] = username;
    if (this.config.passwordRef && password && this.config.passwordRef.type === 'connector_secret') {
      secrets[this.config.passwordRef.key] = password;
    }
    return { secrets, status: 'connected' };
  }

  async buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    const username = await ctx.secrets.resolve(this.config.usernameRef);
    if (!username) return null;
    const password = this.config.passwordRef ? await ctx.secrets.resolve(this.config.passwordRef) : '';
    // If a password is configured but missing/blank, the connector isn't ready.
    if (this.config.passwordRef && password === undefined) return null;

    const headerName = typeof this.config.headerName === 'string' && this.config.headerName.trim() ? this.config.headerName.trim() : 'Authorization';
    const headers: Record<string, string> = { [headerName]: buildBasicAuthHeaderValue(username, password ?? '') };

    if (this.opts.hasSqlEndpoints) {
      const db = buildPostgresDbSession({ metadata: ctx.metadata ?? {}, user: username, password: password ?? undefined });
      if (!db) return null;
      return { headers, db };
    }
    return { headers };
  }

  runtimeAuth(): ConnectorAuthV2 {
    return this.config;
  }
}
