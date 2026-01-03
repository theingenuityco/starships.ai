#!/usr/bin/env node

/**
 * Regenerate slugs for all instances and templates.
 *
 * - Instances (agents/tools): slug = slugify(name) with incremental suffixes, unique per (starship_id, slug)
 * - Templates (agent_templates/tool_templates): slug = slugify(name) + random suffix, unique globally
 *
 * Also updates known stored slug references:
 * - agents.state / agents.blueprint (best-effort: replaces exact string matches for old tool slugs)
 *
 * Usage:
 *   pnpm -C packages/models run migrate:regenerate-slugs -- --dry-run
 *   pnpm -C packages/models run migrate:regenerate-slugs
 */

import { getEnvConfig } from '@starships/env';
import { createConnection } from '@/helpers/database';
import { logger } from '@/helpers/logging';
import { generateSlug } from '@/helpers/slugUtils';
import { generateRandomSuffix } from '@/utils/slugGenerator';

type Args = {
  dryRun: boolean;
  starshipId?: string;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const out: Args = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dry-run' || a === '-n') out.dryRun = true;
    if (a.startsWith('--starship-id=')) out.starshipId = a.split('=')[1];
    if (a === '--starship-id' && args[i + 1] && !args[i + 1].startsWith('-')) {
      out.starshipId = args[i + 1];
      i++;
    }
  }
  return out;
}

