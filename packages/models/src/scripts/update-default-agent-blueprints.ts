/**
 * Update all agent + agent_template blueprints to the latest generated default Agent blueprint.
 *
 * This script intentionally overwrites the existing blueprint JSON for:
 * - agents.blueprint
 * - agent_templates.blueprint
 *
 * It preserves per-record LLM configuration by generating the default blueprint using each row's:
 * - model
 * - temperature (optional)
 * - maxTokens (optional)
 * - timeout (optional)
 *
 * IMPORTANT:
 * - This script updates ONLY the blueprint columns (no updated_at writes).
 * - It preserves existing blueprint.metadata.createdAt when present, so reruns are idempotent
 *   unless the underlying blueprint shape changes.
 *
 * Usage (from repo root):
 *   pnpm --filter @starships/models update:default-agent-blueprints -- --dry-run
 *   pnpm --filter @starships/models update:default-agent-blueprints -- --apply
 *
 * Options:
 *   --dry-run           Print counts only (default)
 *   --apply             Perform updates
 *   --only=agents       Only update agents table
 *   --only=templates    Only update agent_templates table
 *   --starship=<id>     Only update agents for a specific starship_id (templates are global and unaffected)
 *   --limit=<n>         Limit number of rows processed per table (for safe testing)
 *   --batch=<n>         Batch size for updates (default: 100)
 *   --reasoning-effort=<low|medium|high>  Override reasoning effort (default: medium).
 *   --no-reasoning      Disable reasoning (do not include reasoning config in the LLM node).
 */

import { Agent } from '@starships/autopilot';
import type { Blueprint } from '@starships/autopilot';
import { getEnvConfig } from '@starships/env';
import { logger } from '@/helpers/logging';
import { createConnection } from '@/helpers/database';

type OnlyMode = 'agents' | 'templates' | 'all';
type ReasoningEffort = 'low' | 'medium' | 'high';

type AgentRow = {
  id: string;
  name: string;
  model: string;
  temperature: string | number | null;
  max_tokens: number | null;
  timeout: number;
  blueprint: unknown;
};

type AgentTemplateRow = {
  id: string;
  name: string;
  model: string;
  temperature: string | number | null;
  max_tokens: number | null;
  timeout: number;
  blueprint: unknown;
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const out: {
    apply: boolean;
    dryRun: boolean;
    only: OnlyMode;
    starshipId?: string;
    limit?: number;
    batchSize: number;
    reasoningEffort?: ReasoningEffort;
  } = {
    apply: false,
    dryRun: true,
    only: 'all',
    batchSize: 100,
    reasoningEffort: 'medium',
  };

  for (const arg of args) {
    if (arg === '--apply') {
      out.apply = true;
      out.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      out.apply = false;
      continue;
    }
    if (arg.startsWith('--only=')) {
      const v = arg.split('=')[1];
      if (v === 'agents' || v === 'templates') out.only = v;
      continue;
    }
    if (arg.startsWith('--starship=')) {
      out.starshipId = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
      continue;
    }
    if (arg.startsWith('--batch=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) out.batchSize = Math.floor(n);
      continue;
    }
    if (arg.startsWith('--reasoning-effort=')) {
      const v = String(arg.split('=')[1] || '').trim();
      if (v === 'low' || v === 'medium' || v === 'high') {
        out.reasoningEffort = v;
      }
      continue;
    }
    if (arg === '--no-reasoning') {
      out.reasoningEffort = undefined;
      continue;
    }
  }

  return out;
}

function toOptionalNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getBlueprintCreatedAt(blueprint: unknown): string | undefined {
  if (!isRecord(blueprint)) return undefined;
  const md = blueprint['metadata'];
  if (!isRecord(md)) return undefined;
  const createdAt = md['createdAt'];
  return typeof createdAt === 'string' && createdAt.length > 0 ? createdAt : undefined;
}

function setBlueprintCreatedAt(blueprint: Blueprint, createdAt?: string): Blueprint {
  if (!createdAt) return blueprint;
  return {
    ...blueprint,
    metadata: {
      ...(blueprint.metadata || {}),
      createdAt,
    },
  };
}

/**
 * Deterministic JSON stringify for deep equality checks.
 * Ensures objects are sorted by key, arrays are preserved.
 */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (v: unknown): unknown => {
    if (v === null) return null;
    if (typeof v !== 'object') return v;
    if (seen.has(v as object)) return '[Circular]';
    seen.add(v as object);

    if (Array.isArray(v)) return v.map((x) => normalize(x));

    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = normalize(obj[k]);
    }
    return out;
  };

  return JSON.stringify(normalize(value));
}

function buildDefaultBlueprintForRow(input: {
  name: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  reasoningEffort?: ReasoningEffort;
}): Blueprint {
  // IMPORTANT: The default blueprint is generated in the Agent constructor when blueprint is omitted.
  const agent = new Agent({
    name: input.name || 'Agent',
    model: input.model,
    ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
    ...(typeof input.maxTokens === 'number' ? { maxTokens: input.maxTokens } : {}),
    ...(typeof input.timeout === 'number' ? { timeout: input.timeout } : {}),
    ...(input.reasoningEffort ? { reasoning: { enabled: true, effort: input.reasoningEffort } } : {}),
    state: { messages: [], tools: [] },
  });
  return agent.getCurrentBlueprint();
}

