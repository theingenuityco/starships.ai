type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 193: rename the Starships connector's "datasets" actions to "tables".
 *
 * The datasets feature became the per-starship Database of Tables. The HTTP routes
 * moved from `/starships/:id/datasets...` to `/starships/:id/tables...` and the
 * room-pin routes from `/rooms/:id/pins/datasets...` to `/pins/tables...`, so the
 * persisted connector actions (action_name, path, and the JSONB request/response
 * config) must be renamed to match or agents would hit dead endpoints.
 *
 * Strategy: for every action on the shared `starships` connector template whose
 * config still mentions "dataset", apply the same ordered token rewrite used for
 * the bundle/source rename. Longest tokens first so compound action names and
 * param keys are rewritten before the bare words. Idempotent: once an action has
 * no "dataset" text left it is skipped on re-run.
 */

// [from, to] applied in order (longest / most-specific first).
const TOKEN_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['reorder-room-pins-datasets', 'reorder-room-pins-tables'],
  ['get-room-pins-datasets', 'get-room-pins-tables'],
  ['unpin-room-dataset', 'unpin-room-table'],
  ['list-dataset-rows', 'list-table-rows'],
  ['upsert-dataset-rows', 'upsert-table-rows'],
  ['pin-room-dataset', 'pin-room-table'],
  ['create-dataset', 'create-table'],
  ['update-dataset', 'update-table'],
  ['list-datasets', 'list-tables'],
  ['get-dataset', 'get-table'],
  ['datasetIdOrSlug', 'tableIdOrSlug'],
  ['datasetSlug', 'tableSlug'],
  ['datasetIds', 'tableIds'],
  ['datasetId', 'tableId'],
  ['dataset_row', 'table_row'],
  ['/datasets', '/tables'],
  ['datasets', 'tables'],
  ['dataset', 'table'],
  ['Datasets', 'Tables'],
  ['Dataset', 'Table'],
];

function applyRename(input: string): string {
  let out = input;
  for (const [from, to] of TOKEN_REPLACEMENTS) out = out.split(from).join(to);
  return out;
}

function renameJsonText(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  // JSONB columns come back as parsed JS objects; round-trip through text so the
  // rename also covers property keys (e.g. "datasetIdOrSlug") and string values.
  return JSON.parse(applyRename(JSON.stringify(value)));
}

type ActionRow = {
  id: string;
  action_name: string;
  path: string;
  description: string | null;
  parameters_json: unknown;
  mapping_json: unknown;
  response_json: unknown;
};

export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const tplRes = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1`);
    const tplRows = toRows<{ id: string }>(tplRes);
    if (!tplRows.length) {
      console.log('[MIGRATION-193] Starships connector template not found — skipping');
      await client.query('COMMIT');
      return;
    }
    const templateId = String(tplRows[0].id);

    const res = await client.query(
      `SELECT id, action_name, path, description, parameters_json, mapping_json, response_json
         FROM connector_template_actions
        WHERE template_id = $1`,
      [templateId]
    );
    const rows = toRows<ActionRow>(res);

    let renamed = 0;
    for (const row of rows) {
      const blob = [
        row.action_name,
        row.path,
        row.description ?? '',
        JSON.stringify(row.parameters_json ?? null),
        JSON.stringify(row.mapping_json ?? null),
        JSON.stringify(row.response_json ?? null),
      ].join('\n');
      // Only touch actions that still reference the old "dataset" naming.
      if (!/dataset/i.test(blob)) continue;

      const newActionName = applyRename(row.action_name);
      // Keep the `${templateId}:${actionName}` id convention in sync.
      const newId = row.id === `${templateId}:${row.action_name}` ? `${templateId}:${newActionName}` : applyRename(row.id);
      const newPath = applyRename(row.path);
      const newDescription = row.description === null ? null : applyRename(row.description);
      const newParameters = renameJsonText(row.parameters_json);
      const newMapping = renameJsonText(row.mapping_json);
      const newResponse = renameJsonText(row.response_json);

      await client.query(
        `UPDATE connector_template_actions
            SET id = $1,
                action_name = $2,
                path = $3,
                description = $4,
                parameters_json = $5::jsonb,
                mapping_json = $6::jsonb,
                response_json = $7::jsonb,
                updated_at = NOW()
          WHERE id = $8`,
        [
          newId,
          newActionName,
          newPath,
          newDescription,
          newParameters === null || newParameters === undefined ? null : JSON.stringify(newParameters),
          newMapping === null || newMapping === undefined ? null : JSON.stringify(newMapping),
          newResponse === null || newResponse === undefined ? null : JSON.stringify(newResponse),
          row.id,
        ]
      );
      renamed += 1;
    }

    console.log(`[MIGRATION-193] Renamed ${renamed} Starships connector dataset action(s) to tables`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(_client: DbClient): Promise<void> {
  // No-op: a blanket "table" -> "dataset" reverse would corrupt legitimate uses of
  // the word "table" (physical table names, prose), so this rename is not reversed.
  console.log('[MIGRATION-193] down is a no-op (rename is not safely reversible)');
}
