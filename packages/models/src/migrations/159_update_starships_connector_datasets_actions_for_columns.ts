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
  baseUrlOverride?: string;
  parameters?: unknown;
  mapping?: unknown;
  response?: unknown;
};

const ACTION_NAMES = [
  'list-datasets',
  'create-dataset',
  'get-dataset',
  'update-dataset',
  'list-dataset-rows',
  'upsert-dataset-rows',
] as const;

function datasetColumnJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', description: 'Stable key used in row objects' },
      description: { type: 'string' },
      format: { type: 'string', enum: ['text', 'number', 'currency', 'date', 'datetime', 'percentage'] },
      type: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum', 'reference', 'formula'] },
      constraints: {
        type: 'object',
        properties: {
          required: { type: 'boolean' },
          nullable: { type: 'boolean' },
          unique: { type: 'boolean' },
          autoincrement: { type: 'boolean' },
          default: {},
          min: { type: 'number' },
          max: { type: 'number' },
          minLength: { type: 'number' },
          maxLength: { type: 'number' },
          pattern: { type: 'string' },
        },
        additionalProperties: false,
      },
      enum: {
        type: 'object',
        required: ['options'],
        properties: {
          options: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
      reference: {
        type: 'object',
        required: ['target'],
        properties: {
          target: {
            oneOf: [
              {
                type: 'object',
                required: ['kind', 'datasetIdOrSlug'],
                properties: {
                  kind: { type: 'string', enum: ['dataset_row'] },
                  datasetIdOrSlug: { type: 'string' },
                },
                additionalProperties: false,
              },
              {
                type: 'object',
                required: ['kind'],
                properties: {
                  kind: { type: 'string', enum: ['task_card'] },
                },
                additionalProperties: false,
              },
            ],
          },
          labelColumn: { type: 'string' },
        },
        additionalProperties: false,
      },
      formula: {
        type: 'object',
        required: ['expr'],
        properties: {
          expr: { type: 'string' },
          resultType: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'datetime', 'json', 'enum'] },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };
}

/**
 * Migration 159: Update Starships connector dataset actions to match current endpoints:
 * - dataset routes accept datasetIdOrSlug
 * - rows list supports expand=refs
 * - add update-dataset action (PATCH) for columns/primaryKey/archived updates
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

    const colSchema = datasetColumnJsonSchema();
    const colsSchema = { type: 'array', items: colSchema };

    const updated: ActionEndpoint[] = [
      {
        name: 'list-datasets',
        description: 'List datasets for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/datasets',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            includeArchived: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          query: {
            includeArchived: '{{ args.includeArchived == null ? "" : String(args.includeArchived) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-dataset',
        description: 'Create a dataset for a starship',
        method: 'POST',
        path: '/starships/{starshipId}/datasets',
        parameters: {
          type: 'object',
          required: ['starshipId', 'name', 'columns'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            columns: colsSchema,
            primaryKey: { type: ['string', 'null'] },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            description: '{{ args.description }}',
            columns: '{{ args.columns ?? [] }}',
            primaryKey: '{{ args.primaryKey }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
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
        name: 'update-dataset',
        description: 'Update a dataset (including columns/primaryKey/archived) by id or slug',
        method: 'PATCH',
        path: '/starships/{starshipId}/datasets/{datasetIdOrSlug}',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            datasetId: { type: 'string' },
            datasetSlug: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            columns: colsSchema,
            primaryKey: { type: ['string', 'null'] },
            archived: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            datasetIdOrSlug: '{{ String(args.datasetSlug ?? args.datasetId ?? "") }}',
          },
          body: {
            name: '{{ args.name === undefined ? undefined : args.name }}',
            description: '{{ args.description === undefined ? undefined : args.description }}',
            columns: '{{ args.columns === undefined ? undefined : (args.columns ?? []) }}',
            primaryKey: '{{ args.primaryKey === undefined ? undefined : args.primaryKey }}',
            archived: '{{ args.archived === undefined ? undefined : args.archived }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 15000,
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
            expand: { type: 'string', description: 'Optional expansion. Use "refs" to hydrate references.' },
            expandRefs: { type: 'boolean', description: 'Convenience flag for expand=refs' },
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
            expand: '{{ args.expandRefs ? "refs" : (args.expand == null ? "" : String(args.expand)) }}',
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
            mode: { type: 'string', enum: ['append', 'upsert'] },
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

    // Preserve ordinals where actions already exist; assign new ones at the end.
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

    for (const e of updated) {
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
  // Best-effort: no-op. (Existing actions are safe to keep; historical schema can be restored by older migrations if needed.)
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

