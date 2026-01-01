import type { Client } from 'pg';

/**
 * Allow HTTP Basic auth as a connector_templates.auth_type value.
 *
 * auth_type is a denormalized column derived from connector_templates.auth_json.type.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'basic', 'platform_jwt', 'none'))
    `);
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
      ALTER TABLE connector_templates
      DROP CONSTRAINT IF EXISTS connector_templates_auth_type_check
    `);
    await client.query(`
      ALTER TABLE connector_templates
      ADD CONSTRAINT connector_templates_auth_type_check
      CHECK (auth_type IN ('oauth2', 'api_key', 'platform_jwt', 'none'))
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}


