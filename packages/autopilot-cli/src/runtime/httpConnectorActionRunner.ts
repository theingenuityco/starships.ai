/**
 * httpConnectorActionRunner
 *
 * A ConnectorActionRunner that delegates to the server's internal
 * connector-action endpoint (server-authority mode). This is how the agent runs
 * connector actions from inside the sandbox without ever holding credentials:
 * the server resolves auth/secrets and returns the response envelope.
 *
 * Mirrors the runner's existing connectorActionCallback contract:
 *   POST {url}  with header x-runner-secret
 *   body: { connector, action, args, timeoutMs, starshipId, authUserId, runtimeEnv }
 */

import type { ConnectorActionRunner, ConnectorActionResult } from '@/types';

export interface HttpConnectorActionRunnerOptions {
  /** Absolute URL of the server's internal connector-action endpoint. */
  url: string;
  /** Shared secret sent as `x-runner-secret`. */
  secret?: string;
  starshipId: string;
  authUserId: string;
  /** Non-secret runtime env forwarded with each call. */
  runtimeEnv?: Record<string, unknown>;
}

export function httpConnectorActionRunner(opts: HttpConnectorActionRunnerOptions): ConnectorActionRunner {
  return {
    async run(req): Promise<ConnectorActionResult> {
      const timeoutMs = req.timeoutMs ?? 60_000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs + 5_000);
      try {
        const resp = await fetch(opts.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(opts.secret ? { 'x-runner-secret': opts.secret } : {}),
          },
          body: JSON.stringify({
            connector: req.connector,
            action: req.action,
            args: req.args ?? {},
            timeoutMs: req.timeoutMs,
            starshipId: opts.starshipId,
            authUserId: opts.authUserId,
            ...(opts.runtimeEnv ? { runtimeEnv: opts.runtimeEnv } : {}),
          }),
          signal: controller.signal,
        });

        if (resp.status < 200 || resp.status >= 300) {
          throw new Error(`connector-action callback failed (${resp.status})`);
        }

        // The transport always returns 200; the action's own HTTP status is inside the envelope.
        const envelope = (await resp.json()) as { status?: number; body?: unknown; headers?: Record<string, unknown> };
        return {
          status: typeof envelope.status === 'number' ? envelope.status : 200,
          body: envelope.body,
          ...(envelope.headers ? { headers: envelope.headers } : {}),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
