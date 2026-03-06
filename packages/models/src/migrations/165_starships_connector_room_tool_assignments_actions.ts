type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

type ConnRow = { id: string; endpoints_json: unknown };

const REMOVE_ACTIONS = [
  'pin-room-tool',
  'unpin-room-tool',
  'reorder-room-pins-tools',
  'get-room-pinned-tools',
  // Combined endpoint renamed
  'get-room-pins-resources',
] as const;

const UPSERT_ACTIONS = ['get-room-tools', 'assign-room-tool', 'unassign-room-tool'] as const;

/**
 * Migration 165: Rename room tool pins → room tool assignments (connector actions)
 *
 * Breaking change:
 * - remove pin/unpin/reorder tool actions
 * - add assignment actions
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<ConnRow>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const templateId = String(rows[0].id);
    const legacyEndpoints: Endpoint[] = Array.isArray(rows[0].endpoints_json) ? (rows[0].endpoints_json as Endpoint[]) : [];

    // Remove old actions (id format is `${templateId}:${name}`)
    await client.query(
      `DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`,
      [templateId, [...REMOVE_ACTIONS] as unknown as string[]]
    );

    // Compute ordinals
    const existingRes = await client.query(
      `SELECT action_name, ordinal FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`,
      [templateId, UPSERT_ACTIONS as unknown as string[]]
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

    const newEndpoints: Endpoint[] = [
      {
        name: 'get-room-tools',
        description: 'List assigned tools for a room (resolved to tool objects)',
        method: 'GET',
        path: '/rooms/{roomId}/tools',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', description: 'Room id (backing conversation id; defaults to runtimeEnv.CONVERSATION_ID)' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },
      {
        name: 'assign-room-tool',
        description: 'Assign a tool to a room',
        method: 'POST',
        path: '/rooms/{roomId}/tools',
        parameters: {
          type: 'object',
          required: ['roomId', 'toolId'],
          properties: {
            roomId: { type: 'string' },
            toolId: { type: 'string' },
            permission: { type: 'string', enum: ['allow', 'ask', 'deny'] },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            toolId: '{{ String(args.toolId ?? "") }}',
            permission: '{{ args.permission }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unassign-room-tool',
        description: 'Unassign a tool from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/tools/{toolId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'toolId'],
          properties: {
            roomId: { type: 'string' },
            toolId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            toolId: '{{ String(args.toolId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },
    ];

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
    const keep: Endpoint[] = [];
    for (const e of legacyEndpoints) {
      const name = typeof e.name === 'string' ? e.name.trim() : '';
      if (!name) continue;
      if ((REMOVE_ACTIONS as readonly string[]).includes(name)) continue;
      keep.push(e);
    }
    const byName = new Map<string, Endpoint>(keep.map((e) => [String(e.name), e]));
    for (const e of newEndpoints) byName.set(String(e.name), e);
    const nextLegacy = Array.from(byName.values());

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
    const res = await client.query(`SELECT id FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }
    const templateId = String(rows[0].id);

    await client.query(
      `DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`,
      [templateId, UPSERT_ACTIONS as unknown as string[]]
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

