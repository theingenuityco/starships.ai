type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Migration 147: Add unified assignee ref support to task card connector actions.
 *
 * Adds `assignee: { type: "user"|"agent", slug: string } | null` to:
 * - create-task-card
 * - update-task-card
 *
 * Notes:
 * - For users, slug should be `u:<userId>` (mirrors message mention tokens like `<@u:USER_ID>`).
 * - For agents, slug is the agent slug.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const templateId = String(rows[0].id);
    const legacyEndpoints: Endpoint[] = Array.isArray(rows[0].endpoints_json) ? (rows[0].endpoints_json as Endpoint[]) : [];

    const updateAction = async (actionName: string, patch: { parameters?: unknown; mappingBodyAssignee?: boolean }) => {
      const existingRes = await client.query(
        `SELECT parameters_json, mapping_json FROM connector_template_actions WHERE template_id = $1 AND action_name = $2 LIMIT 1;`,
        [templateId, actionName]
      );
      const existingRows = toRows<{ parameters_json: unknown; mapping_json: unknown }>(existingRes);
      if (!existingRows.length) return;

      const row = existingRows[0];
      const currentParams = isRecord(row.parameters_json) ? row.parameters_json : null;
      const nextParams =
        patch.parameters ??
        (currentParams
          ? {
              ...(currentParams as Record<string, unknown>),
              properties: {
                ...(isRecord(currentParams.properties) ? currentParams.properties : {}),
                assignee: {
                  description: 'Unified assignee reference: { type: "user"|"agent", slug } (users use u:<userId>)',
                  anyOf: [{ type: 'object' }, { type: 'null' }],
                },
              },
            }
          : currentParams);

      const mapping = isRecord(row.mapping_json) ? row.mapping_json : null;
      const mappingBody = mapping && isRecord(mapping.body) ? (mapping.body as Record<string, unknown>) : null;
      const nextMapping =
        patch.mappingBodyAssignee && mapping && mappingBody
          ? {
              ...(mapping as Record<string, unknown>),
              body: {
                ...(mappingBody as Record<string, unknown>),
                assignee: '{{ args.assignee }}',
              },
            }
          : mapping;

      await client.query(
        `
          UPDATE connector_template_actions
             SET parameters_json = $1,
                 mapping_json = $2,
                 updated_at = NOW()
           WHERE template_id = $3
             AND action_name = $4;
        `,
        [nextParams, nextMapping, templateId, actionName]
      );
    };

    await updateAction('create-task-card', { mappingBodyAssignee: true });
    await updateAction('update-task-card', { mappingBodyAssignee: true });

    // Best-effort: keep legacy endpoints_json in sync for these actions.
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    for (const name of ['create-task-card', 'update-task-card'] as const) {
      const e = byName.get(name);
      if (!e) continue;
      const params = isRecord(e.parameters) ? e.parameters : null;
      if (params) {
        const props = isRecord(params.properties) ? (params.properties as Record<string, unknown>) : {};
        params.properties = {
          ...props,
          assignee: { anyOf: [{ type: 'object' }, { type: 'null' }] },
        };
      }
      const epMapping = isRecord(e.mapping) ? e.mapping : null;
      if (epMapping && isRecord(epMapping.body)) {
        epMapping.body = { ...(epMapping.body as Record<string, unknown>), assignee: '{{ args.assignee }}' };
      }
      byName.set(name, e);
    }
    const nextLegacy = legacyEndpoints.map((e) => byName.get(String(e?.name || '')) ?? e);

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb, updated_at = NOW() WHERE id = $2;`, [
      JSON.stringify(nextLegacy),
      templateId,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // No-op down: this migration only expands parameters/mapping for convenience.
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

