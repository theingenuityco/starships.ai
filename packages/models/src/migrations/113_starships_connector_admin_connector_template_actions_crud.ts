type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

const ENDPOINT_NAMES = [
  'admin-list-connector-template-actions',
  'admin-get-connector-template-action',
  'admin-upsert-connector-template-action',
  'admin-delete-connector-template-action',
  'admin-bulk-replace-connector-template-actions',
] as const;

/**
 * Migration 113: Add admin connector template action CRUD endpoints to the Starships connector (legacy endpoints_json).
 *
 * These endpoints target the server's admin connector-template action routes:
 * - List actions
 * - Get action
 * - Upsert action (create/update)
 * - Delete action
 * - Bulk replace actions
 *
 * NOTE: These are stored in connector_templates.endpoints_json for legacy compatibility only.
 * Runtime execution should use connector_template_actions (row table) directly.
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
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const newEndpoints: Endpoint[] = [
      {
        name: 'admin-list-connector-template-actions',
        description: 'List connector template actions (instance admin only)',
        method: 'GET',
        path: '/admin/connector-templates/{templateId}/actions',
        parameters: {
          type: 'object',
          required: ['templateId'],
          properties: {
            templateId: { type: 'string' },
            q: { type: 'string', description: 'Optional search query (name/path/description)' },
            limit: { type: 'number', description: 'Page size (1-200)' },
            offset: { type: 'number', description: 'Page offset (0+)' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            templateId: '{{ String(args.templateId ?? args.id ?? "") }}',
          },
          query: {
            q: '{{ args.q ? String(args.q) : undefined }}',
            limit: '{{ args.limit === undefined ? undefined : Number(args.limit) }}',
            offset: '{{ args.offset === undefined ? undefined : Number(args.offset) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'admin-get-connector-template-action',
        description: 'Get a connector template action definition (instance admin only)',
        method: 'GET',
        path: '/admin/connector-templates/{templateId}/actions/{actionName}',
        parameters: {
          type: 'object',
          required: ['templateId', 'actionName'],
          properties: {
            templateId: { type: 'string' },
            actionName: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            templateId: '{{ String(args.templateId ?? args.id ?? "") }}',
            actionName: '{{ String(args.actionName ?? args.name ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'admin-upsert-connector-template-action',
        description: 'Create or update a connector template action (instance admin only)',
        method: 'PUT',
        path: '/admin/connector-templates/{templateId}/actions/{actionName}',
        parameters: {
          type: 'object',
          required: ['templateId', 'actionName', 'action'],
          properties: {
            templateId: { type: 'string' },
            actionName: { type: 'string' },
            action: { type: 'object', description: 'ConnectorEndpointV2 shape' },
            ordinal: { type: 'number' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            templateId: '{{ String(args.templateId ?? args.id ?? "") }}',
            actionName: '{{ String(args.actionName ?? args.name ?? "") }}',
          },
          body: {
            action: '{{ args.action }}',
            ordinal: '{{ args.ordinal }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'admin-delete-connector-template-action',
        description: 'Delete a connector template action (instance admin only)',
        method: 'DELETE',
        path: '/admin/connector-templates/{templateId}/actions/{actionName}',
        parameters: {
          type: 'object',
          required: ['templateId', 'actionName'],
          properties: {
            templateId: { type: 'string' },
            actionName: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            templateId: '{{ String(args.templateId ?? args.id ?? "") }}',
            actionName: '{{ String(args.actionName ?? args.name ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },
      {
        name: 'admin-bulk-replace-connector-template-actions',
        description: 'Replace all connector template actions (instance admin only)',
        method: 'PUT',
        path: '/admin/connector-templates/{templateId}/actions',
        parameters: {
          type: 'object',
          required: ['templateId', 'actions'],
          properties: {
            templateId: { type: 'string' },
            actions: { type: 'array', items: { type: 'object' }, description: 'ConnectorEndpointV2[]' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            templateId: '{{ String(args.templateId ?? args.id ?? "") }}',
          },
          body: {
            actions: '{{ args.actions }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 60000,
      },
    ];

    const byName = new Map(endpoints.map((e) => [String(e?.name || ''), e]));
    for (const e of newEndpoints) {
      byName.set(e.name, e);
    }

    // Preserve ordering of existing endpoints_json, appending any missing new ones at the end.
    const nextEndpoints: Endpoint[] = endpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    for (const name of ENDPOINT_NAMES) {
      if (!nextEndpoints.some((e) => e?.name === name)) {
        const e = newEndpoints.find((x) => x.name === name);
        if (e) nextEndpoints.push(e);
      }
    }

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [JSON.stringify(nextEndpoints), row.id]);

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
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
    const endpointNameSet = new Set<string>(ENDPOINT_NAMES);
    const nextEndpoints = endpoints.filter((e) => {
      if (typeof e?.name !== 'string') return true;
      return !endpointNameSet.has(e.name);
    });

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [JSON.stringify(nextEndpoints), row.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

