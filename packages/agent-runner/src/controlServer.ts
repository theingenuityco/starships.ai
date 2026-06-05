import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RunnerConfig } from './config';
import type { Runner } from './runner';

export interface ControlServerOptions {
  port: number;
  /** Required in the `X-Control-Token` header on every request. */
  token: string;
}

/**
 * A tiny loopback-only control surface for the runner, consumed by the desktop
 * app (and `starship-agent status`). Bound to 127.0.0.1 and gated by a shared
 * token so other local users / browser pages can't drive the runner.
 *
 * Routes: GET /status, GET /events (SSE), POST /pause, POST /resume,
 * GET /config (token redacted).
 */
export function startControlServer(runner: Runner, config: RunnerConfig, opts: ControlServerOptions): { close: () => void } {
  const sseClients = new Set<ServerResponse>();

  const broadcast = (event: string, data: unknown) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) res.write(frame);
  };

  const onState = (s: unknown) => broadcast('state', s);
  const onLog = (l: unknown) => broadcast('log', l);
  runner.on('state', onState);
  runner.on('log', onLog);

  const redactedConfig = () => ({ ...config, token: config.token ? '••••••' : '' });

  const send = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Auth gate (constant work; loopback-only binding is the primary defense).
    if (req.headers['x-control-token'] !== opts.token) {
      send(res, 401, { error: 'unauthorized' });
      return;
    }

    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/status') return send(res, 200, runner.getState());
    if (method === 'GET' && url === '/config') return send(res, 200, redactedConfig());
    if (method === 'POST' && url === '/pause') {
      runner.pause();
      return send(res, 200, runner.getState());
    }
    if (method === 'POST' && url === '/resume') {
      runner.resume();
      return send(res, 200, runner.getState());
    }
    if (method === 'GET' && url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // Prime the stream with the current snapshot.
      res.write(`event: state\ndata: ${JSON.stringify(runner.getState())}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    send(res, 404, { error: 'not found' });
  });

  server.listen(opts.port, '127.0.0.1');

  return {
    close: () => {
      runner.off('state', onState);
      runner.off('log', onLog);
      for (const res of sseClients) res.end();
      sseClients.clear();
      server.close();
    },
  };
}
