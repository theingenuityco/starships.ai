import { Client } from 'pg';
import { getEnvConfig } from '@starships/env';

type TableTarget = {
  table: string;
  idColumn: string;
  blueprintColumn: string;
};

const DEFAULT_TARGETS: TableTarget[] = [
  { table: 'tools', idColumn: 'id', blueprintColumn: 'blueprint' },
  { table: 'tool_templates', idColumn: 'id', blueprintColumn: 'blueprint' },
  { table: 'agents', idColumn: 'id', blueprintColumn: 'blueprint' },
  { table: 'agent_templates', idColumn: 'id', blueprintColumn: 'blueprint' },
];

// Optional logging key per table (print slug instead of id for tool tables)
const LOG_KEY_COLUMN: Record<string, string | undefined> = {
  tools: 'slug',
  tool_templates: 'slug',
};

function parseArgs(): { dryRun: boolean; targets: TableTarget[] } {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || args.includes('-n');

  // Optional: --tables tools,tool_templates,agents,workflows
  const tablesArg = args.find((a) => a.startsWith('--tables='));
  if (!tablesArg) {
    return { dryRun, targets: DEFAULT_TARGETS };
  }
  const list = tablesArg.split('=')[1]?.split(',').map((s) => s.trim()).filter(Boolean) || [];
  const normalized: TableTarget[] = [];
  for (const t of list) {
    const match = DEFAULT_TARGETS.find((x) => x.table === t);
    if (match) normalized.push(match);
  }
  return { dryRun, targets: normalized.length ? normalized : DEFAULT_TARGETS };
}

function transformCodeToMain(code: string): { code: string; changed: boolean } {
  if (!code || typeof code !== 'string') return { code, changed: false };
  // Already migrated?
  if (/async\s+function\s+main\s*\(/.test(code)) {
    return { code, changed: false };
  }

  let newCode = code;

  // JS-safe identifier replacements (avoid replacing inside longer identifiers or object keys)
  // Only replace standalone identifiers NOT used as object keys (input: or state:)
  // input -> ctx.$input ; state -> ctx.$state
  newCode = newCode.replace(/(?<![\w$])input(?![\w$]|\s*:)/g, 'ctx.$input');
  newCode = newCode.replace(/(?<![\w$])state(?![\w$]|\s*:)/g, 'ctx.$state');

  // env( -> ctx.$env( ; $lastOutputOf( -> ctx.$lastOutputOf(
  newCode = newCode.replace(/\benv\s*\(/g, 'ctx.$env(');
  newCode = newCode.replace(/\$lastOutputOf\s*\(/g, 'ctx.$lastOutputOf(');

  // Remove some common TS casts that may appear inside strings
  newCode = newCode.replace(/\s+as\s+(any|unknown|never)/g, '');

  // Handle local ctx collisions: if code declares const/let/var ctx = ..., rename it to _ctx
  if (/\b(const|let|var)\s+ctx\s*=/.test(newCode)) {
    // Rename declaration
    newCode = newCode.replace(/\b(const|let|var)\s+ctx\s*=/g, (_, kw) => `${kw} _ctx =`);
    // Rename subsequent property accesses that refer to the local variable (non-$ properties)
    newCode = newCode.replace(/(?<![\w$])ctx\.(?!\$)/g, '_ctx.');
  }

  // Wrap with async main(ctx)
  const wrapped = `async function main(ctx) {
${newCode}
}`;
  return { code: wrapped, changed: true };
}

function migrateBlueprint(blueprint: any): { blueprint: any; changed: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!blueprint || typeof blueprint !== 'object') return { blueprint, changed: false, errors };
  if (!Array.isArray(blueprint.nodes)) return { blueprint, changed: false, errors };

  let changed = false;
  for (const node of blueprint.nodes) {
    if (!node || typeof node !== 'object') continue;
    if (node.type !== 'code') continue;
    const params = node.parameters || {};
    if (!params || typeof params !== 'object') continue;
    const codeStr = params.code;
    if (typeof codeStr !== 'string' || codeStr.trim().length === 0) continue;

    const { code, changed: codeChanged } = transformCodeToMain(codeStr);
    if (codeChanged) {
      // Basic compile check (no execution)
      try {
        // Compile the function body (the engine will wrap it further); here we ensure syntax is okay
        // Provide 'ctx' parameter to mirror runtime scope
        new Function('ctx', code);
        params.code = code;
        node.parameters = params;
        changed = true;
      } catch (e: any) {
        errors.push(`Node ${node.ref ?? '?'} code invalid after transform: ${e?.message ?? String(e)}`);
      }
    }
  }
  return { blueprint, changed, errors };
}

async function main() {
  const { dryRun, targets } = parseArgs();

  // Use centralized env configuration
  const env = getEnvConfig();
  const client = new Client({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    database: env.POSTGRES_DATABASE,
    ssl: env.POSTGRES_SSL ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  let totalExamined = 0;
  let totalChanged = 0;
  const problems: Array<{ table: string; keyLabel: string; keyValue: string; message: string }> = [];

  for (const target of targets) {
    const { table, idColumn, blueprintColumn } = target;
    // Find rows with at least one code node
    const logKeyColumn = LOG_KEY_COLUMN[table];
    const selectSql = `
      SELECT ${idColumn} AS id, ${blueprintColumn} AS blueprint${logKeyColumn ? `, ${logKeyColumn} AS log_key` : ''}
      FROM ${table}
      WHERE jsonb_path_exists(${blueprintColumn}, '$.nodes ? (@.type == "code")')
    `;
    const res = await client.query(selectSql);
    if (!res.rows?.length) continue;

    for (const row of res.rows) {
      totalExamined += 1;
      const id = row.id;
      const logKey = row.log_key as string | undefined;
      const blueprint = row.blueprint;
      const { blueprint: newBp, changed, errors } = migrateBlueprint(blueprint);
      if (errors.length) {
        const keyLabel = LOG_KEY_COLUMN[table] ? 'slug' : target.idColumn;
        const keyValue = (logKey ?? id) as string;
        for (const msg of errors) problems.push({ table, keyLabel, keyValue: String(keyValue), message: msg });
        continue;
      }
      if (!changed) continue;
      totalChanged += 1;

      if (dryRun) {
        // No updates, just log
        // eslint-disable-next-line no-console
        console.log(
          `[DRY-RUN] Would update ${table}.${logKey ? 'slug' : idColumn}=${logKey ?? id}`
        );
      } else {
        const updateSql = `
          UPDATE ${table}
          SET ${blueprintColumn} = $1::jsonb
          WHERE ${idColumn} = $2
        `;
        await client.query(updateSql, [JSON.stringify(newBp), id]);
        // eslint-disable-next-line no-console
        console.log(
          `[UPDATED] ${table}.${logKey ? 'slug' : idColumn}=${logKey ?? id}`
        );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\nMigration summary: examined=${totalExamined}, changed=${totalChanged}, dryRun=${dryRun}`);
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.error(`Encountered ${problems.length} transform errors:`);
    for (const p of problems) {
      // eslint-disable-next-line no-console
      console.error(`- ${p.table} ${p.keyLabel}=${p.keyValue}: ${p.message}`);
    }
  }

  await client.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Migration failed:', err?.message || err);
  process.exit(1);
});


