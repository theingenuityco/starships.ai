type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type ActionRow = { id: string; action_name: string; parameters_json: unknown; mapping_json: unknown };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Migration 149: Update Starships connector task card actions to use column names instead of ids.
 *
 * - create-task-card: require `columnName` (unique per board)
 * - move-task-card: require `toColumnName`
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const tplRes = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const tplRows = toRows<{ id: string }>(tplRes);
    if (!tplRows.length) {
      await client.query('COMMIT');
      return;
    }
    const templateId = String(tplRows[0].id);

    const actionsRes = await client.query(
      `SELECT id, action_name, parameters_json, mapping_json
         FROM connector_template_actions
        WHERE template_id = $1
          AND action_name = ANY($2::text[])`,
      [templateId, ['create-task-card', 'move-task-card']]
    );
    const actions = toRows<ActionRow>(actionsRes);

    for (const a of actions) {
      const name = String(a.action_name);
      const params = isRecord(a.parameters_json) ? a.parameters_json : null;
      const mapping = isRecord(a.mapping_json) ? a.mapping_json : null;

      if (name === 'create-task-card' && params && mapping && isRecord(mapping.body)) {
        const required = Array.isArray(params.required) ? (params.required as unknown[]).map(String) : [];
        const nextRequired = Array.from(new Set(required.filter((r) => r !== 'columnId').concat(['columnName'])));

        const props = isRecord(params.properties) ? (params.properties as Record<string, unknown>) : {};
        params.required = nextRequired;
        params.properties = {
          ...props,
          columnName: { type: 'string', description: 'Task column title/name (unique per board)' },
        };

        mapping.body = {
          ...(mapping.body as Record<string, unknown>),
          columnName: '{{ args.columnName }}',
        };

        await client.query(
          `UPDATE connector_template_actions
              SET parameters_json = $1,
                  mapping_json = $2,
                  updated_at = NOW()
            WHERE id = $3`,
          [params, mapping, a.id]
        );
      }

      if (name === 'move-task-card' && params && mapping && isRecord(mapping.body)) {
        const required = Array.isArray(params.required) ? (params.required as unknown[]).map(String) : [];
        const nextRequired = Array.from(new Set(required.filter((r) => r !== 'toColumnId').concat(['toColumnName'])));

        const props = isRecord(params.properties) ? (params.properties as Record<string, unknown>) : {};
        params.required = nextRequired;
        params.properties = {
          ...props,
          toColumnName: { type: 'string', description: 'Destination column title/name (unique per board)' },
        };

        mapping.body = {
          ...(mapping.body as Record<string, unknown>),
          toColumnName: '{{ args.toColumnName }}',
        };

        await client.query(
          `UPDATE connector_template_actions
              SET parameters_json = $1,
                  mapping_json = $2,
                  updated_at = NOW()
            WHERE id = $3`,
          [params, mapping, a.id]
        );
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Best-effort no-op down.
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

