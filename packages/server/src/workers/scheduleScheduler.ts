import { getEnvConfig } from '@starships/env';
import { createConnection } from '@starships/models';
import { ScheduleService } from '@/services/ScheduleService';

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
  console.log('[ScheduleScheduler] Connected to PostgreSQL');

  const service = new ScheduleService();

  const intervalMs = process.env.SCHEDULE_POLL_INTERVAL_MS ? parseInt(process.env.SCHEDULE_POLL_INTERVAL_MS, 10) : 300_000;
  if (Number.isNaN(intervalMs) || intervalMs <= 0) {
    throw new Error(`[ScheduleScheduler] Invalid SCHEDULE_POLL_INTERVAL_MS value: ${process.env.SCHEDULE_POLL_INTERVAL_MS}`);
  }

  let running = false;

  const tick = async () => {
    if (running) {
      console.log('[ScheduleScheduler] Previous run still in progress, skipping tick');
      return;
    }

    running = true;
    const startedAt = new Date();
    try {
      console.log('[ScheduleScheduler] Running due schedules tick', { startedAt: startedAt.toISOString() });
      const { processed, skippedByLimit, errors } = await service.runDueSchedules();
      console.log('[ScheduleScheduler] Completed runDueSchedules', {
        processed,
        skippedByLimit,
        errors,
      });
    } catch (err) {
      console.error('[ScheduleScheduler] Failed to run due schedules', err);
    } finally {
      running = false;
    }
  };

  // Kick off immediately, then on interval.
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  tick();
  const interval = setInterval(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    tick();
  }, intervalMs);

  const shutdown = async () => {
    console.log('[ScheduleScheduler] Shutting down...');
    clearInterval(interval);

    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[ScheduleScheduler] Failed to disconnect database', err);
    }

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main().catch(err => {
  console.error('[ScheduleScheduler] Fatal error during startup', err);
  process.exit(1);
});

