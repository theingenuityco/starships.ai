import type { Blueprint } from '@starships/autopilot';
import type { ConnectorAuthType } from '@starships/protocol';

/**
 * Common connector blueprints
 *
 * These return plain Blueprint objects that can be stored inline on
 * connector_templates rows (connect_blueprint, refresh_blueprint, test_blueprint),
 * similar to how createDefaultAgentBlueprint works for agents.
 *
 * NOTE: These blueprints are intentionally pure (no http_request nodes) so
 * they can run without a HostRuntime. They are focused on shaping input into
 * the standard Connector*Output contracts.
 */

interface BaseBlueprintConfig {
  /** User-visible name for the blueprint */
  name: string;
  /** Optional description for the blueprint */
  description?: string;
}

interface OAuthConnectBlueprintConfig extends BaseBlueprintConfig {
  authType: Extract<ConnectorAuthType, 'oauth2'>;
}

interface ApiKeyConnectBlueprintConfig extends BaseBlueprintConfig {
  authType: Extract<ConnectorAuthType, 'api_key'>;
}

export function createOAuthConnectBlueprint(config: OAuthConnectBlueprintConfig): Blueprint {
  const name = config.name || 'OAuth Connect';

  const code = `
    /**
     * Connector OAuth connect blueprint.
     *
     * Input: ConnectorConnectInput
     * Output: ConnectorConnectOutput
     */
    async function main(ctx) {
      const input = ctx.input || {};

      // Phase: start -> build authorizationUrl from provided fields.
      if (input.phase === 'start') {
        const authorizeUrl = String(input.authorizeUrl || '');
        const redirectPath = String(input.redirectPath || '');
        const scopes = Array.isArray(input.scopes) ? input.scopes : [];

        if (!authorizeUrl) {
          throw new Error('authorizeUrl is required for OAuth start phase');
        }

        // Build a minimal URL with query params; the server is responsible
        // for passing any pre-composed URL if it prefers.
        const url = new URL(authorizeUrl);
        if (scopes.length) {
          url.searchParams.set('scope', scopes.join(' '));
        }

        return {
          authorizationUrl: url.toString(),
        };
      }

      // Phase: complete -> delegate to server to persist env/metadata. Here we
      // simply echo back an empty ConnectorConnectOutput; the server may ignore
      // or extend this behavior in a future iteration.
      if (input.phase === 'complete') {
        return {
          status: input.status || 'connected',
          metadata: input.metadata || {},
        };
      }

      throw new Error('Unsupported phase for OAuth connect blueprint');
    }
  `;

  const blueprint: Blueprint = {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'code_connect',
        type: 'code',
        name,
        description: config.description || 'Compute ConnectorConnectOutput for OAuth-based connectors',
        parameters: {
          code,
          timeout: 3000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("code_connect") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'code_connect' },
      { ref: 'e2', from: 'code_connect', to: 'end_1' },
    ],
    metadata: {},
  };

  return blueprint;
}

export function createApiKeyConnectBlueprint(config: ApiKeyConnectBlueprintConfig): Blueprint {
  const name = config.name || 'API Key Connect';

  const code = `
    /**
     * API-key-based connector connect blueprint.
     *
     * Input: ConnectorConnectInput
     * Output: ConnectorConnectOutput
     */
    async function main(ctx) {
      const input = ctx.input || {};
      const payload = input.apiKeyPayload || {};
      const apiKey = payload.apiKey;

      if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
        throw new Error('apiKey is required for API key connector');
      }

      // envKey should be provided via config.runtimeConfig.envKey or similar.
      const config = (input.config && typeof input.config === 'object') ? input.config : {};
      const envKey = config.envKey || 'API_KEY';

      if (typeof envKey !== 'string' || !envKey.trim()) {
        throw new Error('envKey must be provided in connector runtimeConfig for API key connector');
      }

      return {
        env: {
          [envKey]: apiKey,
        },
        metadata: {
          ...(input.metadata || {}),
          hasApiKey: true,
        },
        status: 'connected',
      };
    }
  `;

  const blueprint: Blueprint = {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'code_connect',
        type: 'code',
        name,
        description: config.description || 'Compute ConnectorConnectOutput for API-key-based connectors',
        parameters: {
          code,
          timeout: 3000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("code_connect") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'code_connect' },
      { ref: 'e2', from: 'code_connect', to: 'end_1' },
    ],
    metadata: {},
  };

  return blueprint;
}

export function createNoopTestBlueprint(config: BaseBlueprintConfig): Blueprint {
  const name = config.name || 'Test Connector';

  const code = `
    /**
     * Simple connector test blueprint.
     *
     * Input: ConnectorTestInput
     * Output: ConnectorTestOutput
     */
    async function main(ctx) {
      const input = ctx.input || {};
      const env = input.envSnapshot || {};

      const hasAnyEnv = env && typeof env === 'object' && Object.keys(env).length > 0;

      if (!hasAnyEnv) {
        return {
          ok: false,
          error: 'NO_ENV',
          details: { message: 'No environment variables found for this connector' },
        };
      }

      return {
        ok: true,
      };
    }
  `;

  const blueprint: Blueprint = {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      {
        ref: 'code_test',
        type: 'code',
        name,
        description: config.description || 'Basic sanity check for connector env configuration',
        parameters: {
          code,
          timeout: 2000,
        },
      },
      {
        ref: 'end_1',
        type: 'end',
        name: 'End',
        description: '',
        parameters: {
          output: '{{ lastOutputOf("code_test") }}',
        },
      },
    ],
    edges: [
      { ref: 'e1', from: 'start_1', to: 'code_test' },
      { ref: 'e2', from: 'code_test', to: 'end_1' },
    ],
    metadata: {},
  };

  return blueprint;
}
