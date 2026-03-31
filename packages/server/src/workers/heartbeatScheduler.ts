import { getEnvConfig } from '@starships/env';
import { createConnection } from '@starships/models';
import { HeartbeatService } from '@/services/HeartbeatService';

async function main(): Promise<void> {
  const env = getEnvConfig();

  const connection = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await connection.connect();
  console.log('[HeartbeatScheduler] Connected to PostgreSQL');

  const service = new HeartbeatService();

  const intervalMs = process.env.HEARTBEAT_POLL_INTERVAL_MS ? parseInt(process.env.HEARTBEAT_POLL_INTERVAL_MS, 10) : 60_000;
  if (Number.isNaN(intervalMs) || intervalMs <= 0) {
    throw new Error(`[HeartbeatScheduler] Invalid HEARTBEAT_POLL_INTERVAL_MS value: ${process.env.HEARTBEAT_POLL_INTERVAL_MS}`);
  }

  let running = false;

  const tick = async () => {
    if (running) {
      console.log('[HeartbeatScheduler] Previous run still in progress, skipping tick');
      return;
    }

    running = true;
    const startedAt = new Date();
    try {
      console.log('[HeartbeatScheduler] Running due heartbeats tick', { startedAt: startedAt.toISOString() });
      const { processed, skippedByLimit, errors } = await service.runDueHeartbeats();
      console.log('[HeartbeatScheduler] Completed runDueHeartbeats', {
        processed,
        skippedByLimit,
        errors,
      });
    } catch (err) {
      console.error('[HeartbeatScheduler] Failed to run due heartbeats', err);
    } finally {
      running = false;
    }
  };

  tick();
  const interval = setInterval(() => {
    tick();
  }, intervalMs);

  const shutdown = async () => {
    console.log('[HeartbeatScheduler] Shutting down...');
    clearInterval(interval);

    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[HeartbeatScheduler] Failed to disconnect database', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[HeartbeatScheduler] Fatal error during startup', err);
  process.exit(1);
});
