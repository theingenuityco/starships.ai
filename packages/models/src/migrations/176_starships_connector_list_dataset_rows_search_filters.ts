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
 * Migration 176: Add search + filters support to Starships connector action: list-dataset-rows
 *
 * Server endpoint updated:
 * - GET /api/v1/starships/:starshipId/datasets/:datasetIdOrSlug/rows
 *   now accepts `search` and `filters` query params.
 *
 * This migration updates connector_template_actions (source of truth) and keeps
 * connector_templates.endpoints_json best-effort in sync.
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

    const parameters = {
      type: 'object',
      required: ['starshipId'],
      properties: {
        starshipId: { type: 'string' },
        datasetId: { type: 'string' },
        datasetSlug: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        expand: { type: 'string', description: 'Optional expansion. Use "refs" to hydrate references.' },
        expandRefs: { type: 'boolean', description: 'Convenience flag for expand=refs' },
        search: { type: 'string', description: 'Case-insensitive substring search across row_key and row values' },
        filters: {
          description:
            'Row filters. Accepts either a JSON string or a JSON-serializable array/object. Server expects a JSON string in query params.',
          oneOf: [{ type: 'string' }, { type: 'array' }, { type: 'object' }],
        },
      },
      additionalProperties: false,
    };

    const mapping = {
      path: {
        starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
        datasetIdOrSlug: '{{ String(args.datasetSlug ?? args.datasetId ?? "") }}',
      },
      query: {
        limit: '{{ args.limit == null ? "" : String(args.limit) }}',
        offset: '{{ args.offset == null ? "" : String(args.offset) }}',
        expand: '{{ args.expandRefs ? "refs" : (args.expand == null ? "" : String(args.expand)) }}',
        search: '{{ args.search == null ? "" : String(args.search) }}',
        filters: '{{ args.filters == null ? "" : (typeof args.filters === "string" ? args.filters : JSON.stringify(args.filters)) }}',
      },
    };

    await client.query(
      `
        UPDATE connector_template_actions
           SET parameters_json = $1,
               mapping_json = $2,
               updated_at = NOW()
         WHERE template_id = $3
           AND action_name = 'list-dataset-rows';
      `,
      [parameters, mapping, templateId]
    );

    // Best-effort: also sync legacy endpoints_json for admin visibility.
    const nextLegacy = legacyEndpoints.map((e) => {
      if (!e || typeof e !== 'object') return e;
      if (String(e.name || '') !== 'list-dataset-rows') return e;
      return {
        ...e,
        parameters,
        mapping,
      } as Endpoint;
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
  // Best-effort: no-op. (Existing query params are additive and safe to keep.)
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

