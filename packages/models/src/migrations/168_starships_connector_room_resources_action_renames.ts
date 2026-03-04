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
 * Migration 168: Add clearer Starships connector action names for room resources endpoints.
 *
 * We keep the legacy action names as aliases to avoid breaking existing blueprints.
 *
 * - `get-room-resources`        → GET /rooms/:roomId/resources
 * - `get-room-pins-views`      → GET /rooms/:roomId/pins/views
 * - `get-room-pins-datasets`   → GET /rooms/:roomId/pins/datasets
 * - `get-room-pins-task-boards`→ GET /rooms/:roomId/pins/task-boards
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

    const ACTION_NAMES = ['get-room-resources', 'get-room-pins-views', 'get-room-pins-datasets', 'get-room-pins-task-boards'] as const;

    const newEndpoints: Endpoint[] = [
      {
        name: 'get-room-resources',
        description: 'Get resolved room resources in one response (pinned views/datasets/task boards + assigned tools)',
        method: 'GET',
        path: '/rooms/{roomId}/resources',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string', description: 'Room id (backing conversation id; defaults to runtimeEnv.CONVERSATION_ID)' },
            q: { type: 'string', description: 'Optional case-insensitive search across name/slug/description' },
            kinds: {
              description: 'Optional kind filter (comma-separated or array). Allowed: views, datasets, taskBoards, tools',
              anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
            },
            includeArchived: { type: 'boolean', description: 'When true, includes archived datasets/task boards (default false)' },
            limitPerKind: { type: 'number', description: 'Optional cap per kind (0-200) applied after filtering' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          query: {
            q: '{{ String(args.q ?? "") }}',
            kinds:
              '{{ args.kinds == null ? "" : (Array.isArray(args.kinds) ? args.kinds.map((x) => String(x)).join(",") : String(args.kinds)) }}',
            includeArchived: '{{ args.includeArchived == null ? "" : String(args.includeArchived) }}',
            limitPerKind: '{{ args.limitPerKind == null ? "" : String(args.limitPerKind) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 30000,
      },
      {
        name: 'get-room-pins-views',
        description: 'Get pinned views (resolved to view objects) for a room',
        method: 'GET',
        path: '/rooms/{roomId}/pins/views',
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
        name: 'get-room-pins-datasets',
        description: 'Get pinned datasets (resolved to dataset objects) for a room',
        method: 'GET',
        path: '/rooms/{roomId}/pins/datasets',
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
        name: 'get-room-pins-task-boards',
        description: 'Get pinned task boards (resolved to task board objects) for a room',
        method: 'GET',
        path: '/rooms/{roomId}/pins/task-boards',
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
    ];

    // Prefer ordinal continuity by aligning with prior names when present.
    const ordinalFallbackRes = await client.query(
      `SELECT action_name, ordinal
         FROM connector_template_actions
        WHERE template_id = $1
          AND action_name IN ('get-room-pinned-resources','get-room-pinned-views','get-room-pinned-datasets','get-room-pinned-task-boards');`,
      [templateId]
    );
    const ordinalFallbackRows = toRows<{ action_name: string; ordinal: number }>(ordinalFallbackRes);
    const ordinalByLegacyName = new Map(ordinalFallbackRows.map((r) => [String(r.action_name), Number(r.ordinal)]));

    const legacyNameForNew = new Map<string, string>([
      ['get-room-resources', 'get-room-pinned-resources'],
      ['get-room-pins-views', 'get-room-pinned-views'],
      ['get-room-pins-datasets', 'get-room-pinned-datasets'],
      ['get-room-pins-task-boards', 'get-room-pinned-task-boards'],
    ]);

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
      const legacyName = legacyNameForNew.get(name) ?? '';
      const legacyOrdinal = legacyName ? ordinalByLegacyName.get(legacyName) : undefined;

      const ordinal =
        existingOrdinalByName.has(name) && Number.isFinite(existingOrdinalByName.get(name) as number)
          ? (existingOrdinalByName.get(name) as number)
          : typeof legacyOrdinal === 'number' && Number.isFinite(legacyOrdinal)
            ? legacyOrdinal
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
    const nextLegacy = Array.from(byName.values()).filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

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
  // Non-destructive rollback: remove the alias action rows only.
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

    const REMOVE = ['get-room-resources', 'get-room-pins-views', 'get-room-pins-datasets', 'get-room-pins-task-boards'] as const;

    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      [...REMOVE] as unknown as string[],
    ]);

    const removeSet = new Set<string>(REMOVE as unknown as string[]);
    const nextLegacy = legacyEndpoints.filter((e) => !removeSet.has(String(e?.name || '')));
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

