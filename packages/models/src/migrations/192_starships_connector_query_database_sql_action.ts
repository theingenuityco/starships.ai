type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 192: add the `query-database-sql` action to the Starships connector.
 *
 * Lets agents run read-only SQL over their starship's Database (its schema of
 * Tables) via POST /starships/{starshipId}/database/sql. Isolation is enforced
 * server-side (per-starship SET ROLE + READ ONLY transaction).
 */
const ACTION = {
  actionName: 'query-database-sql',
  ordinal: 200,
  kind: 'http',
  method: 'POST',
  path: '/starships/{starshipId}/database/sql',
  description:
    'Run a read-only SQL query over this starship\'s Database (a schema of Tables). Reference Tables by their physical_table name (see list-datasets). SELECT only.',
  baseUrlOverride: null as string | null,
  timeoutMs: 15000,
  requestStyle: 'json',
  parametersJson: {
    type: 'object',
    required: ['sql'],
    properties: {
      starshipId: { type: 'string', description: 'Starship ID (optional; defaults to runtime STARSHIP_ID)' },
      sql: { type: 'string', description: 'A single read-only SQL SELECT statement' },
      params: { type: 'array', description: 'Optional positional query parameters ($1, $2, ...)' },
    },
    additionalProperties: false,
  },
  mappingJson: {
    path: { starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}' },
    body: { sql: '{{ args.sql }}', params: '{{ args.params ?? [] }}' },
  },
  responseJson: null as unknown,
  driver: null as string | null,
  sqlText: null as string | null,
  sqlMode: null as string | null,
  rowLimit: null as number | null,
  readOnly: true,
};

export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1`);
    const rows = toRows<{ id: string }>(res);
    if (!rows.length) {
      console.log('[MIGRATION-192] Starships connector template not found — skipping');
      await client.query('COMMIT');
      return;
    }
    const templateId = String(rows[0].id);
    const id = `${templateId}:${ACTION.actionName}`;

    await client.query(
      `INSERT INTO connector_template_actions (
        id, template_id, action_name, ordinal, kind, method, path,
        description, base_url_override, timeout_ms, request_style,
        driver, sql_text, sql_mode, row_limit, read_only,
        parameters_json, mapping_json, response_json,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::jsonb,$19,NOW(),NOW())
      ON CONFLICT (id) DO UPDATE SET
        ordinal = EXCLUDED.ordinal,
        kind = EXCLUDED.kind,
        method = EXCLUDED.method,
        path = EXCLUDED.path,
        description = EXCLUDED.description,
        timeout_ms = EXCLUDED.timeout_ms,
        request_style = EXCLUDED.request_style,
        read_only = EXCLUDED.read_only,
        parameters_json = EXCLUDED.parameters_json,
        mapping_json = EXCLUDED.mapping_json,
        updated_at = NOW()`,
      [
        id,
        templateId,
        ACTION.actionName,
        ACTION.ordinal,
        ACTION.kind,
        ACTION.method,
        ACTION.path,
        ACTION.description,
        ACTION.baseUrlOverride,
        ACTION.timeoutMs,
        ACTION.requestStyle,
        ACTION.driver,
        ACTION.sqlText,
        ACTION.sqlMode,
        ACTION.rowLimit,
        ACTION.readOnly,
        JSON.stringify(ACTION.parametersJson),
        JSON.stringify(ACTION.mappingJson),
        ACTION.responseJson !== null ? JSON.stringify(ACTION.responseJson) : null,
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1`);
    const rows = toRows<{ id: string }>(res);
    if (rows.length) {
      await client.query(`DELETE FROM connector_template_actions WHERE id = $1`, [`${String(rows[0].id)}:query-database-sql`]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