function uniqueTemplateSlug(base: string, used: Set<string>, maxLen = 100): string {
  const safeBase = (generateSlug(base) || 'template').slice(0, maxLen);
  for (let i = 0; i < 1000; i++) {
    const suffix = generateRandomSuffix();
    const fullSuffix = `-${suffix}`;
    const candidate = `${safeBase.slice(0, Math.max(1, maxLen - fullSuffix.length))}${fullSuffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Fallback: timestamp
  const ts = Date.now().toString(36);
  const fullSuffix = `-${ts}`;
  const candidate = `${safeBase.slice(0, Math.max(1, maxLen - fullSuffix.length))}${fullSuffix}`;
  used.add(candidate);
  return candidate;
}

function uniqueInstanceSlugIncremental(base: string, used: Set<string>, maxLen = 100): string {
  const safeBase = (generateSlug(base) || 'item').slice(0, maxLen);
  if (!used.has(safeBase)) {
    used.add(safeBase);
    return safeBase;
  }
  for (let counter = 2; counter < 100_000; counter++) {
    const suffix = `-${counter}`;
    const candidate = `${safeBase.slice(0, Math.max(1, maxLen - suffix.length))}${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const ts = Date.now().toString(36);
  const suffix = `-${ts}`;
  const candidate = `${safeBase.slice(0, Math.max(1, maxLen - suffix.length))}${suffix}`;
  used.add(candidate);
  return candidate;
}

type StarshipRow = { id: string; slug: string };
type TemplateRow = { id: string; name: string; slug: string };
type ToolRow = { id: string; name: string; slug: string; starship_id: string | null };
type AgentRow = { id: string; name: string; slug: string; starship_id: string | null; state: unknown; blueprint: unknown };

export async function regenerateSlugs(args: Args): Promise<void> {
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

  const startedAt = Date.now();
  logger.info(`Starting slug regeneration (${args.dryRun ? 'dry-run' : 'apply'})`, {
    component: 'regenerate-slugs',
    metadata: { starshipId: args.starshipId },
  });

  try {
    await db.transaction(async (client) => {
      const q = async <T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> => {
        const res = await client.query(text, params);
        return (res.rows as T[]) ?? [];
      };

      // ---------------------------------------------------------------------
      // Templates (global)
      // ---------------------------------------------------------------------
      const usedToolTemplateSlugs = new Set<string>();
      const toolTemplates = await q<TemplateRow>('SELECT id, name, slug FROM tool_templates ORDER BY created_at ASC, id ASC');
      const toolTemplateSlugMap = new Map<string, string>(); // old -> new
      for (const t of toolTemplates) {
        const next = uniqueTemplateSlug(t.name || 'tool-template', usedToolTemplateSlugs, 100);
        toolTemplateSlugMap.set(t.slug, next);
      }

      const usedAgentTemplateSlugs = new Set<string>();
      const agentTemplates = await q<TemplateRow>('SELECT id, name, slug FROM agent_templates ORDER BY created_at ASC, id ASC');
      const agentTemplateSlugMap = new Map<string, string>(); // old -> new
      for (const t of agentTemplates) {
        const next = uniqueTemplateSlug(t.name || 'agent-template', usedAgentTemplateSlugs, 100);
        agentTemplateSlugMap.set(t.slug, next);
      }

      // Track template updates (useful for reruns / dry-run)
      const toolTemplatesUpdated = toolTemplates.filter((t) => toolTemplateSlugMap.get(t.slug) !== t.slug).length;
      const agentTemplatesUpdated = agentTemplates.filter((t) => agentTemplateSlugMap.get(t.slug) !== t.slug).length;

      if (!args.dryRun) {
        for (const t of toolTemplates) {
          const next = toolTemplateSlugMap.get(t.slug)!;
          await client.query('UPDATE tool_templates SET slug = $2, updated_at = NOW() WHERE id = $1', [t.id, next]);
        }
        for (const t of agentTemplates) {
          const next = agentTemplateSlugMap.get(t.slug)!;
          await client.query('UPDATE agent_templates SET slug = $2, updated_at = NOW() WHERE id = $1', [t.id, next]);
        }
      }

      // ---------------------------------------------------------------------
      // Instances (per starship)
      // ---------------------------------------------------------------------
      const starships = await q<StarshipRow>(
        args.starshipId ? 'SELECT id, slug FROM starships WHERE id = $1' : 'SELECT id, slug FROM starships ORDER BY created_at ASC, id ASC',
        args.starshipId ? [args.starshipId] : []
      );

      let toolsUpdated = 0;
      let agentsUpdated = 0;

      for (const s of starships) {
        // Tools first (we need tool slug mapping to update agent JSON and tool_call_approvals)
        const tools = await q<ToolRow>(
          'SELECT id, name, slug, starship_id FROM tools WHERE starship_id = $1 ORDER BY created_at ASC, id ASC',
          [s.id]
        );
        const usedToolSlugs = new Set<string>();
        const toolSlugMap = new Map<string, string>(); // old -> new (within starship)
        for (const t of tools) {
          const next = uniqueInstanceSlugIncremental(t.name || 'tool', usedToolSlugs, 100);
          toolSlugMap.set(t.slug, next);
        }

        if (!args.dryRun) {
          for (const t of tools) {
            const next = toolSlugMap.get(t.slug)!;
            if (next !== t.slug) {
              toolsUpdated++;
              await client.query('UPDATE tools SET slug = $2, updated_at = NOW() WHERE id = $1', [t.id, next]);
            }
          }
        } else {
          toolsUpdated += tools.filter((t: ToolRow) => toolSlugMap.get(t.slug) !== t.slug).length;
        }

        // Agents: regenerate agent slugs per starship
        const agents = await q<AgentRow>(
          'SELECT id, name, slug, starship_id, state, blueprint FROM agents WHERE starship_id = $1 ORDER BY created_at ASC, id ASC',
          [s.id]
        );
        const usedAgentSlugs = new Set<string>();
        const agentSlugMap = new Map<string, string>();
        for (const a of agents) {
          const next = uniqueInstanceSlugIncremental(a.name || 'agent', usedAgentSlugs, 100);
          agentSlugMap.set(a.slug, next);
        }

        if (!args.dryRun) {
          for (const a of agents) {
            const next = agentSlugMap.get(a.slug)!;
            if (next !== a.slug) {
              agentsUpdated++;
              await client.query('UPDATE agents SET slug = $2, updated_at = NOW() WHERE id = $1', [a.id, next]);
            }
          }
        } else {
          agentsUpdated += agents.filter((a: AgentRow) => agentSlugMap.get(a.slug) !== a.slug).length;
        }
      }

      logger.info('Slug regeneration summary', {
        component: 'regenerate-slugs',
        metadata: {
          toolTemplatesUpdated,
          agentTemplatesUpdated,
          toolsUpdated,
          agentsUpdated,
        },
      });
    });

    const ms = Date.now() - startedAt;
    logger.info(`Slug regeneration complete in ${ms}ms`, { component: 'regenerate-slugs' });
  } finally {
    await db.disconnect();
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv);
  regenerateSlugs(args).catch((err) => {
    logger.error('Slug regeneration failed', { component: 'regenerate-slugs' }, err as Error);
    process.exit(1);
  });
}
