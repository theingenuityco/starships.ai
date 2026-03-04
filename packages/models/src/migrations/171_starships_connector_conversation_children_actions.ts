type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

const ACTION_NAMES = ['list-conversation-children'] as const;

/**
 * Migration 171: Add Starships connector action for child conversation listing.
 *
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

    const newEndpoints: Endpoint[] = [
      {
        name: 'list-conversation-children',
        description: 'List child conversations (threads) for a parent conversation',
        method: 'GET',
        path: '/conversations/{conversationId}/children',
        parameters: {
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
        },
        mapping: {
          path: {
            conversationId:
              '{{ String(args.conversationId ?? args.parentConversationId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          query: {
            limit: '{{ args.limit === undefined ? undefined : Number(args.limit) }}',
            beforeUpdatedAt: '{{ args.beforeUpdatedAt ? String(args.beforeUpdatedAt) : undefined }}',
            beforeId: '{{ args.beforeId ? String(args.beforeId) : undefined }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },
    ];

    // ---- Upsert runtime action rows (source of truth: connector_template_actions) ----
    const existingRes = await client.query(
      `SELECT action_name, ordinal FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`,
      [templateId, ACTION_NAMES as unknown as string[]]
    );
    const existingRows = toRows<{ action_name: string; ordinal: number }>(existingRes);
    const existingOrdinalByName = new Map(existingRows.map((r) => [String(r.action_name), Number(r.ordinal)]));

    const maxRes = await client.query(`SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal FROM connector_template_actions WHERE template_id = $1;`, [
      templateId,
    ]);
    const maxRows = toRows<{ max_ordinal: number | string | null }>(maxRes);
    const maxOrdinalRaw = maxRows[0]?.max_ordinal ?? -1;
    const baseMaxOrdinal = typeof maxOrdinalRaw === 'number' ? maxOrdinalRaw : Number(maxOrdinalRaw ?? -1);
    let nextOrdinal = Number.isFinite(baseMaxOrdinal) ? baseMaxOrdinal : -1;

    for (const e of newEndpoints) {
      const name = String(e.name);
      const ordinal =
        existingOrdinalByName.has(name) && Number.isFinite(existingOrdinalByName.get(name) as number)
          ? (existingOrdinalByName.get(name) as number)
          : ++nextOrdinal;

      const id = `${templateId}:${name}`;
      const method = String(e.method || '').trim().toUpperCase();
      const path = String(e.path || '').trim();

      await client.query(
        `
          INSERT INTO connector_template_actions (
            id,
            template_id,
            action_name,
            ordinal,
            method,
            path,
            description,
            base_url_override,
            timeout_ms,
            request_style,
            parameters_json,
            mapping_json,
            response_json,
            created_at,
            updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
          ON CONFLICT (id) DO UPDATE SET
            ordinal = EXCLUDED.ordinal,
            method = EXCLUDED.method,
            path = EXCLUDED.path,
            description = EXCLUDED.description,
            base_url_override = EXCLUDED.base_url_override,
            timeout_ms = EXCLUDED.timeout_ms,
            request_style = EXCLUDED.request_style,
            parameters_json = EXCLUDED.parameters_json,
            mapping_json = EXCLUDED.mapping_json,
            response_json = EXCLUDED.response_json,
            updated_at = NOW()
        `,
        [
          id,
          templateId,
          name,
          ordinal,
          method,
          path,
          (e.description ?? null) as string | null,
          (e.baseUrlOverride ?? null) as string | null,
          (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
          (e.requestStyle ?? null) as string | null,
          (e.parameters ?? null) as unknown | null,
          (e.mapping ?? null) as unknown | null,
          (e.response ?? null) as unknown | null,
        ]
      );
    }

    // ---- Keep legacy endpoints_json in sync (best-effort) ----
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    for (const e of newEndpoints) byName.set(e.name, e);

    const nextLegacy: Endpoint[] = legacyEndpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    for (const name of ACTION_NAMES) {
      if (!nextLegacy.some((e) => e?.name === name)) {
        const e = newEndpoints.find((x) => x.name === name);
        if (e) nextLegacy.push(e);
      }
    }

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

    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      ACTION_NAMES as unknown as string[],
    ]);

    const legacyEndpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
    const nameSet = new Set<string>(ACTION_NAMES as unknown as string[]);
    const nextLegacy = legacyEndpoints.filter((e) => {
      const name = typeof e?.name === 'string' ? e.name : '';
      return !nameSet.has(name);
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

