import * as http2 from 'http2';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { ConnectRouter } from '@connectrpc/connect';
import type { DescMethod } from '@bufbuild/protobuf';
import { RunnerService } from '@/gen/runner_connect';
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
type StreamingRegistrar = {
  serverStreaming: (method: DescMethod, impl: (req: ExecuteRequest, ctx: StreamContext) => Promise<void>) => void;
};

export class GrpcServer {
  private readonly opts: GrpcServerOptions;

  constructor(opts: GrpcServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    const routes = (router: ConnectRouter) => {
      // Unary Execute via generated descriptor (temporary any-cast for registration only)
      const executeDesc = RunnerService.methods.Execute as DescMethod;
      (
        router as unknown as { rpc: (m: DescMethod, h: (req: ExecuteRequest, ctx: RequestContext) => Promise<ExecuteResponse>) => void }
      ).rpc(executeDesc, async (req: ExecuteRequest, ctx: RequestContext): Promise<ExecuteResponse> => {
        this.checkAuth(ctx.requestHeader.get('authorization'));
        const started = Date.now();
        const result = await this.executeFastOrEnqueue(req);
        return {
          result_json: JSON.stringify(result ?? null),
          request_id: String(req?.request_id || ''),
          duration_ms: Date.now() - started,
        };
      });

      // Server-streaming ExecuteStream (typed handler; method registration until real codegen)
      const registrar = router as unknown as StreamingRegistrar;
      const streamDesc = RunnerService.methods.ExecuteStream as DescMethod;
      registrar.serverStreaming(streamDesc, async (req: ExecuteRequest, ctx: StreamContext) => {
        this.checkAuth(ctx.requestHeader.get('authorization'));
        const write = async (type: string, data: unknown) => {
          const chunk: ExecuteChunk = {
            type,
            data_json: JSON.stringify(data ?? null),
            request_id: String(req?.request_id || ''),
          };
          await ctx.stream.send(chunk);
        };
        await write('started', { ts: new Date().toISOString() });
        try {
          const result = await this.executeFastOrEnqueue(req, async (chunk) => {
            try {
              await write(chunk.type, chunk.data);
            } catch (err) {
              console.error('[GrpcServer] Failed to write stream chunk', err);
            }
          });
          await write('completed', { result });
        } catch (e) {
          console.error('[GrpcServer] ExecuteStream error', e);
          await write('error', { message: e instanceof Error ? e.message : String(e) });
        }
      });
    };

    await new Promise<void>((resolve) => {
      http2.createServer(connectNodeAdapter({ routes })).listen(this.opts.port, () => resolve());
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
