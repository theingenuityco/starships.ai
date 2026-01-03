import type { Client } from 'pg';

type Endpoint = {
  name: string;
  parameters?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: unknown;
    additionalProperties?: unknown;
    [key: string]: unknown;
  };
  mapping?: {
    path?: Record<string, unknown>;
    body?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

/**
 * Migration 058: Update Starships connector endpoint catalog so `update-agent` supports `role` (optional).
 *
 * We do not modify prior migrations; instead we patch the stored `endpoints_json` for the Starships connector template.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(
      `SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`
    );

    if (!res.rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = res.rows[0] as { id: string; endpoints_json: unknown };
    const endpoints = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const nextEndpoints = endpoints.map((ep) => {
      if (ep?.name !== 'update-agent') return ep;

      const parameters = ep.parameters ?? { type: 'object', properties: {}, required: ['agentId'], additionalProperties: true };
      const mapping = ep.mapping ?? { path: {}, body: {} };

      const properties = { ...(parameters.properties ?? {}) };
      if (!properties.role) properties.role = { type: 'string' };

      const body = { ...(mapping.body ?? {}) };
      if (!body.role) body.role = '{{ args.role }}';

      return {
        ...ep,
        parameters: {
          ...parameters,
          properties,
        },
        mapping: {
          ...mapping,
          body,
        },
      };
    });

    await client.query(`UPDATE connector_templates SET endpoints_json = $1 WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(
      `SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`
    );

    if (!res.rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = res.rows[0] as { id: string; endpoints_json: unknown };
    const endpoints = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const nextEndpoints = endpoints.map((ep) => {
      if (ep?.name !== 'update-agent') return ep;

      const parameters = ep.parameters ?? {};
      const mapping = ep.mapping ?? {};

      const properties = { ...(parameters.properties ?? {}) };
      delete properties.role;

      const body = { ...(mapping.body ?? {}) };
      delete body.role;

      return {
        ...ep,
        parameters: {
          ...parameters,
          properties,
        },
        mapping: {
          ...mapping,
          body,
        },
      };
    });

    await client.query(`UPDATE connector_templates SET endpoints_json = $1 WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


