import { getEnvConfig } from '@starships/env';
import { createConnection } from '@starships/models';
import { ScheduleService } from '@/services/ScheduleService';

async function main(): Promise<void> {
  const config = getEnvConfig();

  const connection = createConnection({
    host: config.POSTGRES_HOST,
    port: config.POSTGRES_PORT,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DATABASE,
    ssl: config.POSTGRES_SSL,
  });

  try {
    await connection.connect();
    const service = new ScheduleService();
    const { processed, skippedByLimit, errors } = await service.runDueSchedules();

    console.log(
      `[ScheduleWorker] Completed runDueSchedules. processed=${processed}, skippedByLimit=${skippedByLimit}, errors=${errors}`
    );
  } catch (err) {
    console.error('[ScheduleWorker] Failed to run due schedules', err);
    process.exitCode = 1;
  } finally {
    try {
      await connection.disconnect();
    } catch (err) {
      console.error('[ScheduleWorker] Failed to close DB connection', err);
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


