#!/usr/bin/env node

/**
 * Seed the "List Google Drive Files" test tool template into the database.
 *
 * Use this to quickly add the mock tool for testing required_connector_providers UX.
 *
 * Prerequisites:
 * - Postgres running
 * - Migrations applied (including 092_add_required_connector_providers)
 *
 * Usage: pnpm --filter @starships/models run seed:google-drive-test-tool
 */

import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { seedToolTemplates } from '@/scripts/seed-tool-templates';

async function main(): Promise<void> {
  const env = getEnvConfig();
  const db = createConnection({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL,
  });

  await db.connect();

  try {
    logger.info('Seeding List Google Drive Files test tool...', {
      component: 'seed-google-drive-test-tool',
    });

    await seedToolTemplates({
      only: { names: ['List Google Drive Files'] },
    });

    logger.info('✅ List Google Drive Files tool seeded', {
      component: 'seed-google-drive-test-tool',
    });
  } finally {
    try {
      await db.disconnect();
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('❌ Failed to seed Google Drive test tool:', err?.message || err);
  process.exit(1);
});
