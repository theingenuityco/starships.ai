import type { Client } from 'pg';

/**
 * Expand Starships internal connector endpoints to include
 * updating connector templates with `webhooksJson` (webhooks_json).
 *
 * This allows hosted/agent flows that rely on the internal `starships` connector
 * to update connector template webhook ingestion configuration via connector_action.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const endpoint = {
      name: 'update-connector-template',
      description: 'Update a connector template by id/provider (admin)',
      method: 'PUT',
      path: '/admin/connector-templates/{id}',
      parameters: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          isEnabled: { type: 'boolean' },
          version: { type: 'string' },
          category: { type: 'string' },
          baseUrl: { type: 'string' },
          auth: { type: 'object' },
          variables: { type: 'array' },
          endpoints: { type: 'array' },
          rateLimit: { type: 'object' },
          metadataSchema: { type: 'object' },
          webhooksJson: { type: 'object' },
        },
        additionalProperties: true,
      },
      mapping: {
        path: {
          id: '{{ String(args.id ?? "") }}',
        },
        body: {
          name: '{{ args.name }}',
          description: '{{ args.description }}',
          isEnabled: '{{ args.isEnabled }}',
          version: '{{ args.version }}',
          category: '{{ args.category }}',
          baseUrl: '{{ args.baseUrl }}',
          auth: '{{ args.auth }}',
          variables: '{{ args.variables }}',
          endpoints: '{{ args.endpoints }}',
          rateLimit: '{{ args.rateLimit }}',
          metadataSchema: '{{ args.metadataSchema }}',
          webhooksJson: '{{ args.webhooksJson }}',
        },
      },
      requestStyle: 'json',
      timeoutMs: 10_000,
    };

    await client.query(
      `
      UPDATE connector_templates
      SET
        endpoints_json =
          CASE
            WHEN jsonb_typeof(endpoints_json) <> 'array' THEN endpoints_json
            WHEN endpoints_json @> $1::jsonb THEN endpoints_json
            ELSE endpoints_json || $2::jsonb
          END,
        updated_at = NOW()
      WHERE provider = 'starships'
      `,
      [JSON.stringify([{ name: 'update-connector-template' }]), JSON.stringify([endpoint])]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      UPDATE connector_templates
      SET
        endpoints_json =
          CASE
            WHEN jsonb_typeof(endpoints_json) <> 'array' THEN endpoints_json
            ELSE (
              SELECT COALESCE(jsonb_agg(el), '[]'::jsonb)
              FROM jsonb_array_elements(endpoints_json) el
              WHERE COALESCE(el->>'name','') <> 'update-connector-template'
            )
          END,
        updated_at = NOW()
      WHERE provider = 'starships'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
