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
 * Migration 098: Add get-conversation-messages endpoint to Starships connector
 *
 * Adds a connector_action endpoint for:
 * GET /conversations/:conversationId/messages
 *
 * Supports:
 * - Keyset cursor pagination via beforeCreatedAt+beforeId
 * - Tail-offset pagination via offset (skip N newest messages)
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
      name: 'get-conversation-messages',
      description: 'Get conversation messages (supports tail-offset and keyset cursor pagination)',
      method: 'GET',
      path: '/conversations/{conversationId}/messages',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: 'Conversation id (defaults to runtimeEnv.CONVERSATION_ID)' },
          limit: { type: 'number', description: 'Maximum messages to return (1-200)' },
          offset: { type: 'number', description: 'Tail offset (skip N most recent messages)' },
          beforeCreatedAt: { type: 'string', description: 'Keyset cursor timestamp (must be provided with beforeId)' },
          beforeId: { type: 'string', description: 'Keyset cursor id (must be provided with beforeCreatedAt)' },
          orderDirection: { type: 'string', description: 'Optional orderDirection: asc or desc' },
        },
        additionalProperties: false,
      },
      mapping: {
        path: {
          conversationId: '{{ String(args.conversationId ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
        },
        query: {
          limit: '{{ Number(args.limit ?? 50) }}',
          offset: '{{ Number(args.offset ?? 0) }}',
          beforeCreatedAt: '{{ args.beforeCreatedAt }}',
          beforeId: '{{ args.beforeId }}',
          orderDirection: '{{ args.orderDirection }}',
        },
      },
      requestStyle: 'query',
      timeoutMs: 10000,
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
    const nextEndpoints = endpoints.filter((e) => e?.name !== 'get-conversation-messages');

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [JSON.stringify(nextEndpoints), row.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

