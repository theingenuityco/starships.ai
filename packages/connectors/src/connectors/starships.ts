/**
 * Starships connector — hand-written, platform-JWT-driven.
 *
 * Exposes the Starships API itself (tools, docs, models, agents, etc.) as a
 * connector-backed capability for a starship. Auth is PlatformJwtStrategy: the host
 * mints a short-lived platform JWT per session (it owns the signing secret) and the
 * runner applies it from the session headers. The HTTP actions are lifted into the
 * package as data (starships.actions.json) so the connector is fully code-owned;
 * baseUrl stays runtime-templated against SERVER_URL, unchanged from the prior template.
 */

import type { ConnectorAuthPlatformJwtV2, ConnectorEndpointV2 } from '@starships/protocol';
import type { ConnectorDefinition } from '../types';
import { PlatformJwtStrategy } from '../strategies/PlatformJwtStrategy';
import starshipsActions from './starships.actions.json';

const auth: ConnectorAuthPlatformJwtV2 = {
  type: 'platform_jwt',
  headerName: 'Authorization',
  tokenPrefix: 'Bearer',
};

export const starshipsConnector: ConnectorDefinition = {
  id: 'starships',
  provider: 'starships',
  name: 'Starships',
  description: 'Use the Starships API itself (tools, docs, models, etc.) as a connector-backed capability for this starship.',
  category: 'connector',
  version: '1.0.0',
  isEnabled: true,
  baseUrl: '{{ runtimeEnv.SERVER_URL }}/api/v1',
  auth: new PlatformJwtStrategy(auth),
  actions: starshipsActions as unknown as ConnectorEndpointV2[],
};
