/** NoneStrategy — stateless connector with no authentication. */

import type { ConnectorAuthV2, ConnectorSessionV2 } from '@starships/protocol';
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

export class NoneStrategy implements AuthStrategy {
  readonly kind: ConnectorAuthKind = 'none';
  readonly catalogAuthType: ConnectorCatalogAuthType = 'none';

  async begin(_ctx: BeginCtx): Promise<BeginResult> {
    return { kind: 'connected', status: 'connected' };
  }

  async complete(_ctx: CompleteCtx): Promise<CompleteResult> {
    return { secrets: {}, status: 'connected' };
  }

  async buildSession(_ctx: SessionCtx): Promise<ConnectorSessionV2 | null> {
    return { headers: {} };
  }

  runtimeAuth(): ConnectorAuthV2 {
    return { type: 'none' };
  }
}
