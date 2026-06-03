/**
 * System connector — reserved, platform-owned web fetch/search gateway (Bright Data).
 *
 * Hand-written code connector (was an inline runtime template in the server's
 * ConnectorActionSessionService). Auth is an API key from the platform secret
 * SYSTEM_CONNECTOR_WEB_GATEWAY_API_KEY. The webFetchZone/webSearchZone metadata is
 * injected by the server executor from platform secrets. Backend (Bright Data) details
 * stay hidden behind the stable action names so the provider can change without touching
 * tools.
 */

import type { ConnectorAuthApiKeyV2 } from '@starships/protocol';
import type { ConnectorDefinition } from '../../types';
import { ApiKeyStrategy } from '../../strategies/ApiKeyStrategy';
import { systemActions } from './actions';

const auth: ConnectorAuthApiKeyV2 = {
  type: 'api_key',
  apiKeyRef: { type: 'platform_secret', key: 'SYSTEM_CONNECTOR_WEB_GATEWAY_API_KEY' },
  injection: { style: 'header', headerName: 'Authorization', tokenPrefix: 'Bearer' },
};

export const systemConnector: ConnectorDefinition = {
  id: 'system',
  provider: 'system',
  name: 'System',
  description: 'Reserved platform web fetch and search gateway.',
  category: 'connector',
  version: '1.0.0',
  isEnabled: true,
  baseUrl: 'https://api.brightdata.com',
  auth: new ApiKeyStrategy(auth),
  actions: systemActions,
  metadataSchema: {
    type: 'object',
    properties: {
      webFetchZone: { type: 'string' },
      webSearchZone: { type: 'string' },
    },
    additionalProperties: true,
  },
};
