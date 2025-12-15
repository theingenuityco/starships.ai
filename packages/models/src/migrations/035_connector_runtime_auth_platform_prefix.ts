import type { Client } from 'pg';

/**
 * Make connector runtime HTTP auth fully runtime_config-driven (no provider-specific code).
 *
 * In particular, Discord should use a host-level bot token while still being
 * starship-scoped (only usable when the connector is connected for that starship).
 *
 * This migration updates the Discord template runtime_config to:
 * - oauth.accessToken = "platform:DISCORD_BOT_TOKEN"
 * - oauth.authPrefix = "Bot"
 * - oauth.requiresConnected = true
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            jsonb_set(
              jsonb_set(
                COALESCE(runtime_config, '{}'::jsonb),
                '{oauth,accessToken}',
                to_jsonb('platform:DISCORD_BOT_TOKEN'::text),
                true
              ),
              '{oauth,authPrefix}',
              to_jsonb('Bot'::text),
              true
            ),
            '{oauth,requiresConnected}',
            to_jsonb(true),
            true
          ),
        updated_at = NOW()
      WHERE provider = 'discord'
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
    // Best-effort revert: remove only the keys we introduced.
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            COALESCE(runtime_config, '{}'::jsonb),
            '{oauth}',
            (
              COALESCE(runtime_config->'oauth', '{}'::jsonb)
              - 'accessToken'
              - 'authPrefix'
              - 'requiresConnected'
            ),
            true
          ),
        updated_at = NOW()
      WHERE provider = 'discord'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
