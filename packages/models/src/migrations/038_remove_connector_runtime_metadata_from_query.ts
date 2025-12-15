import type { Client } from 'pg';

/**
 * Remove deprecated runtime_config metadataFromQuery settings.
 *
 * We no longer support runtime_config[.oauth].metadataFromQuery. The host now
 * copies callback query params into connector metadata automatically (with
 * a small denylist for sensitive OAuth plumbing like "code" and "state").
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          (
            -- Remove legacy top-level key
            (COALESCE(runtime_config, '{}'::jsonb) - 'metadataFromQuery')
            -- Remove nested oauth key if present
            || jsonb_build_object(
              'oauth',
              (
                CASE
                  WHEN jsonb_typeof((COALESCE(runtime_config, '{}'::jsonb) -> 'oauth')) = 'object'
                    THEN ((COALESCE(runtime_config, '{}'::jsonb) -> 'oauth') - 'metadataFromQuery')
                  ELSE (COALESCE(runtime_config, '{}'::jsonb) -> 'oauth')
                END
              )
            )
          ),
        updated_at = NOW()
      WHERE
        (COALESCE(runtime_config, '{}'::jsonb) ? 'metadataFromQuery')
        OR ((COALESCE(runtime_config, '{}'::jsonb) -> 'oauth') ? 'metadataFromQuery')
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(_client: Client): Promise<void> {
  // Best-effort no-op: we can't reliably restore removed keys.
}
