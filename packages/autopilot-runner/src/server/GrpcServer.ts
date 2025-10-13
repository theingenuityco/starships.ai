import * as http2 from 'http2';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { ConnectRouter } from '@connectrpc/connect';
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

export class GrpcServer {
  private readonly opts: GrpcServerOptions;

  constructor(opts: GrpcServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    const routes = (router: ConnectRouter) => {
      router.rpc(
        {
          name: 'runner.Runner.Execute',
          I: {} as any,
          O: {} as any,
        } as any,
        async (req: any, ctx: any) => {
          this.checkAuth(ctx.requestHeader.get('authorization'));
          const started = Date.now();
          const result = await this.executeFastOrEnqueue(req);
          return {
            result_json: JSON.stringify(result ?? null),
            request_id: String(req?.request_id || ''),
            duration_ms: Date.now() - started,
          };
        }
      );

      router.serverStreaming(
        {
          name: 'runner.Runner.ExecuteStream',
          I: {} as any,
          O: {} as any,
        } as any,
        async (req: any, ctx: any) => {
          this.checkAuth(ctx.requestHeader.get('authorization'));
          const stream = ctx.stream;
          const write = async (type: string, data: unknown) => {
            await stream.send({ type, data_json: JSON.stringify(data ?? null), request_id: String(req?.request_id || '') });
          };
          await write('started', { ts: new Date().toISOString() });
          try {
            const result = await this.executeFastOrEnqueue(req, async (chunk) => {
              await write(chunk.type, chunk.data);
            });
            await write('completed', { result });
          } catch (e: any) {
            await write('error', { message: e?.message || 'error' });
          }
        }
      );
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

  private async executeFastOrEnqueue(req: any, onEvent?: (c: { type: string; data: unknown }) => Promise<void> | void): Promise<unknown> {
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
          if (type === 'completed') resolve((data as any)?.result);
          if (type === 'error') reject(new Error((data as any)?.message || 'error'));
        },
      };
      this.opts.queue.enqueue(task);
    });
  }
}
