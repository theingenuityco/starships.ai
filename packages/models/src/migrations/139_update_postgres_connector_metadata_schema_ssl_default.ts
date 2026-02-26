import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const templateId = 'postgres';
    const metadataSchemaJson = JSON.stringify({
      type: 'object',
      required: ['host', 'database'],
      properties: {
        host: { type: 'string', title: 'Host', description: 'Database hostname (publicly reachable)' },
        port: { type: 'integer', title: 'Port', default: 5432 },
        database: { type: 'string', title: 'Database' },
        // Default to false to avoid forcing SSL in environments where certificate validation fails.
        // Runner enforces rejectUnauthorized=true whenever ssl=true.
        ssl: { type: 'boolean', title: 'SSL', default: false },
      },
      additionalProperties: true,
    });

    await client.query(
      `UPDATE connector_templates SET metadata_schema_json = $1::jsonb, updated_at = NOW() WHERE id = $2;`,
      [metadataSchemaJson, templateId]
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
    const templateId = 'postgres';
    const metadataSchemaJson = JSON.stringify({
      type: 'object',
      required: ['host', 'database'],
      properties: {
        host: { type: 'string', title: 'Host', description: 'Database hostname (publicly reachable)' },
        port: { type: 'integer', title: 'Port', default: 5432 },
        database: { type: 'string', title: 'Database' },
        ssl: { type: 'boolean', title: 'SSL', default: true },
      },
      additionalProperties: true,
    });

    await client.query(
      `UPDATE connector_templates SET metadata_schema_json = $1::jsonb, updated_at = NOW() WHERE id = $2;`,
      [metadataSchemaJson, templateId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

