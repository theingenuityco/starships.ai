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
 * Migration 069: Add deploy-agents-from-marketplace endpoint to Starships connector
 *
 * Adds an internal connector action for:
 * POST /agent-templates/:templateId/agents
 * which deploys (creates) a new agent on a starship from a marketplace template.
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
      name: 'deploy-agents-from-marketplace',
      description: 'Create an agent on a starship from a marketplace template',
      method: 'POST',
      path: '/agent-templates/{templateId}/agents',
      parameters: {
        type: 'object',
        required: ['templateId'],
        properties: {
          templateId: { type: 'string' },
          starshipId: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: {
        path: {
          templateId: '{{ String(args.templateId ?? "") }}',
        },
        body: {
          // Route requires starshipId; default to current starship if caller omits it.
          starshipId: '{{ String(args.starshipId || runtimeEnv.STARSHIP_ID || "") }}',
        },
      },
      requestStyle: 'json',
      timeoutMs: 15000,
    };

    const existingIndex = endpoints.findIndex((e) => e?.name === newEndpoint.name);
    const nextEndpoints =
      existingIndex >= 0
        ? endpoints.map((e, idx) => (idx === existingIndex ? newEndpoint : e))
        : [...endpoints, newEndpoint];

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
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
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
    const nextEndpoints = endpoints.filter((e) => e?.name !== 'deploy-agents-from-marketplace');

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

