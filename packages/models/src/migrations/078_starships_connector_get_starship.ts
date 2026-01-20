type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

/**
 * Migration 078: Add get-starship endpoint to Starships connector
 *
 * Adds a connector_action endpoint for:
 * GET /starships/:idOrSlug (we use starshipId in tools)
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

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const newEndpoint: Endpoint = {
      name: 'get-starship',
      description: 'Get a starship by id (or slug)',
      method: 'GET',
      path: '/starships/{starshipId}',
      parameters: {
        type: 'object',
        required: ['starshipId'],
        properties: {
          starshipId: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: {
        path: {
          starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
        },
      },
      requestStyle: 'query',
      timeoutMs: 5000,
    };

    const existingIndex = endpoints.findIndex((e) => e?.name === newEndpoint.name);
    const nextEndpoints =
      existingIndex >= 0 ? endpoints.map((e, idx) => (idx === existingIndex ? newEndpoint : e)) : [...endpoints, newEndpoint];

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [JSON.stringify(nextEndpoints), row.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
    const nextEndpoints = endpoints.filter((e) => e?.name !== 'get-starship');

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [JSON.stringify(nextEndpoints), row.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

