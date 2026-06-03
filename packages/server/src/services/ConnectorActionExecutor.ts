/**
 * ConnectorActionExecutor — the single, server-side authority for running a connector
 * action. Resolves the code connector from the in-process registry, builds its auth
 * session (the same AuthStrategy path used elsewhere), constructs an authed `ctx.http`,
 * and invokes the action's `run`. There is no template DSL and no runner round-trip for
 * resolution: the action is plain TypeScript executed here.
 *
 * Both execution transports funnel through this: the in-process host runtime (child /
 * ChildProcessRunner) calls `execute` directly; the remote runner calls it via the
 * POST /api/v1/internal/connector-action endpoint.
 */

import type { ConnectorProvider } from '@starships/protocol';
import type { ActionContext, HttpEnvelope } from '@starships/connectors';
import { connectorRegistry } from '@starships/connectors';
import { ensureConnectorRegistry } from './ConnectorRegistryClient';
import { resolveConnectorContext } from './connectorSessionResolver';
import { createAuthedHttp } from './connectorHttp';

export interface ConnectorActionRequest {
  connector: string;
  action: string;
  args?: Record<string, unknown>;
  timeoutMs?: number;
  starshipId: string;
  authUserId: string;
  runtimeEnv?: Record<string, unknown>;
  signal?: AbortSignal;
}

export class ConnectorActionExecutor {
  async execute(req: ConnectorActionRequest): Promise<HttpEnvelope> {
    ensureConnectorRegistry();
    const provider = req.connector as ConnectorProvider;
    const def = connectorRegistry.get(provider);
    if (!def) throw new Error(`Unknown connector "${req.connector}"`);
    const action = def.actions.find((a) => a.name === req.action);
    if (!action) throw new Error(`Unknown connector action "${req.action}" for connector "${req.connector}"`);

    const args = action.parse ? action.parse(req.args ?? {}) : req.args ?? {};

    // Connector instance metadata + auth session (installation token, JWT, api key, ...).
    const { metadata, session } = await resolveConnectorContext(provider, req.starshipId, req.authUserId);

    // Fallback for direct in-process callers that omit runtimeEnv: SERVER_URL is required
    // so the Starships connector's resolveBaseUrl produces an absolute URL.
    const runtimeEnv = req.runtimeEnv ?? { STARSHIP_ID: req.starshipId, SERVER_URL: process.env.SERVER_URL };
    const baseUrl = def.resolveBaseUrl ? def.resolveBaseUrl(runtimeEnv) : def.baseUrl;

    const http = createAuthedHttp({
      baseUrl,
      defaultHeaders: def.defaultHeaders,
      sessionHeaders: session?.headers as Record<string, unknown> | undefined,
      defaultTimeoutMs: req.timeoutMs,
      signal: req.signal,
    });

    const ctx: ActionContext = { http, runtimeEnv, metadata, starshipId: req.starshipId, signal: req.signal };
    const result = await action.run(args, ctx);
    return normalizeEnvelope(result);
  }
}

/** Coerce an action's return value into the standard HttpEnvelope shape. */
function normalizeEnvelope(result: unknown): HttpEnvelope {
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (typeof r.status === 'number' && 'body' in r) {
      return {
        status: r.status,
        statusText: typeof r.statusText === 'string' ? r.statusText : 'OK',
        headers: (r.headers && typeof r.headers === 'object' ? r.headers : {}) as Record<string, unknown>,
        body: r.body,
        url: typeof r.url === 'string' ? r.url : '',
      };
    }
  }
  return { status: 200, statusText: 'OK', headers: {}, body: result, url: '' };
}

export const connectorActionExecutor = new ConnectorActionExecutor();
