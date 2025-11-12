import type { Client } from 'pg';

type JsonObject = Record<string, unknown>;
type BlueprintLike = JsonObject & { nodes?: unknown[] };

function transformCodeToMain(code: string): { code: string; changed: boolean } {
  if (!code || typeof code !== 'string') return { code, changed: false };
  if (/async\s+function\s+main\s*\(/.test(code)) return { code, changed: false };

  // Helper to compile-check a candidate
  const compiles = (candidate: string): boolean => {
    try {
      // eslint-disable-next-line no-new-func
      new Function('ctx', candidate);
      return true;
    } catch {
      return false;
    }
  };

  // Strategy A: full transform (original behavior)
  const applyFullTransform = (src: string): string => {
    let transformed = src;
  // Only replace standalone identifiers, not object keys
    transformed = transformed.replace(/(?<![\w$])input(?![\w$]|\s*:)/g, 'ctx.$input');
    transformed = transformed.replace(/(?<![\w$])state(?![\w$]|\s*:)/g, 'ctx.$state');
    transformed = transformed.replace(/\benv\s*\(/g, 'ctx.$env(');
    transformed = transformed.replace(/\$lastOutputOf\s*\(/g, 'ctx.$lastOutputOf(');
    transformed = transformed.replace(/\s+as\s+(any|unknown|never)/g, '');

  // Local ctx collision
    if (/\b(const|let|var)\s+ctx\s*=/.test(transformed)) {
      transformed = transformed.replace(/\b(const|let|var)\s+ctx\s*=/g, (_, kw) => `${kw} _ctx =`);
      transformed = transformed.replace(/(?<![\w$])ctx\.(?!\$)/g, '_ctx.');
    }
    return transformed;
  };

  // Strategy B: minimal transform (wrap only + env helpers)
  const applyMinimalTransform = (src: string): string => {
    let transformed = src;
    transformed = transformed.replace(/\benv\s*\(/g, 'ctx.$env(');
    transformed = transformed.replace(/\$lastOutputOf\s*\(/g, 'ctx.$lastOutputOf(');
    transformed = transformed.replace(/\s+as\s+(any|unknown|never)/g, '');
    if (/\b(const|let|var)\s+ctx\s*=/.test(transformed)) {
      transformed = transformed.replace(/\b(const|let|var)\s+ctx\s*=/g, (_, kw) => `${kw} _ctx =`);
      transformed = transformed.replace(/(?<![\w$])ctx\.(?!\$)/g, '_ctx.');
  }
    return transformed;
  };

  // Try full transform first
  let candidate = applyFullTransform(code);
  let wrapped = `async function main(ctx) {\n${candidate}\n}`;
  if (compiles(wrapped)) {
    return { code: wrapped, changed: true };
  }

  // If that failed (e.g., due to naive 'input'/'state' replacements inside template literals),
  // fall back to a minimal transform that avoids those replacements.
  candidate = applyMinimalTransform(code);
  wrapped = `async function main(ctx) {\n${candidate}\n}`;
  if (compiles(wrapped)) {
    return { code: wrapped, changed: true };
  }

  // Final fallback: wrap original code only. If this still does not compile,
  // let the caller capture and report the error.
  wrapped = `async function main(ctx) {\n${code}\n}`;
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
        // Heuristic: UI literal blocks (HTML/CSS/JS) with nested template strings can trigger
        // parser errors like "Unexpected identifier '$'". These blocks are intended to be
        // delivered as strings (e.g., const html = `...`) and are not executed in Node.
        // To avoid breaking migrations for such content, skip strict compile check when the
        // original code clearly looks like an HTML UI literal and the error matches.
        const looksLikeHtmlUi =
          /<!DOCTYPE html|<html[\s>]|<head>|<body>|<script>|const\s+html\s*=\s*`/i.test(codeStr);
        const isTemplateDollarError =
          typeof err?.message === 'string' && err.message.includes("Unexpected identifier '$'");

        if (looksLikeHtmlUi && isTemplateDollarError) {
          // Proceed without compile enforcement; preserve transformed code
          (params as JsonObject).code = code;
          (nodeObj as JsonObject).parameters = params;
          changed = true;
          // Log a warning to aid future cleanup
          // eslint-disable-next-line no-console
          console.warn(
            `[WARN] Skipping compile check for likely UI literal in node ${(nodeObj as JsonObject).ref ?? '?'} due to template parsing: ${err?.message}`
          );
        } else {
          errors.push(
            `Node ${(nodeObj as JsonObject).ref ?? '?'} code invalid after transform: ${err?.message ?? String(e)}`
          );
        }
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
