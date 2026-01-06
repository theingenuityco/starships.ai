import { Queue, RunnerTask } from './Queue';
import { Executor } from '@/executor/Executor';

interface WorkerPoolOptions {
  queue: Queue<RunnerTask>;
  executor: Executor;
  concurrency: number;
}

export class WorkerPool {
  private readonly queue: Queue<RunnerTask>;
  private readonly executor: Executor;
  private readonly concurrency: number;
  private running = false;

  constructor(opts: WorkerPoolOptions) {
    this.queue = opts.queue;
    this.executor = opts.executor;
    this.concurrency = Math.max(1, opts.concurrency);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (let i = 0; i < this.concurrency; i++) this.loop();
  }

  stop(): void {
    this.running = false;
  }

  private async loop(): Promise<void> {
    while (this.running) {
      const task = await this.queue.dequeue();
      const startedAt = Date.now();
      try {
        const result = await this.executor.execute({
          requestId: task.requestId,
          blueprintJson: task.blueprintJson,
          executionJson: task.executionJson,
          configJson: task.configJson,
          timeoutMs: task.timeoutMs,
          onEvent: task.onEvent,
        });
        if (task.onEvent) {
          await task.onEvent({ type: 'completed', data: { durationMs: Date.now() - startedAt, result } });
        }
      } catch (err) {
        if (task.onEvent) {
          await task.onEvent({ type: 'error', data: { message: (err as Error)?.message || String(err) } });
        }
      }
    }
  }
}
