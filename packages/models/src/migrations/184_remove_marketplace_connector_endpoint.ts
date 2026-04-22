type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 184: Remove list-agents-from-marketplace endpoint from Starships connector
 *
 * Migration 068 added this endpoint pointing at GET /agent-templates.
 * That server route was removed when the template system was dropped (migration 183).
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      console.log('[MIGRATION-184] Starships connector template not found — skipping');
      await client.query('COMMIT');
      return;
    }

    const { id, endpoints_json } = rows[0];
    const currentEndpoints: Array<Record<string, unknown>> = Array.isArray(endpoints_json)
      ? (endpoints_json as Array<Record<string, unknown>>)
      : [];

    const updatedEndpoints = currentEndpoints.filter((e) => e?.name !== 'list-agents-from-marketplace');

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(updatedEndpoints),
      id,
    ]);

    console.log('[MIGRATION-184] Removed list-agents-from-marketplace endpoint from starships connector');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION-184] Error:', error);
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  // Re-add the endpoint (mirrors migration 068 up())
  await client.query('BEGIN');
  try {
    const endpoint = {
      name: 'list-agents-from-marketplace',
      description: 'List all agent templates from the marketplace',
      method: 'GET',
      path: '/agent-templates',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          query: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: { query: { page: '{{ args.page ?? 1 }}', limit: '{{ args.limit ?? 50 }}', query: '{{ args.query }}' } },
      requestStyle: 'query',
      timeoutMs: 5000,
    };

    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const { id, endpoints_json } = rows[0];
    const currentEndpoints: Array<Record<string, unknown>> = Array.isArray(endpoints_json)
      ? (endpoints_json as Array<Record<string, unknown>>)
      : [];

    const updatedEndpoints = [...currentEndpoints, endpoint];
    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(updatedEndpoints),
      id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
