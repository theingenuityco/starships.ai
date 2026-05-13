#!/usr/bin/env node
/**
 * Generates one bundle per connector template from starships_prod.
 * Each bundle contains a single connector-template JSON file in the
 * ImportExportContainerV1<'connector_template'> format.
 *
 * Usage:
 *   node scripts/generate-connector-bundles.mjs [--force]
 *
 *   --force  Overwrite existing bundle directories
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
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
  const tmpFile = join(tmpdir(), `starships-connector-gen-${Date.now()}.sql`);
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

function mapActionRow(row) {
  const kind = String(row.kind ?? 'http').trim().toLowerCase();
  const parameters = row.parameters_json && typeof row.parameters_json === 'object' && !Array.isArray(row.parameters_json)
    ? row.parameters_json : undefined;
  const response = row.response_json && typeof row.response_json === 'object' && !Array.isArray(row.response_json)
    ? row.response_json : undefined;

  if (kind === 'sql') {
    return {
      kind: 'sql',
      name: row.action_name,
      ...(row.description ? { description: row.description } : {}),
      driver: (typeof row.driver === 'string' && row.driver.trim()) ? row.driver.trim() : 'postgres',
      sql: typeof row.sql_text === 'string' ? row.sql_text : '',
      ...(row.sql_mode === 'execute' || row.sql_mode === 'query' ? { mode: row.sql_mode } : {}),
      ...(typeof row.row_limit === 'number' ? { rowLimit: row.row_limit } : {}),
      ...(typeof row.read_only === 'boolean' ? { readOnly: row.read_only } : {}),
      ...(parameters ? { parameters } : {}),
      ...(response ? { response } : {}),
      ...(typeof row.timeout_ms === 'number' ? { timeoutMs: row.timeout_ms } : {}),
    };
  }

  // HTTP endpoint
  const mapping = row.mapping_json && typeof row.mapping_json === 'object' && !Array.isArray(row.mapping_json)
    ? row.mapping_json : undefined;

  return {
    name: row.action_name,
    ...(row.description ? { description: row.description } : {}),
    method: row.method,
    path: row.path,
    ...(row.base_url_override ? { baseUrlOverride: row.base_url_override } : {}),
    ...(row.request_style ? { requestStyle: row.request_style } : {}),
    ...(parameters ? { parameters } : {}),
    ...(mapping ? { mapping } : {}),
    ...(response ? { response } : {}),
    ...(typeof row.timeout_ms === 'number' ? { timeoutMs: row.timeout_ms } : {}),
  };
}

function buildConnectorContainer(template, actions) {
  const auth = template.auth_json ?? { type: 'none' };
  const payload = {
    connectorTemplate: {
      id: template.id,
      slug: template.slug,
      provider: template.provider,
      name: template.name,
      description: template.description ?? '',
      isEnabled: Boolean(template.is_enabled),
      version: template.version ?? '1.0.0',
      category: template.category ?? 'general',
      baseUrl: template.base_url ?? '',
      auth,
      ...(Array.isArray(template.variables_json) ? { variables: template.variables_json } : {}),
      ...(template.rate_limit_json && typeof template.rate_limit_json === 'object' && !Array.isArray(template.rate_limit_json)
        ? { rateLimit: template.rate_limit_json } : {}),
      ...(template.metadata_schema_json && typeof template.metadata_schema_json === 'object' && !Array.isArray(template.metadata_schema_json)
        ? { metadataSchema: template.metadata_schema_json } : {}),
      ...(template.demo_video_url ? { demoVideoUrl: template.demo_video_url } : {}),
    },
    actions: actions.map(mapActionRow),
    ...(template.webhooks_json && typeof template.webhooks_json === 'object' && !Array.isArray(template.webhooks_json)
      ? { webhooks: template.webhooks_json } : {}),
  };

  return {
    schemaVersion: '1',
    kind: 'connector_template',
    exportedAt: EXPORTED_AT,
    metadata: {
      fromProvider: template.provider,
      fromSlug: template.slug,
      fromId: template.id,
    },
    source: {
      app: 'starships.ai',
      version: '0.0.0',
    },
    payload,
  };
}

function buildBundleMeta(template) {
  return {
    name: template.name,
    description: template.description ?? '',
    version: template.version ?? '1.0.0',
    tags: [template.category ?? 'general'],
    kind: 'connector',
  };
}

function buildManifest(provider) {
  return {
    schemaVersion: '1',
    kind: 'bundle',
    exportedAt: EXPORTED_AT,
    entities: {
      connectorTemplates: [
        {
          kind: 'connector_template',
          fromSlug: provider,
          file: `connector-templates/${provider}.json`,
        },
      ],
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Fetching connector templates from starships_prod…');

const templates = psqlFile(`
SELECT json_agg(t ORDER BY t.provider)
FROM (
  SELECT
    id, slug, provider, name, description, is_enabled,
    version, category, base_url, auth_json, variables_json,
    rate_limit_json, metadata_schema_json, webhooks_json, demo_video_url
  FROM connector_templates
) t;
`);

if (!Array.isArray(templates) || templates.length === 0) {
  console.log('No connector templates found in starships_prod. Exiting.');
  process.exit(0);
}

console.log(`Found ${templates.length} connector templates.\n`);

console.log('Fetching all connector template actions…');

const allActions = psqlFile(`
SELECT json_agg(t ORDER BY t.template_id, t.ordinal)
FROM (
  SELECT
    template_id, action_name, ordinal, kind,
    method, path, description, base_url_override, timeout_ms,
    request_style, parameters_json, mapping_json, response_json,
    driver, sql_text, sql_mode, row_limit, read_only
  FROM connector_template_actions
) t;
`);

const actionsByTemplate = {};
for (const row of (allActions ?? [])) {
  if (!actionsByTemplate[row.template_id]) actionsByTemplate[row.template_id] = [];
  actionsByTemplate[row.template_id].push(row);
}

console.log(`Found ${(allActions ?? []).length} total actions.\n`);

let created = 0;
let skipped = 0;

for (const template of templates) {
  const bundleId = template.provider;
  const bundleDir = join(BUNDLES_DIR, bundleId);

  if (existsSync(bundleDir) && !FORCE) {
    console.log(`  SKIP  ${bundleId}/ (already exists, use --force to overwrite)`);
    skipped++;
    continue;
  }

  const actions = actionsByTemplate[template.id] ?? [];

  mkdirSync(join(bundleDir, 'connector-templates'), { recursive: true });

  writeJson(join(bundleDir, 'bundle.meta.json'), buildBundleMeta(template));
  writeJson(join(bundleDir, 'manifest.json'), buildManifest(template.provider));
  writeJson(
    join(bundleDir, 'connector-templates', `${template.provider}.json`),
    buildConnectorContainer(template, actions)
  );

  console.log(`  CREATE ${bundleId}/ (${actions.length} actions)`);
  created++;
}

console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
