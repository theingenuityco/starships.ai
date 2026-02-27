type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

type ActionEndpoint = Endpoint & {
  description?: string;
  method?: string;
  path?: string;
  timeoutMs?: number;
  requestStyle?: string;
  parameters?: unknown;
  mapping?: unknown;
};

const ACTION_NAMES = ['get-dataset', 'list-dataset-rows', 'upsert-dataset-rows'] as const;

/**
 * Migration 152: Update Starships connector dataset actions to accept dataset slug or id.
 *
 * The server supports starship-scoped routes:
 * - /starships/{starshipId}/datasets/{datasetIdOrSlug}
 * - /starships/{starshipId}/datasets/{datasetIdOrSlug}/rows
 * - /starships/{starshipId}/datasets/{datasetIdOrSlug}/rows:upsert
 *
 * These actions should accept:
 * - datasetSlug (preferred) OR datasetId
 *
 * Note: No `id` alias/back-compat.
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

    const templateId = String(rows[0].id);
    const legacyEndpoints: Endpoint[] = Array.isArray(rows[0].endpoints_json) ? (rows[0].endpoints_json as Endpoint[]) : [];

    const updated: ActionEndpoint[] = [
      {
        name: 'get-dataset',
        description: 'Get a dataset by id or slug (scoped to a starship)',
        method: 'GET',
        path: '/starships/{starshipId}/datasets/{datasetIdOrSlug}',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            datasetId: { type: 'string' },
            datasetSlug: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            datasetIdOrSlug: '{{ String(args.datasetSlug ?? args.datasetId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'list-dataset-rows',
        description: 'List rows for a dataset (paginated) (by id or slug)',
        method: 'GET',
        path: '/starships/{starshipId}/datasets/{datasetIdOrSlug}/rows',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            datasetId: { type: 'string' },
            datasetSlug: { type: 'string' },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            datasetIdOrSlug: '{{ String(args.datasetSlug ?? args.datasetId ?? "") }}',
          },
          query: {
            limit: '{{ args.limit == null ? "" : String(args.limit) }}',
            offset: '{{ args.offset == null ? "" : String(args.offset) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'upsert-dataset-rows',
        description: 'Append or upsert rows in a dataset (by id or slug)',
        method: 'POST',
        path: '/starships/{starshipId}/datasets/{datasetIdOrSlug}/rows:upsert',
        parameters: {
          type: 'object',
          required: ['starshipId', 'rows'],
          properties: {
            starshipId: { type: 'string' },
            datasetId: { type: 'string' },
            datasetSlug: { type: 'string' },
            rows: { type: 'array' },
            mode: { type: 'string' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            datasetIdOrSlug: '{{ String(args.datasetSlug ?? args.datasetId ?? "") }}',
          },
          body: {
            rows: '{{ args.rows ?? [] }}',
            mode: '{{ args.mode }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
    ];

    for (const e of updated) {
      const name = String(e.name);
      await client.query(
        `
          UPDATE connector_template_actions
             SET method = $1,
                 path = $2,
                 description = $3,
                 timeout_ms = $4,
                 request_style = $5,
                 parameters_json = $6,
                 mapping_json = $7,
                 updated_at = NOW()
           WHERE template_id = $8
             AND action_name = $9;
        `,
        [
          String(e.method || '').trim().toUpperCase(),
          String(e.path || '').trim(),
          (e.description ?? null) as string | null,
          (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
          e.requestStyle ?? null,
          e.parameters ?? null,
          e.mapping ?? null,
          templateId,
          name,
        ]
      );
    }

    // Keep legacy endpoints_json best-effort in sync.
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    for (const e of updated) byName.set(e.name, e);

    const nextLegacy: Endpoint[] = legacyEndpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    for (const name of ACTION_NAMES) {
      if (!nextLegacy.some((e) => e?.name === name)) {
        const e = updated.find((x) => x.name === name);
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
  // Best-effort: no-op (historical schema restored by re-applying older migrations).
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

