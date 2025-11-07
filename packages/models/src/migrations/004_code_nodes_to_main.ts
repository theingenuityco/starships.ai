import type { Client } from 'pg';

type JsonObject = Record<string, unknown>;
type BlueprintLike = JsonObject & { nodes?: unknown[] };

function transformCodeToMain(code: string): { code: string; changed: boolean } {
  if (!code || typeof code !== 'string') return { code, changed: false };
  if (/async\s+function\s+main\s*\(/.test(code)) return { code, changed: false };

  let newCode = code;
  // Only replace standalone identifiers, not object keys
  newCode = newCode.replace(/(?<![\w$])input(?![\w$]|\s*:)/g, 'ctx.$input');
  newCode = newCode.replace(/(?<![\w$])state(?![\w$]|\s*:)/g, 'ctx.$state');
  newCode = newCode.replace(/\benv\s*\(/g, 'ctx.$env(');
  newCode = newCode.replace(/\$lastOutputOf\s*\(/g, 'ctx.$lastOutputOf(');
  newCode = newCode.replace(/\s+as\s+(any|unknown|never)/g, '');

  // Local ctx collision
  if (/\b(const|let|var)\s+ctx\s*=/.test(newCode)) {
    newCode = newCode.replace(/\b(const|let|var)\s+ctx\s*=/g, (_, kw) => `${kw} _ctx =`);
    newCode = newCode.replace(/(?<![\w$])ctx\.(?!\$)/g, '_ctx.');
  }

const wrapped = `async function main(ctx) {\n${newCode}\n}`;
  return { code: wrapped, changed: true };
}

function migrateBlueprint(blueprint: BlueprintLike): { blueprint: BlueprintLike; changed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!blueprint || typeof blueprint !== 'object') return { blueprint, changed: false, errors };
  if (!Array.isArray(blueprint.nodes)) return { blueprint, changed: false, errors };
  let changed = false;
  for (const node of blueprint.nodes as unknown[]) {
    if (!node || typeof node !== 'object') continue;
    const nodeObj = node as JsonObject;
    const nodeType = typeof nodeObj.type === 'string' ? (nodeObj.type as string) : undefined;
    if (nodeType !== 'code') continue;
    const params = nodeObj.parameters && typeof nodeObj.parameters === 'object' ? (nodeObj.parameters as JsonObject) : ({} as JsonObject);
    const codeStr = typeof params.code === 'string' ? (params.code as string) : undefined;
    if (!codeStr || codeStr.trim().length === 0) continue;
    const { code, changed: codeChanged } = transformCodeToMain(codeStr);
    if (codeChanged) {
      try {
        // compile check
        new Function('ctx', code);
        (params as JsonObject).code = code;
        (nodeObj as JsonObject).parameters = params;
        changed = true;
      } catch (e: unknown) {
        const err = e as { message?: string } | undefined;
        errors.push(`Node ${(nodeObj as JsonObject).ref ?? '?'} code invalid after transform: ${err?.message ?? String(e)}`);
      }
    }
  }
  return { blueprint, changed, errors };
}

export async function up(client: Client): Promise<void> {
  const tables = [
    { table: 'tools', idColumn: 'id', blueprintColumn: 'blueprint', key: 'slug' },
    { table: 'tool_templates', idColumn: 'id', blueprintColumn: 'blueprint', key: 'slug' },
    { table: 'agents', idColumn: 'id', blueprintColumn: 'blueprint' },
    { table: 'agent_templates', idColumn: 'id', blueprintColumn: 'blueprint' },
  ];

  for (const t of tables) {
    const selectSql = `
      SELECT ${t.idColumn} AS id, ${t.blueprintColumn} AS blueprint${t.key ? `, ${t.key} AS log_key` : ''}
      FROM ${t.table}
      WHERE jsonb_path_exists(${t.blueprintColumn}, '$.nodes ? (@.type == "code")')
    `;
    const res = await (client as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }).query(selectSql);
    const rows: unknown[] = Array.isArray(res) ? (res as unknown[]) : ((res as { rows?: unknown[] } | null | undefined)?.rows ?? []);
    for (const row of rows as Array<{ id: string; log_key?: string; blueprint: BlueprintLike }>) {
      const id = row.id as string;
      const logKey = row.log_key as string | undefined;
      const bp = row.blueprint;
      const { blueprint: newBp, changed, errors } = migrateBlueprint(bp);
      if (errors.length) {
        const label = t.key ? `${t.table}.${t.key}=${logKey ?? id}` : `${t.table}.${t.idColumn}=${id}`;
        throw new Error(`Migration failed for ${label}: ${errors.join('; ')}`);
      }
      if (!changed) continue;
      const updateSql = `UPDATE ${t.table} SET ${t.blueprintColumn} = $1::jsonb WHERE ${t.idColumn} = $2`;
      await client.query(updateSql, [JSON.stringify(newBp), id]);
      console.log(`[UPDATED] ${t.table}.${t.key ? 'slug' : t.idColumn}=${logKey ?? id}`);
    }
  }
}
