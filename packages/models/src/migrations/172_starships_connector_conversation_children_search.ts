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
 * Migration 172: Add optional `q` search to Starships connector action for listing child conversations.
 *
 * Server now supports DB-level filtering via query param `q` on:
 * GET /conversations/:conversationId/children
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
    const templateId = String(row.id);
    const legacyEndpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const actionName = 'list-conversation-children';

    const parametersSchema = {
      type: 'object',
      required: ['conversationId'],
      properties: {
        conversationId: { type: 'string', description: 'Parent conversation id (defaults to runtimeEnv.CONVERSATION_ID)' },
        q: { type: 'string', description: 'Optional case-insensitive search on child conversation title' },
        limit: { type: 'number', description: 'Page size (optional)' },
        beforeUpdatedAt: {
          type: 'string',
          description: 'Cursor (ISO datetime). Must be provided together with beforeId.',
        },
        beforeId: { type: 'string', description: 'Cursor (conversation id). Must be provided together with beforeUpdatedAt.' },
      },
      additionalProperties: false,
    } as const;

    const mapping = {
      path: {
        conversationId: '{{ String(args.conversationId ?? args.parentConversationId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
      },
      query: {
        q: '{{ args.q ? String(args.q) : undefined }}',
        limit: '{{ args.limit === undefined ? undefined : Number(args.limit) }}',
        beforeUpdatedAt: '{{ args.beforeUpdatedAt ? String(args.beforeUpdatedAt) : undefined }}',
        beforeId: '{{ args.beforeId ? String(args.beforeId) : undefined }}',
      },
    } as const;

    // Update runtime action row (source of truth)
    await client.query(
      `UPDATE connector_template_actions
          SET parameters_json = $1,
              mapping_json = $2,
              updated_at = NOW()
        WHERE template_id = $3
          AND action_name = $4;`,
      [parametersSchema, mapping, templateId, actionName]
    );

    // Update legacy/admin-visible endpoints_json (best-effort)
    const nextLegacy = legacyEndpoints.map((e) => {
      if (String(e?.name || '') !== actionName) return e;
      return { ...(e as Endpoint), parameters: parametersSchema, mapping };
    });

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
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const templateId = String(row.id);
    const legacyEndpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const actionName = 'list-conversation-children';

    // Best-effort revert: drop `q` from parameters/mapping metadata.
    const parametersSchema = {
      type: 'object',
      required: ['conversationId'],
      properties: {
        conversationId: { type: 'string', description: 'Parent conversation id (defaults to runtimeEnv.CONVERSATION_ID)' },
        limit: { type: 'number', description: 'Page size (optional)' },
        beforeUpdatedAt: {
          type: 'string',
          description: 'Cursor (ISO datetime). Must be provided together with beforeId.',
        },
        beforeId: { type: 'string', description: 'Cursor (conversation id). Must be provided together with beforeUpdatedAt.' },
      },
      additionalProperties: false,
    } as const;

    const mapping = {
      path: {
        conversationId: '{{ String(args.conversationId ?? args.parentConversationId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
      },
      query: {
        limit: '{{ args.limit === undefined ? undefined : Number(args.limit) }}',
        beforeUpdatedAt: '{{ args.beforeUpdatedAt ? String(args.beforeUpdatedAt) : undefined }}',
        beforeId: '{{ args.beforeId ? String(args.beforeId) : undefined }}',
      },
    } as const;

    await client.query(
      `UPDATE connector_template_actions
          SET parameters_json = $1,
              mapping_json = $2,
              updated_at = NOW()
        WHERE template_id = $3
          AND action_name = $4;`,
      [parametersSchema, mapping, templateId, actionName]
    );

    const nextLegacy = legacyEndpoints.map((e) => {
      if (String(e?.name || '') !== actionName) return e;
      return { ...(e as Endpoint), parameters: parametersSchema, mapping };
    });

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

