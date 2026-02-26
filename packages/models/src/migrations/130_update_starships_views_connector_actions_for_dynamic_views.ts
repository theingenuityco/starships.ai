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
 * Migration 130: Update Starships connector view actions for Dynamic Views (root tree)
 *
 * Breaking change (no legacy retention):
 * - Remove legacy attach/detach widget-to-view actions (endpoints removed from API)
 * - Update create-view/update-view actions to use { root, runtimeConfig } instead of { layout }
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

    // Remove legacy widget attachment actions.
    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      ['attach-widget-to-view', 'detach-widget-from-view'],
    ]);

    // Update create-view / update-view to accept root + runtimeConfig.
    const createParams = {
      type: 'object',
      required: ['starshipId', 'name', 'description'],
      properties: {
        starshipId: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string' },
        root: { type: 'object' },
        runtimeConfig: { type: 'object' },
      },
      additionalProperties: true,
    };
    const createMapping = {
      body: {
        starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? \"\") }}',
        name: '{{ args.name }}',
        slug: '{{ args.slug }}',
        description: '{{ args.description ?? \"\" }}',
        root: '{{ args.root }}',
        runtimeConfig: '{{ args.runtimeConfig }}',
      },
    };

    const updateParams = {
      type: 'object',
      required: ['viewId'],
      properties: {
        viewId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        root: { type: 'object' },
        runtimeConfig: { type: 'object' },
        version: { type: 'number' },
      },
      additionalProperties: true,
    };
    const updateMapping = {
      path: { viewId: '{{ String(args.viewId ?? args.id ?? \"\") }}' },
      body: {
        name: '{{ args.name }}',
        description: '{{ args.description }}',
        root: '{{ args.root }}',
        runtimeConfig: '{{ args.runtimeConfig }}',
        version: '{{ args.version }}',
      },
    };

    await client.query(
      `
        UPDATE connector_template_actions
           SET parameters_json = $1::jsonb,
               mapping_json = $2::jsonb,
               updated_at = NOW()
         WHERE template_id = $3 AND action_name = 'create-view';
      `,
      [JSON.stringify(createParams), JSON.stringify(createMapping), templateId]
    );

    await client.query(
      `
        UPDATE connector_template_actions
           SET parameters_json = $1::jsonb,
               mapping_json = $2::jsonb,
               updated_at = NOW()
         WHERE template_id = $3 AND action_name = 'update-view';
      `,
      [JSON.stringify(updateParams), JSON.stringify(updateMapping), templateId]
    );

    // Keep legacy endpoints_json best-effort in sync.
    const removeNames = new Set(['attach-widget-to-view', 'detach-widget-from-view']);
    const nextLegacy: Endpoint[] = legacyEndpoints
      .filter((e) => e && typeof e.name === 'string' && !removeNames.has(String(e.name)))
      .map((e) => {
        if (e.name === 'create-view') {
          return { ...e, parameters: createParams, mapping: createMapping, description: 'Create a view (dynamic root tree)' };
        }
        if (e.name === 'update-view') {
          return { ...e, parameters: updateParams, mapping: updateMapping, description: 'Update a view (dynamic root tree)' };
        }
        return e;
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
  // Non-destructive down: we don't recreate removed legacy actions.
  // (Legacy view widget attachment endpoints were removed from the API surface.)
  await client.query('BEGIN');
  try {
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
