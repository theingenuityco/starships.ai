#!/usr/bin/env node
/**
 * Generates one bundle per agent template from starships_prod.
 * Each bundle contains the agent + all its assigned tool templates.
 *
 * Usage:
 *   node scripts/generate-bundles-from-templates.mjs [--force]
 *
 *   --force  Overwrite existing bundle directories
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, writeSync, openSync, closeSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLES_DIR = join(__dirname, '..', 'bundles');
const FORCE = process.argv.includes('--force');
const EXPORTED_AT = new Date().toISOString();

const PG_ENV = {
  ...process.env,
  PGPASSWORD: 'password',
};

function psqlFile(sql) {
  // Write SQL to a temp file to avoid shell escaping issues
  const tmpFile = join(tmpdir(), `starships-gen-${Date.now()}.sql`);
  writeFileSync(tmpFile, sql, 'utf8');
  try {
    const result = execSync(
      `psql -h localhost -p 5432 -U postgres -d starships_prod -t -A -f "${tmpFile}"`,
      { env: PG_ENV, encoding: 'utf8' }
    );
    const trimmed = result.trim();
    if (!trimmed || trimmed === 'NULL') return [];
    return JSON.parse(trimmed);
  } finally {
    try { execSync(`rm -f "${tmpFile}"`); } catch {}
  }
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function buildToolContainer(tool) {
  return {
    schemaVersion: '1',
    kind: 'tool',
    exportedAt: EXPORTED_AT,
    metadata: {
      fromSlug: tool.slug,
    },
    source: {
      app: 'starships.ai',
      version: '0.0.0',
    },
    payload: {
      tool: {
        name: tool.name,
        description: tool.description ?? '',
        parameters: tool.parameters ?? {},
        blueprint: tool.blueprint ?? {},
        transforms: tool.transforms ?? null,
        mutations: tool.mutations ?? null,
        condition: tool.condition ?? null,
        isEnabled: true,
        status: 'active',
      },
    },
  };
}

function buildAgentContainer(agent, toolSlugs) {
  return {
    schemaVersion: '1',
    kind: 'agent',
    exportedAt: EXPORTED_AT,
    metadata: {
      fromSlug: agent.slug,
    },
    source: {
      app: 'starships.ai',
      version: '0.0.0',
    },
    payload: {
      agent: {
        name: agent.name,
        role: agent.role ?? 'Assistant',
        description: agent.description ?? '',
        model: agent.model,
        temperature: agent.temperature ?? null,
        maxTokens: agent.max_tokens ?? null,
        timeout: agent.timeout ?? 30000,
        reasoning: agent.reasoning ?? null,
        systemPrompt: agent.system_prompt ?? '',
        state: agent.state ?? { tools: [], messages: [] },
        blueprint: agent.blueprint ?? {},
        category: agent.category ?? 'general',
        previewPrompts: agent.preview_prompts ?? [],
      },
      assignedToolSlugs: toolSlugs,
    },
  };
}

function buildBundleMeta(agent) {
  return {
    name: agent.name,
    description: agent.description ?? '',
    version: agent.version ?? '1.0.0',
    tags: [agent.category ?? 'general'],
    kind: 'agent',
  };
}

function buildManifest(bundleId, agentSlug, toolSlugs) {
  return {
    schemaVersion: '1',
    kind: 'bundle',
    exportedAt: EXPORTED_AT,
    entities: {
      agents: [
        {
          kind: 'agent',
          fromSlug: agentSlug,
          file: `agents/${bundleId}.json`,
        },
      ],
      tools: toolSlugs.map((slug) => ({
        kind: 'tool',
        fromSlug: slug,
        file: `tools/${slug}.json`,
      })),
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Fetching agent templates from starships_prod…');

const agents = psqlFile(`
SELECT json_agg(t ORDER BY t.name)
FROM (
  SELECT id, slug, name, role, description, category, model,
         temperature, max_tokens, timeout, reasoning, system_prompt,
         state, blueprint, preview_prompts, version
  FROM agent_templates
) t;
`);

console.log(`Found ${agents.length} agent templates.\n`);

console.log('Fetching all agent→tool assignments…');

const allAssignments = psqlFile(`
SELECT json_agg(t ORDER BY t.agent_template_id, t.tool_name)
FROM (
  SELECT
    atta.agent_template_id,
    tt.slug        AS tool_slug,
    tt.name        AS tool_name,
    tt.description AS tool_description,
    tt.parameters  AS tool_parameters,
    tt.blueprint   AS tool_blueprint,
    tt.transforms  AS tool_transforms,
    tt.mutations   AS tool_mutations,
    tt.condition   AS tool_condition
  FROM agent_template_tool_templates atta
  JOIN tool_templates tt ON tt.id = atta.tool_template_id
) t;
`);

// Group assignments by agent_template_id
const toolsByAgent = {};
for (const row of allAssignments) {
  if (!toolsByAgent[row.agent_template_id]) {
    toolsByAgent[row.agent_template_id] = [];
  }
  toolsByAgent[row.agent_template_id].push({
    slug: row.tool_slug,
    name: row.tool_name,
    description: row.tool_description,
    parameters: row.tool_parameters,
    blueprint: row.tool_blueprint,
    transforms: row.tool_transforms,
    mutations: row.tool_mutations,
    condition: row.tool_condition,
  });
}

console.log(`Found ${allAssignments.length} total tool assignments.\n`);

let created = 0;
let skipped = 0;

for (const agent of agents) {
  const bundleId = agent.name.toLowerCase();
  const bundleDir = join(BUNDLES_DIR, bundleId);

  if (existsSync(bundleDir) && !FORCE) {
    console.log(`  SKIP  ${bundleId}/ (already exists, use --force to overwrite)`);
    skipped++;
    continue;
  }

  const tools = toolsByAgent[agent.id] ?? [];
  const toolSlugs = tools.map((t) => t.slug);

  // Create directories
  mkdirSync(join(bundleDir, 'agents'), { recursive: true });
  if (tools.length > 0) {
    mkdirSync(join(bundleDir, 'tools'), { recursive: true });
  }

  // Write bundle.meta.json
  writeJson(join(bundleDir, 'bundle.meta.json'), buildBundleMeta(agent));

  // Write manifest.json
  writeJson(join(bundleDir, 'manifest.json'), buildManifest(bundleId, agent.slug, toolSlugs));

  // Write agent container
  writeJson(join(bundleDir, 'agents', `${bundleId}.json`), buildAgentContainer(agent, toolSlugs));

  // Write tool containers
  for (const tool of tools) {
    writeJson(join(bundleDir, 'tools', `${tool.slug}.json`), buildToolContainer(tool));
  }

  console.log(`  CREATE ${bundleId}/ (1 agent, ${tools.length} tools)`);
  created++;
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
