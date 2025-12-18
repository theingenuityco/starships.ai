import type { Client } from 'pg';

/**
 * Change Google Drive connector scope to https://www.googleapis.com/auth/drive
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Updating Google Drive connector scope to https://www.googleapis.com/auth/drive...');

    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            (
              (COALESCE(runtime_config, '{}'::jsonb) - 'oauth')
              || jsonb_build_object(
                'oauth',
                CASE
                  WHEN jsonb_typeof(COALESCE(runtime_config, '{}'::jsonb)->'oauth') = 'object'
                    THEN (COALESCE(runtime_config, '{}'::jsonb)->'oauth')
                  ELSE '{}'::jsonb
                END
              )
            ),
            '{oauth,scopes}',
            '["https://www.googleapis.com/auth/drive"]'::jsonb,
            true
          ),
        updated_at = NOW()
      WHERE id = 'google_drive'
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully: Updated Google Drive connector scope');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Rolling back Google Drive connector scope...');

    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            (
              (COALESCE(runtime_config, '{}'::jsonb) - 'oauth')
              || jsonb_build_object(
                'oauth',
                CASE
                  WHEN jsonb_typeof(COALESCE(runtime_config, '{}'::jsonb)->'oauth') = 'object'
                    THEN (COALESCE(runtime_config, '{}'::jsonb)->'oauth')
                  ELSE '{}'::jsonb
                END
              )
            ),
            '{oauth,scopes}',
            '["https://www.googleapis.com/auth/drive.file","https://www.googleapis.com/auth/drive.metadata.readonly"]'::jsonb,
            true
          ),
        updated_at = NOW()
      WHERE id = 'google_drive'
    `);

    await client.query('COMMIT');
    console.log('✅ Rollback completed');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
