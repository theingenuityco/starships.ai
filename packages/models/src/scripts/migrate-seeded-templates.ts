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

function parseArgs(argv: string[]): {
  toolNames?: string[];
  toolSlugs?: string[];
  skipAgents: boolean;
} {
  const toolNames: string[] = [];
  const toolSlugs: string[] = [];
  let skipAgents = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tool' || a === '--tool-slug') {
      const v = argv[i + 1];
      if (v) {
        toolSlugs.push(v);
        i++;
      }
      continue;
    }
    if (a === '--tool-name') {
      const v = argv[i + 1];
      if (v) {
        toolNames.push(v);
        i++;
      }
      continue;
    }
    if (a === '--tools-only' || a === '--skip-agents') {
      skipAgents = true;
      continue;
    }
  }

  // If user provided a tool filter, default to tools-only to avoid agent template
  // seeding being incomplete (agents reference many tools).
  if (toolNames.length > 0 || toolSlugs.length > 0) {
    skipAgents = true;
  }

  return {
    toolNames: toolNames.length > 0 ? toolNames : undefined,
    toolSlugs: toolSlugs.length > 0 ? toolSlugs : undefined,
    skipAgents,
  };
}

export async function migrateSeededTemplates(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
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
    await seedToolTemplates({
      only:
        args.toolNames || args.toolSlugs
          ? {
              names: args.toolNames,
              slugs: args.toolSlugs,
            }
          : undefined,
    });

    if (!args.skipAgents) {
      await seedAgentTemplates();
    } else {
      logger.info('Skipping agent template seeding (tools-only run)', {
        component: 'migrate-seeded-templates',
        metadata: { toolNames: args.toolNames ?? [], toolSlugs: args.toolSlugs ?? [] },
      });
    }

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


