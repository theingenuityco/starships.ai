import type { Client } from 'pg';

/**
 * Migration 068: Add list-agents-from-marketplace endpoint to Starships connector
 *
 * Adds an endpoint to list all available agent templates from the marketplace.
 * This allows agents like Aria to discover and recommend agent templates to users.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Define the new endpoint for listing agent templates
    const newEndpoint = {
      name: 'list-agents-from-marketplace',
      description: 'List all agent templates from the marketplace',
      method: 'GET',
      path: '/agent-templates',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          query: { type: 'string' },
        },
        additionalProperties: false,
      },
      mapping: {
        query: {
          page: '{{ args.page ?? 1 }}',
          limit: '{{ args.limit ?? 50 }}',
          query: '{{ args.query }}',
        },
      },
      requestStyle: 'query',
      timeoutMs: 5000,
    };

    // Fetch the current starships connector template
    const result = await client.query(
      `SELECT id, endpoints_json FROM connector_templates WHERE slug = 'starships' LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw new Error('Starships connector template not found');
    }

    const { id, endpoints_json } = result.rows[0];
    const currentEndpoints = endpoints_json || [];

    // Check if endpoint already exists
    const existingIndex = currentEndpoints.findIndex((e: any) => e.name === 'list-agents-from-marketplace');

    let updatedEndpoints;
    if (existingIndex >= 0) {
      // Update existing endpoint
      updatedEndpoints = [...currentEndpoints];
      updatedEndpoints[existingIndex] = newEndpoint;
      console.log('[MIGRATION-068] Updated existing list-agents-from-marketplace endpoint');
    } else {
      // Add new endpoint
      updatedEndpoints = [...currentEndpoints, newEndpoint];
      console.log('[MIGRATION-068] Added new list-agents-from-marketplace endpoint');
    }

    // Update the connector template with the new endpoints
    await client.query(
      `UPDATE connector_templates SET endpoints_json = $1 WHERE id = $2`,
      [JSON.stringify(updatedEndpoints), id]
    );

    console.log('[MIGRATION-068] Successfully updated starships connector with list-agents-from-marketplace endpoint');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION-068] Error adding list-agent-templates endpoint:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Fetch the current starships connector template
    const result = await client.query(
      `SELECT id, endpoints_json FROM connector_templates WHERE slug = 'starships' LIMIT 1`
    );

    if (result.rows.length === 0) {
      throw new Error('Starships connector template not found');
    }

    const { id, endpoints_json } = result.rows[0];
    const currentEndpoints = endpoints_json || [];

    // Remove the list-agents-from-marketplace endpoint
    const updatedEndpoints = currentEndpoints.filter((e: any) => e.name !== 'list-agents-from-marketplace');

    // Update the connector template
    await client.query(
      `UPDATE connector_templates SET endpoints_json = $1 WHERE id = $2`,
      [JSON.stringify(updatedEndpoints), id]
    );

    console.log('[MIGRATION-068] Removed list-agents-from-marketplace endpoint from starships connector');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION-068] Error removing list-agent-templates endpoint:', error);
    throw error;
  }
}
