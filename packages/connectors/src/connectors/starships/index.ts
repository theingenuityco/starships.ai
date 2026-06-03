/**
 * Starships connector — hand-written, platform-JWT-driven.
 *
 * Exposes the Starships API itself (tools, docs, models, tables, agents, etc.) as a
 * connector-backed capability for a starship. Auth is PlatformJwtStrategy: the host mints
 * a short-lived platform JWT per session and the executor applies it from the session
 * headers. Actions are plain code functions in ./actions; the base URL resolves against
 * SERVER_URL at call time. Execution happens server-side in ConnectorActionExecutor.
 */

import type { ConnectorAuthPlatformJwtV2 } from '@starships/protocol';
import type { ConnectorDefinition } from '../../types';
import { PlatformJwtStrategy } from '../../strategies/PlatformJwtStrategy';
import { starshipsActions } from './actions';

const auth: ConnectorAuthPlatformJwtV2 = {
  type: 'platform_jwt',
  headerName: 'Authorization',
  tokenPrefix: 'Bearer',
};

export const starshipsConnector: ConnectorDefinition = {
  id: 'starships',
  provider: 'starships',
  name: 'Starships',
  description: 'Use the Starships API itself (tools, docs, models, tables, etc.) as a connector-backed capability for this starship.',
  category: 'connector',
  version: '1.0.0',
  isEnabled: true,
  baseUrl: '{{ runtimeEnv.SERVER_URL }}/api/v1',
  resolveBaseUrl: (env) => `${String((env as Record<string, unknown>).SERVER_URL ?? '').replace(/\/+$/, '')}/api/v1`,
  auth: new PlatformJwtStrategy(auth),
  actions: starshipsActions,
};
