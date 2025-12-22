#!/usr/bin/env node

/**
 * Seed ONLY marketplace templates:
 * - tool_templates
 * - agent_templates
 *
 * Notes:
 * - Idempotent: safe to run multiple times (upserts by slug).
 * - Intentionally does NOT deploy any agents/tools to starships.
 * - Intentionally does NOT seed connectors or any other tables.
 */

import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { seedToolTemplates } from '@/scripts/seed-tool-templates';
import { seedAgentTemplates } from '@/scripts/seed-agent-templates';

export async function migrateSeededTemplates(): Promise<void> {
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
    logger.info('Starting seeded template migration (tool_templates + agent_templates only)...', {
      component: 'migrate-seeded-templates',
    });

    // Agent templates can reference tool templates by slug, so tools must be seeded first.
    await seedToolTemplates();
    await seedAgentTemplates();

    logger.info('✅ Seeded template migration completed', { component: 'migrate-seeded-templates' });
  } finally {
    try {
      await db.disconnect();
    } catch {
      // ignore
    }
  }
}

if (require.main === module) {
  migrateSeededTemplates()
    .then(() => {
      // Keep CLI output succinct; detailed logs are already emitted via logger.
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seeded template migration failed:', err?.message || err);
      process.exit(1);
    });
}

