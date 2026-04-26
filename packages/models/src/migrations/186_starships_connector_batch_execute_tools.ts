type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 186: Add batch-execute-tools endpoint to Starships connector
 *
 * Adds POST /conversations/{conversationId}/tool-calls/batch-execute so that the
 * agent's default blueprint can dispatch all pending tool calls in a single request
 * (executed in parallel server-side) instead of one request per tool call.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      console.log('[MIGRATION-186] Starships connector template not found — skipping');
      await client.query('COMMIT');
      return;
    }

    const { id, endpoints_json } = rows[0];
    const currentEndpoints: Array<Record<string, unknown>> = Array.isArray(endpoints_json)
      ? (endpoints_json as Array<Record<string, unknown>>)
      : [];

    // Idempotent: skip if already present.
    if (currentEndpoints.some((e) => e?.name === 'batch-execute-tools')) {
      console.log('[MIGRATION-186] batch-execute-tools endpoint already present — skipping');
      await client.query('COMMIT');
      return;
    }

    const endpoint = {
      name: 'batch-execute-tools',
      description: 'Execute multiple tool calls in parallel via the Starships batch endpoint',
      method: 'POST',
      path: '/conversations/{conversationId}/tool-calls/batch-execute',
      parameters: {
        type: 'object',
        required: ['agentId', 'tools'],
        properties: {
          agentId: { type: 'string' },
          tools: {
            type: 'array',
            items: {
              type: 'object',
              required: ['toolSlug', 'toolCallId'],
              properties: {
                toolSlug: { type: 'string' },
                toolCallId: { type: 'string' },
                args: { type: 'object' },
              },
            },
          },
        },
        additionalProperties: false,
      },
      mapping: {
        path: {
          conversationId: '{{ String(runtimeEnv.CONVERSATION_ID ?? args.conversationId ?? "") }}',
        },
        body: {
          agentId: '{{ String(args.agentId ?? "") }}',
          tools: '{{ args.tools ?? [] }}',
        },
      },
      requestStyle: 'json',
      // 60 minutes: each tool in the batch can take up to 30 min; allow headroom for the slowest.
      timeoutMs: 60 * 60 * 1000,
    };

    const updatedEndpoints = [...currentEndpoints, endpoint];
    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(updatedEndpoints),
      id,
    ]);

    console.log('[MIGRATION-186] Added batch-execute-tools endpoint to starships connector');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION-186] Error:', error);
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

    const { id, endpoints_json } = rows[0];
    const currentEndpoints: Array<Record<string, unknown>> = Array.isArray(endpoints_json)
      ? (endpoints_json as Array<Record<string, unknown>>)
      : [];

    const updatedEndpoints = currentEndpoints.filter((e) => e?.name !== 'batch-execute-tools');
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
