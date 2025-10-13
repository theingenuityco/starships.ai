import { GrpcServer } from '@/server/GrpcServer';
import { InMemoryQueue } from '@/queue/InMemoryQueue';
import { WorkerPool } from '@/queue/Worker';
import { InProcessExecutor } from '@/executor/InProcessExecutor';

function getEnv(name: string, fallback?: string): string | undefined {
  const val = process.env[name];
  return typeof val === 'string' && val.length > 0 ? val : fallback;
}

async function main(): Promise<void> {
  const port = Number(getEnv('RUNNER_PORT', '50051'));
  const concurrency = Number(getEnv('RUNNER_CONCURRENCY', '4'));
  const authToken = getEnv('RUNNER_AUTH_TOKEN');
  const fastPathEnabled = getEnv('RUNNER_FASTPATH_ENABLED', 'true') === 'true';

  const queue = new InMemoryQueue();
  const executor = new InProcessExecutor();
  const workers = new WorkerPool({ queue, executor, concurrency });
  workers.start();

  const server = new GrpcServer({ port, authToken, queue, executor, workers, fastPathEnabled });
  await server.start();
  console.log(`[autopilot-runner] gRPC server listening on :${port}`);
}

main().catch((err) => {
  console.error('[autopilot-runner] Fatal error', err);
  process.exit(1);
});
