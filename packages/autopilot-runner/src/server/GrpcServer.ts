import * as http from 'http';
import { Queue, RunnerTask } from '@/queue/Queue';
import { Executor } from '@/executor/Executor';
import { WorkerPool } from '@/queue/Worker';

interface GrpcServerOptions {
  port: number;
  authToken?: string;
  queue: Queue<RunnerTask>;
  executor: Executor;
  workers: WorkerPool;
  fastPathEnabled: boolean;
}

// Typed request/response for Execute
type ExecuteRequest = {
  blueprint_json: string;
  execution_json: string;
  config_json: string;
  request_id?: string;
  priority?: number;
  timeout_ms?: number;
};

type ExecuteResponse = {
  result_json: string;
  request_id: string;
  duration_ms: number;
};

// Typed chunk for ExecuteStream
type ExecuteChunk = {
  type: string; // event | delta | log | completed | error | started
  data_json: string;
  request_id: string;
};

// Minimal handler context typing
type RequestContext = {
  requestHeader: { get(name: string): string | null };
};

type StreamContext = RequestContext & {
  stream: { send(chunk: ExecuteChunk): Promise<void> };
};

// Registrar type for server-streaming until real codegen is added
type StreamingRegistrar = unknown;

export class GrpcServer {
  private readonly opts: GrpcServerOptions;

  constructor(opts: GrpcServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      const server = http.createServer(async (req, res) => {
        const url = req.url || '';
        const method = req.method || 'GET';
        // Unary execute compatible with RemoteRunner's HTTP call
        if (method === 'POST' && url.endsWith('/runner.Runner/ExecuteStream')) {
          // Server-Sent Events streaming endpoint
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = (bodyStr ? JSON.parse(bodyStr) : {}) as ExecuteRequest;
            const currentRequestId = String(body?.request_id || '');
            try {
              this.checkAuth((req.headers['authorization'] as string | undefined) ?? null);
            } catch (authErr) {
              const message = authErr instanceof Error ? authErr.message : String(authErr);
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: { message: `unauthorized: ${message}` },
                  request_id: currentRequestId,
                })
              );
              return;
            }

            // Setup SSE headers
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            });

            // eslint-disable-next-line no-console
            console.log('[GrpcServer] ExecuteStream start', { requestId: currentRequestId });

            const started = Date.now();
            const send = (eventName: string, data: Record<string, unknown>): void => {
              const payload = JSON.stringify(data);
              res.write(`event: ${eventName}\n`);
              res.write(`data: ${payload}\n\n`);
            };

            const result = await this.executeFastOrEnqueue(body, async (c) => {
              try {
                // Unwrap executor wrapper { type: 'event', data: <AutopilotEvent> } if present
                const maybe = c as unknown as { type?: string; data?: unknown } | undefined;
                const payload =
                  maybe && typeof maybe === 'object' && 'data' in (maybe as Record<string, unknown>)
                    ? (maybe as { data?: unknown }).data
                    : (c as unknown);
                send('message', (payload ?? {}) as Record<string, unknown>);
              } catch (e) {
                console.error('[GrpcServer] SSE forward error', e);
              }
            });

            // Send completion with result
            send('completed', {
              duration_ms: Date.now() - started,
              result_json: JSON.stringify(result ?? null),
            });
            // eslint-disable-next-line no-console
            console.log('[GrpcServer] ExecuteStream completed', { requestId: currentRequestId });
            res.end();
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error('[GrpcServer] ExecuteStream error', {
              error: message,
              requestUrl: req.url,
              method: req.method,
            });
            try {
              res.write(`event: error\n`);
              res.write(`data: ${JSON.stringify({ error: { message } })}\n\n`);
            } catch {}
            res.end();
          }
          return;
        }

        if (method === 'POST' && url.endsWith('/runner.Runner/Execute')) {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(Buffer.from(chunk));
            const bodyStr = Buffer.concat(chunks).toString('utf-8');
            const body = (bodyStr ? JSON.parse(bodyStr) : {}) as ExecuteRequest;
            const currentRequestId = String(body?.request_id || '');
            try {
              this.checkAuth((req.headers['authorization'] as string | undefined) ?? null);
            } catch (authErr) {
              const message = authErr instanceof Error ? authErr.message : String(authErr);
              res.statusCode = 401;
              res.setHeader('Content-Type', 'application/json');
              res.end(
                JSON.stringify({
                  error: { message: `unauthorized: ${message}` },
                  request_id: currentRequestId,
                })
              );
              return;
            }
            const started = Date.now();
            const result = await this.executeFastOrEnqueue(body);
            const response: ExecuteResponse = {
              result_json: JSON.stringify(result ?? null),
              request_id: currentRequestId,
              duration_ms: Date.now() - started,
            };
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(response));
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.error('[GrpcServer] Execute error', {
              error: message,
              requestUrl: req.url,
              method: req.method,
            });
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            // We cannot rely on body here; no request_id if parsing failed before
            res.end(JSON.stringify({ error: { message } }));
          }
          return;
        }
        res.statusCode = 404;
        res.end('Not Found');
      });
      server.listen(this.opts.port, () => resolve());
    });
  }

  private checkAuth(authorization: string | null | undefined): void {
    const expected = this.opts.authToken;
    if (!expected) return;
    const token = authorization && authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7) : undefined;
    if (token !== expected) throw new Error('unauthorized');
  }

  private async executeFastOrEnqueue(
    req: ExecuteRequest,
    onEvent?: (c: { type: string; data: unknown }) => Promise<void> | void
  ): Promise<unknown> {
    const fastPath = this.opts.fastPathEnabled && this.opts.workers !== undefined;
    if (fastPath) {
      return await this.opts.executor.execute({
        blueprintJson: String(req?.blueprint_json || '{}'),
        executionJson: String(req?.execution_json || '{}'),
        configJson: String(req?.config_json || '{}'),
        timeoutMs: Number(req?.timeout_ms || 0) || undefined,
        onEvent,
      });
    }
    return await new Promise<unknown>((resolve, reject) => {
      const task: RunnerTask = {
        requestId: String(req?.request_id || ''),
        blueprintJson: String(req?.blueprint_json || '{}'),
        executionJson: String(req?.execution_json || '{}'),
        configJson: String(req?.config_json || '{}'),
        timeoutMs: Number(req?.timeout_ms || 0) || undefined,
        onEvent: ({ type, data }) => {
          if (onEvent) onEvent({ type, data });
          if (type === 'completed') resolve((data as { result: unknown })?.result);
          if (type === 'error') {
            const message = (data as { message?: string })?.message || 'error';
            reject(new Error(message));
          }
        },
      };
      try {
        this.opts.queue.enqueue(task);
      } catch (err) {
        console.error('[GrpcServer] Failed to enqueue task', err);
        reject(err);
      }
    });
  }
}
