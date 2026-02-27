type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

type ActionEndpoint = Endpoint & {
  description?: string;
  method?: string;
  path?: string;
  timeoutMs?: number;
  requestStyle?: string;
  parameters?: unknown;
  mapping?: unknown;
};

/**
 * Migration 150: Remove `slug` from dataset create connector action.
 *
 * Dataset slugs are server-generated and unique per starship.
 * The Starships connector action `create-dataset` should not accept or forward a slug.
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

    const updated: ActionEndpoint = {
      name: 'create-dataset',
      description: 'Create a dataset for a starship',
      method: 'POST',
      path: '/starships/{starshipId}/datasets',
      parameters: {
        type: 'object',
        required: ['starshipId', 'name', 'columns'],
        properties: {
          starshipId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          columns: { type: 'array' },
          primaryKey: { type: ['string', 'null'] },
        },
        additionalProperties: true,
      },
      mapping: {
        path: {
          starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
        },
        body: {
          name: '{{ args.name }}',
          description: '{{ args.description }}',
          columns: '{{ args.columns ?? [] }}',
          primaryKey: '{{ args.primaryKey }}',
        },
      },
      requestStyle: 'json',
      timeoutMs: 10000,
    };

    // Update runtime action row (by action_name).
    await client.query(
      `
        UPDATE connector_template_actions
           SET method = $1,
               path = $2,
               description = $3,
               timeout_ms = $4,
               request_style = $5,
               parameters_json = $6,
               mapping_json = $7,
               updated_at = NOW()
         WHERE template_id = $8
           AND action_name = $9;
      `,
      [
        String(updated.method || '').trim().toUpperCase(),
        String(updated.path || '').trim(),
        (updated.description ?? null) as string | null,
        (typeof updated.timeoutMs === 'number' ? Math.floor(updated.timeoutMs) : null) as number | null,
        updated.requestStyle ?? null,
        updated.parameters ?? null,
        updated.mapping ?? null,
        templateId,
        'create-dataset',
      ]
    );

    // Keep legacy endpoints_json best-effort in sync.
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    byName.set(updated.name, updated);

    const nextLegacy: Endpoint[] = legacyEndpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    if (!nextLegacy.some((e) => e?.name === updated.name)) nextLegacy.push(updated);

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
  // Best-effort: re-add slug to create-dataset parameters + mapping (as it existed previously).
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }
    const templateId = String(rows[0].id);

    await client.query(
      `
        UPDATE connector_template_actions
           SET updated_at = NOW()
         WHERE template_id = $1
           AND action_name = $2;
      `,
      [templateId, 'create-dataset']
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

