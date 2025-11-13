/* eslint-disable no-useless-escape */
import type { Client } from 'pg';

type JsonObject = Record<string, unknown>;
type BlueprintLike = JsonObject & { nodes?: unknown[] };

const BROKEN_SNIPPET = 'ctx.$input.ctx.$input';

const FIXED_CODE = `async function main(ctx) {
  const envFn = ctx && typeof ctx === 'object' && typeof ctx.$env === 'function' ? ctx.$env : undefined;
  const baseUrlRaw = envFn ? envFn('BASE_URL') : undefined;
  const baseUrl = typeof baseUrlRaw === 'string' ? baseUrlRaw.replace(/\\/+$/, '') : '';
  if (!baseUrl) throw new Error('BASE_URL is required');
  const authToken = envFn ? envFn('AUTH_TOKEN') : undefined;
  const starshipId = envFn ? envFn('STARSHIP_ID') : undefined;
  if (!authToken) throw new Error('AUTH_TOKEN is required');
  if (!starshipId) throw new Error('STARSHIP_ID is required');

  if (!ctx || typeof ctx !== 'object' || !ctx.$input) {
    throw new Error('Tool arguments missing');
  }

  const slug = ctx.$input.slug;
  if (!slug || typeof slug !== 'string') throw new Error('slug is required');

  if (ctx.$input.input === undefined) {
    throw new Error('input is required for testing');
  }

  let testInput = ctx.$input.input;
  if (typeof testInput === 'string') {
    testInput = [{ role: 'user', content: testInput }];
  }

  return {
    url: String(baseUrl) + '/starships/' + String(starshipId) + '/agents/' + String(slug) + '/test',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + String(authToken),
      'Content-Type': 'application/json',
    },
    body: {
      input: testInput,
    },
  };
}`;

const BROKEN_CODE = `async function main(ctx) {

            const baseUrl = (ctx.$env('BASE_URL') || '').replace(/\/+$/, '');
            if (!baseUrl) throw new Error('baseUrl is required');
            const authToken = ctx.$env('AUTH_TOKEN');
            const starshipId = ctx.$env('STARSHIP_ID');
            if (!authToken) throw new Error('authToken is required');
            if (!starshipId) throw new Error('starshipId is required');

            const slug = ctx.$input && ctx.$input.slug;
            if (!slug || typeof slug !== 'string') throw new Error('slug is required');

            if (ctx.$input.ctx.$input === undefined) {
              throw new Error('ctx.$input is required for testing');
            }

            // Normalize ctx.$input to messages array format if needed
            let testInput = ctx.$input.ctx.$input;
            if (typeof testInput === 'string') {
              testInput = [{ role: 'user', content: testInput }];
            }

            return {
              url: \`\${baseUrl}/starships/\${starshipId}/agents/\${slug}/test\`,
              method: 'POST',
              headers: {
                'Authorization': \`Bearer \${authToken}\`,
                'Content-Type': 'application/json'
              },
              body: {
                input: testInput
              }
            };
          
}`;

function updatePrepareNode(blueprint: BlueprintLike, code: string): { changed: boolean; blueprint: BlueprintLike } {
  if (!blueprint || typeof blueprint !== 'object') {
    return { changed: false, blueprint };
  }

  const nodes = Array.isArray(blueprint.nodes) ? (blueprint.nodes as JsonObject[]) : [];
  let changed = false;

  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const type = typeof node.type === 'string' ? (node.type as string) : undefined;
    if (type !== 'code') continue;

    const ref = typeof node.ref === 'string' ? (node.ref as string) : undefined;
    const name = typeof node.name === 'string' ? (node.name as string) : undefined;
    if (ref !== 'prepare' && name !== 'Prepare Test Request') continue;

    const parameters = (node.parameters && typeof node.parameters === 'object' ? (node.parameters as JsonObject) : {}) as JsonObject;
    const currentCode = typeof parameters.code === 'string' ? (parameters.code as string) : '';
    if (currentCode === code) {
      continue;
    }

    const shouldUpdate =
      currentCode.includes(BROKEN_SNIPPET) || currentCode === BROKEN_CODE || currentCode.includes('Tool arguments missing');

    if (shouldUpdate) {
      parameters.code = code;
      node.parameters = parameters;
      changed = true;
      break;
    }
  }

  return { changed, blueprint };
}

async function applyFix(client: Client, table: 'tools' | 'tool_templates', slugColumn: 'slug'): Promise<void> {
  const queryResult = await client.query<{ id: string; slug: string | null; blueprint: BlueprintLike }>(
    `SELECT id, ${slugColumn} AS slug, blueprint FROM ${table} WHERE blueprint::text LIKE $1`,
    [`%${BROKEN_SNIPPET}%`]
  );

  const rows: Array<{ id: string; slug: string | null; blueprint: BlueprintLike }> = Array.isArray(queryResult)
    ? queryResult
    : ((queryResult as { rows?: Array<{ id: string; slug: string | null; blueprint: BlueprintLike }> }).rows ?? []);

  for (const row of rows) {
    const { changed, blueprint } = updatePrepareNode(row.blueprint, FIXED_CODE);
    if (!changed) continue;
    await client.query(`UPDATE ${table} SET blueprint = $1::jsonb WHERE id = $2`, [JSON.stringify(blueprint), row.id]);
  }
}

export async function up(client: Client): Promise<void> {
  await applyFix(client, 'tool_templates', 'slug');
  await applyFix(client, 'tools', 'slug');
}

async function revertFix(client: Client, table: 'tools' | 'tool_templates', slugColumn: 'slug'): Promise<void> {
  const queryResult = await client.query<{ id: string; slug: string | null; blueprint: BlueprintLike }>(
    `SELECT id, ${slugColumn} AS slug, blueprint FROM ${table} WHERE blueprint::text LIKE $1`,
    ['%Tool arguments missing%']
  );

  const rows: Array<{ id: string; slug: string | null; blueprint: BlueprintLike }> = Array.isArray(queryResult)
    ? queryResult
    : ((queryResult as { rows?: Array<{ id: string; slug: string | null; blueprint: BlueprintLike }> }).rows ?? []);

  for (const row of rows) {
    const { changed, blueprint } = updatePrepareNode(row.blueprint, BROKEN_CODE);
    if (!changed) continue;
    await client.query(`UPDATE ${table} SET blueprint = $1::jsonb WHERE id = $2`, [JSON.stringify(blueprint), row.id]);
  }
}

export async function down(client: Client): Promise<void> {
  await revertFix(client, 'tools', 'slug');
  await revertFix(client, 'tool_templates', 'slug');
}
