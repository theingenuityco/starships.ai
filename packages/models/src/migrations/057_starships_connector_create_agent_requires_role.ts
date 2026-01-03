import type { Client } from 'pg';

type Endpoint = {
  name: string;
  description?: string;
  method?: string;
  path?: string;
  parameters?: any;
  mapping?: any;
  requestStyle?: string;
  timeoutMs?: number;
};

/**
 * Migration 057: Update Starships connector endpoint catalog so `create-agent` accepts required `role`.
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
      // Nothing to patch on instances that don't have the starships connector template seeded.
      await client.query('COMMIT');
      return;
    }

    const row = res.rows[0] as { id: string; endpoints_json: unknown };
    const endpoints = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const nextEndpoints = endpoints.map((ep) => {
      if (ep?.name !== 'create-agent') return ep;

      const parameters = ep.parameters ?? { type: 'object', properties: {}, required: [], additionalProperties: true };
      const mapping = ep.mapping ?? { body: {} };

      // Ensure role is required + present.
      const required: string[] = Array.isArray(parameters.required) ? [...parameters.required] : [];
      if (!required.includes('role')) required.push('role');

      const properties = { ...(parameters.properties ?? {}) };
      if (!properties.role) properties.role = { type: 'string' };

      const body = { ...(mapping.body ?? {}) };
      if (!body.role) body.role = '{{ args.role }}';

      return {
        ...ep,
        parameters: {
          ...parameters,
          required,
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
      if (ep?.name !== 'create-agent') return ep;

      const parameters = ep.parameters ?? {};
      const mapping = ep.mapping ?? {};

      const required: string[] = Array.isArray(parameters.required) ? parameters.required.filter((r: string) => r !== 'role') : [];
      const properties = { ...(parameters.properties ?? {}) };
      delete properties.role;

      const body = { ...(mapping.body ?? {}) };
      delete body.role;

      return {
        ...ep,
        parameters: {
          ...parameters,
          required,
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


