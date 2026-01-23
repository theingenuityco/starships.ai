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
 * Migration 083: Remove list-connectors connector endpoint from Starships connector
 *
 * Removes the deprecated `list-connectors` connector endpoint from the Starships connector.
 * This endpoint was replaced by `search-connector` (added in migration 081).
 *
 * Safety check: Before removing, verifies that no tools are using this endpoint.
 * If tools are found, the migration fails with a clear error message.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Safety check: Find any tools that reference 'list-connectors' action in their blueprints
    // We search for connector_action nodes with parameters.action = 'list-connectors'
    // Using JSONB path queries to precisely match connector_action nodes
    const toolsCheckRes = await client.query(
      `
      SELECT id, slug, name, starship_id
      FROM tools
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(blueprint->'nodes') AS node
        WHERE node->>'type' = 'connector_action'
          AND (
            (node->'parameters'->>'action') = 'list-connectors'
            OR (node->'parameters'->'action')::text = '"list-connectors"'
          )
      )
      LIMIT 10
      `
    );
    const toolsUsingEndpoint = toRows<{ id: string; slug: string; name: string; starship_id: string }>(toolsCheckRes);

    if (toolsUsingEndpoint.length > 0) {
      const toolList = toolsUsingEndpoint.map((t) => `- ${t.name} (${t.slug}) on starship ${t.starship_id}`).join('\n');
      throw new Error(
        `Cannot remove list-connectors endpoint: Found ${toolsUsingEndpoint.length} tool(s) still using it:\n${toolList}\n\n` +
          `Please migrate these tools to use 'search-connector' action instead, then re-run this migration.`
      );
    }

    // Also check tool templates (though migration 082 should have removed list-connectors template)
    const templatesCheckRes = await client.query(
      `
      SELECT id, slug, name
      FROM tool_templates
      WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(blueprint->'nodes') AS node
        WHERE node->>'type' = 'connector_action'
          AND (
            (node->'parameters'->>'action') = 'list-connectors'
            OR (node->'parameters'->'action')::text = '"list-connectors"'
          )
      )
      LIMIT 10
      `
    );
    const templatesUsingEndpoint = toRows<{ id: string; slug: string; name: string }>(templatesCheckRes);

    if (templatesUsingEndpoint.length > 0) {
      const templateList = templatesUsingEndpoint.map((t) => `- ${t.name} (${t.slug})`).join('\n');
      throw new Error(
        `Cannot remove list-connectors endpoint: Found ${templatesUsingEndpoint.length} tool template(s) still using it:\n${templateList}\n\n` +
          `Please migrate these templates to use 'search-connector' action instead, then re-run this migration.`
      );
    }

    // Safe to proceed: Remove the endpoint from Starships connector
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);

    if (!rows.length) {
      console.log('[MIGRATION-083] Starships connector template not found, skipping');
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const endpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    // Remove list-connectors endpoint
    const nextEndpoints = endpoints.filter((e) => e?.name !== 'list-connectors');

    if (nextEndpoints.length === endpoints.length) {
      console.log('[MIGRATION-083] list-connectors endpoint not found in Starships connector, skipping');
      await client.query('COMMIT');
      return;
    }

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    console.log('[MIGRATION-083] Removed list-connectors endpoint from Starships connector');

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

    // Check if endpoint already exists
    const exists = endpoints.some((e) => e?.name === 'list-connectors');
    if (exists) {
      console.log('[MIGRATION-083] list-connectors endpoint already exists, skipping rollback');
      await client.query('COMMIT');
      return;
    }

    // Restore the endpoint (from migration 052 definition)
    const restoredEndpoint: Endpoint = {
      name: 'list-connectors',
      description: 'List connectors for a starship',
      method: 'GET',
      path: '/starships/{starshipId}/connectors',
      parameters: {
        type: 'object',
        required: ['starshipId'],
        properties: {
          starshipId: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: {
        path: {
          starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
        },
      },
      requestStyle: 'query',
      timeoutMs: 5000,
    };

    const nextEndpoints = [...endpoints, restoredEndpoint];

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb WHERE id = $2;`, [
      JSON.stringify(nextEndpoints),
      row.id,
    ]);

    console.log('[MIGRATION-083] Restored list-connectors endpoint to Starships connector');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
