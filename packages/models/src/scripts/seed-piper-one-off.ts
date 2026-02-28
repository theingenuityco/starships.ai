#!/usr/bin/env node

/**
 * One-off script: Add Piper agent template to local DB only.
 * NOT part of prod seed. Run locally when you need Piper:
 *
 *   pnpm --filter @starships/models seed:piper-one-off
 *
 * Idempotent: if Piper already exists (by name), it will be updated.
 */

import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { AgentTemplateRepository } from '@/repositories/AgentTemplateRepository';
import { piperTemplate } from '@/seeders/agents/piper';
import type { CreateAgentTemplateRequest, UpdateAgentTemplateRequest } from '@starships/protocol';

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
    logger.info('Adding Piper agent template (one-off, local only)...', {
      component: 'seed-piper-one-off',
    });

    const repo = new AgentTemplateRepository();
    const existing = await repo.findByName('Piper');

    if (existing) {
      const updatePayload: UpdateAgentTemplateRequest = {
        description: piperTemplate.description,
        category: piperTemplate.category,
        model: piperTemplate.model,
        temperature: piperTemplate.temperature,
        maxTokens: piperTemplate.maxTokens,
        timeout: piperTemplate.timeout,
        systemPrompt: piperTemplate.systemPrompt,
        blueprint: piperTemplate.blueprint,
        state: piperTemplate.state,
        icon: piperTemplate.icon,
        previewPrompts: piperTemplate.previewPrompts,
        assignedToolSlugs: piperTemplate.assignedToolSlugs,
        role: piperTemplate.role,
        version: piperTemplate.version,
        ...(piperTemplate.reasoning != null && { reasoning: piperTemplate.reasoning }),
      };
      const updated = await repo.update(existing.id, updatePayload);
      logger.info(`✅ Piper UPDATED: v${updated?.version} (slug: ${updated?.slug})`, {
        component: 'seed-piper-one-off',
      });
    } else {
      const payload: CreateAgentTemplateRequest = {
        name: piperTemplate.name,
        description: piperTemplate.description,
        category: piperTemplate.category,
        model: piperTemplate.model,
        temperature: piperTemplate.temperature,
        maxTokens: piperTemplate.maxTokens,
        timeout: piperTemplate.timeout,
        icon: piperTemplate.icon,
        previewPrompts: piperTemplate.previewPrompts,
        blueprint: piperTemplate.blueprint,
        systemPrompt: piperTemplate.systemPrompt,
        state: piperTemplate.state,
        assignedToolSlugs: piperTemplate.assignedToolSlugs,
        role: piperTemplate.role,
        version: piperTemplate.version,
        ...(piperTemplate.reasoning != null && { reasoning: piperTemplate.reasoning }),
      };
      const created = await repo.create(payload);
      logger.info(`✅ Piper CREATED: v${created.version} (slug: ${created.slug})`, {
        component: 'seed-piper-one-off',
      });
    }

    logger.info('Done. Piper is in your local agent_templates.', {
      component: 'seed-piper-one-off',
    });
  } finally {
    try {
      await db.disconnect();
    } catch {
      // ignore
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('seed-piper-one-off failed', { component: 'seed-piper-one-off' }, err);
    process.exit(1);
  });
