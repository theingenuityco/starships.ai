/**
 * PlatformJwtStrategy — internal connectors (e.g. the "system"/"starships" connector)
 * authenticated with a platform-minted JWT. Always available; the token is minted per
 * session by the host (it owns the JWT signing secret).
 */

import type { ConnectorAuthPlatformJwtV2, ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
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

export class PlatformJwtStrategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'platform_jwt';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'platform_jwt';

  constructor(private readonly config: ConnectorAuthPlatformJwtV2) {}

  async begin(_ctx: BeginCtx): Promise<BeginResult> {
    return { kind: 'connected', status: 'connected' };
  }

  async complete(_ctx: CompleteCtx): Promise<CompleteResult> {
    return { secrets: {}, status: 'connected' };
  }

  async buildSession(ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    if (!ctx.tokens || !ctx.authUserId) return null;
    const token = await ctx.tokens.platformJwt({ id: ctx.authUserId, starshipId: ctx.starshipId });
    const headerName = typeof this.config.headerName === 'string' && this.config.headerName.trim() ? this.config.headerName.trim() : 'Authorization';
    const prefix = typeof this.config.tokenPrefix === 'string' ? this.config.tokenPrefix : 'Bearer';
    return { headers: { [headerName]: prefix ? `${prefix} ${token}` : token } };
  }

  runtimeAuth(): ConnectorAuthV2 {
    return this.config;
  }
}