async function updateInBatches(
  connection: ReturnType<typeof createConnection>,
  opts: { batchSize: number },
  updates: Array<{ id: string; blueprint: Blueprint }>,
  updateSql: string
): Promise<number> {
  if (updates.length === 0) return 0;
  let updated = 0;

  for (let i = 0; i < updates.length; i += opts.batchSize) {
    const batch = updates.slice(i, i + opts.batchSize);
    await connection.transaction(async (client) => {
      for (const row of batch) {
        await client.query(updateSql, [row.id, row.blueprint]);
        updated++;
      }
    });
  }

  return updated;
}

export async function updateDefaultAgentBlueprints(): Promise<void> {
  const opts = parseArgs(process.argv);

  logger.info(`Starting default-agent-blueprint update (${opts.dryRun ? 'dry-run' : 'apply'})`, {
    component: 'update-default-agent-blueprints',
    metadata: {
      only: opts.only,
      starshipId: opts.starshipId,
      limit: opts.limit,
      batchSize: opts.batchSize,
      reasoningEffort: opts.reasoningEffort,
    },
  });

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
    if (opts.only === 'all' || opts.only === 'agents') {
      const where = opts.starshipId ? 'WHERE starship_id = $1' : '';
      const limit = opts.limit ? `LIMIT ${opts.limit}` : '';
      const sql = `
        SELECT id, name, model, temperature, max_tokens, timeout, blueprint
        FROM agents
        ${where}
        ORDER BY created_at ASC
        ${limit}
      `;
      const rows = (await db.query<AgentRow>(sql, opts.starshipId ? [opts.starshipId] : [])) || [];
      logger.info(`Loaded ${rows.length} agent(s)`, { component: 'update-default-agent-blueprints' });

      const updates: Array<{ id: string; blueprint: Blueprint }> = [];
      let skipped = 0;

      for (const r of rows) {
        const existingCreatedAt = getBlueprintCreatedAt(r.blueprint);
        const generated = buildDefaultBlueprintForRow({
          name: r.name,
          model: r.model,
          temperature: toOptionalNumber(r.temperature),
          maxTokens: toOptionalNumber(r.max_tokens),
          timeout: toOptionalNumber(r.timeout),
          reasoningEffort: opts.reasoningEffort,
        });
        const next = setBlueprintCreatedAt(generated, existingCreatedAt);

        // Only update if the blueprint meaningfully changes.
        if (stableStringify(r.blueprint) === stableStringify(next)) {
          skipped++;
          continue;
        }

        updates.push({ id: r.id, blueprint: next });
      }

      if (opts.dryRun) {
        logger.info(`Dry run: would update ${updates.length} agent blueprint(s) (skipped ${skipped})`, {
          component: 'update-default-agent-blueprints',
        });
      } else {
        const updated = await updateInBatches(db, { batchSize: opts.batchSize }, updates, 'UPDATE agents SET blueprint = $2 WHERE id = $1');
        logger.info(`✅ Updated ${updated} agent blueprint(s) (skipped ${skipped})`, { component: 'update-default-agent-blueprints' });
      }
    }

    if (opts.only === 'all' || opts.only === 'templates') {
      const limit = opts.limit ? `LIMIT ${opts.limit}` : '';
      const sql = `
        SELECT id, name, model, temperature, max_tokens, timeout, blueprint
        FROM agent_templates
        ORDER BY created_at ASC
        ${limit}
      `;
      const rows = (await db.query<AgentTemplateRow>(sql)) || [];
      logger.info(`Loaded ${rows.length} agent template(s)`, { component: 'update-default-agent-blueprints' });

      const updates: Array<{ id: string; blueprint: Blueprint }> = [];
      let skipped = 0;

      for (const r of rows) {
        const existingCreatedAt = getBlueprintCreatedAt(r.blueprint);
        const generated = buildDefaultBlueprintForRow({
          name: r.name,
          model: r.model,
          temperature: toOptionalNumber(r.temperature),
          maxTokens: toOptionalNumber(r.max_tokens),
          timeout: toOptionalNumber(r.timeout),
          reasoningEffort: opts.reasoningEffort,
        });
        const next = setBlueprintCreatedAt(generated, existingCreatedAt);

        if (stableStringify(r.blueprint) === stableStringify(next)) {
          skipped++;
          continue;
        }

        updates.push({ id: r.id, blueprint: next });
      }

      if (opts.dryRun) {
        logger.info(`Dry run: would update ${updates.length} agent_template blueprint(s) (skipped ${skipped})`, {
          component: 'update-default-agent-blueprints',
        });
      } else {
        const updated = await updateInBatches(
          db,
          { batchSize: opts.batchSize },
          updates,
          'UPDATE agent_templates SET blueprint = $2 WHERE id = $1'
        );
        logger.info(`✅ Updated ${updated} agent_template blueprint(s) (skipped ${skipped})`, {
          component: 'update-default-agent-blueprints',
        });
      }
    }
  } finally {
    await db.disconnect();
  }
}

if (require.main === module) {
  updateDefaultAgentBlueprints()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Failed to update default agent blueprints', { component: 'update-default-agent-blueprints' }, err as Error);
      process.exit(1);
    });
}
