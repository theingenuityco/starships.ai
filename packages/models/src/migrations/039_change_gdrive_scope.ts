import type { Client } from 'pg';

/**
 * Change Google Drive connector scope to https://www.googleapis.com/auth/drive
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Updating Google Drive connector scope to https://www.googleapis.com/auth/drive...');

    await client.query(
      `
      UPDATE connector_templates
      SET
        oauth_scopes = ARRAY['https://www.googleapis.com/auth/drive'],
        updated_at = NOW()
      WHERE
        id = 'google_drive'
    `
    );

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

    await client.query(
      `
      UPDATE connector_templates
      SET
        oauth_scopes = ARRAY['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
        updated_at = NOW()
      WHERE
        id = 'google_drive'
    `
    );

    await client.query('COMMIT');
    console.log('✅ Rollback completed');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
