type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

const ACTION_NAMES = [
  'search-views',
  'get-view',
  'get-view-by-slug',
  'create-view',
  'update-view',
  'delete-view',
  'attach-view-to-channel',
  'attach-widget-to-view',
  'detach-widget-from-view',
] as const;

/**
 * Migration 126: Add Starships connector actions for:
 * - Views CRUD
 * - Attaching a view to a channel
 * - Attaching/detaching widgets to/from a view
 *
 * IMPORTANT:
 * Runtime connector_action execution uses connector_template_actions (row table).
 * We also update connector_templates.endpoints_json for legacy/admin visibility.
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
        name: 'search-views',
        description: 'Search views (server-side filtered list)',
        method: 'GET',
        path: '/starships/{starshipId}/views',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          query: {
            name: '{{ args.name == null ? "" : String(args.name) }}',
            slug: '{{ args.slug == null ? "" : String(args.slug) }}',
            limit: '{{ args.limit == null ? "" : String(args.limit) }}',
            offset: '{{ args.offset == null ? "" : String(args.offset) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'get-view',
        description: 'Get a view by id',
        method: 'GET',
        path: '/views/{viewId}',
        parameters: {
          type: 'object',
          required: ['viewId'],
          properties: {
            viewId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            viewId: '{{ String(args.viewId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'get-view-by-slug',
        description: 'Get a view by slug (requires starshipId query param)',
        method: 'GET',
        path: '/views/slug/{slug}',
        parameters: {
          type: 'object',
          required: ['slug', 'starshipId'],
          properties: {
            slug: { type: 'string' },
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            slug: '{{ String(args.slug ?? "") }}',
          },
          query: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-view',
        description: 'Create a view',
        method: 'POST',
        path: '/views',
        parameters: {
          type: 'object',
          required: ['starshipId', 'name', 'description'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            layout: { type: 'object' },
          },
          additionalProperties: true,
        },
        mapping: {
          body: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            name: '{{ args.name }}',
            slug: '{{ args.slug }}',
            description: '{{ args.description ?? "" }}',
            layout: '{{ args.layout }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'update-view',
        description: 'Update a view by id (partial updates supported)',
        method: 'PUT',
        path: '/views/{viewId}',
        parameters: {
          type: 'object',
          required: ['viewId'],
          properties: {
            viewId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            layout: { type: 'object' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            viewId: '{{ String(args.viewId ?? args.id ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            layout: '{{ args.layout }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'delete-view',
        description: 'Delete a view by id',
        method: 'DELETE',
        path: '/views/{viewId}',
        parameters: {
          type: 'object',
          required: ['viewId'],
          properties: {
            viewId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            viewId: '{{ String(args.viewId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'attach-view-to-channel',
        description: 'Attach (or detach) a view to a channel by setting attachedViewId',
        method: 'PATCH',
        path: '/channels/{channelId}',
        parameters: {
          type: 'object',
          required: ['channelId'],
          properties: {
            channelId: { type: 'string' },
            attachedViewId: { type: ['string', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            channelId: '{{ String(args.channelId ?? "") }}',
          },
          body: {
            attachedViewId: '{{ args.attachedViewId }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'attach-widget-to-view',
        description: 'Attach a widget to a view (adds it to the view layout)',
        method: 'POST',
        path: '/views/{viewId}/widgets',
        parameters: {
          type: 'object',
          required: ['viewId', 'widgetId'],
          properties: {
            viewId: { type: 'string' },
            widgetId: { type: 'string' },
            col: { type: 'number' },
            row: { type: 'number' },
            colSpan: { type: 'number' },
            rowSpan: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            viewId: '{{ String(args.viewId ?? args.id ?? "") }}',
          },
          body: {
            widgetId: '{{ String(args.widgetId ?? "") }}',
            col: '{{ args.col }}',
            row: '{{ args.row }}',
            colSpan: '{{ args.colSpan }}',
            rowSpan: '{{ args.rowSpan }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'detach-widget-from-view',
        description: 'Detach a widget from a view (removes it from the view layout)',
        method: 'DELETE',
        path: '/views/{viewId}/widgets/{widgetId}',
        parameters: {
          type: 'object',
          required: ['viewId', 'widgetId'],
          properties: {
            viewId: { type: 'string' },
            widgetId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            viewId: '{{ String(args.viewId ?? args.id ?? "") }}',
            widgetId: '{{ String(args.widgetId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
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

