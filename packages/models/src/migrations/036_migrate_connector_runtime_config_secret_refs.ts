import type { Client } from 'pg';

/**
 * Migrate connector_templates.runtime_config secret references to explicit objects:
 *
 * From (legacy):
 *   - oauth.clientId: "GOOGLE_CLIENT_ID"
 *   - oauth.clientSecret: "GOOGLE_CLIENT_SECRET"
 *   - oauth.accessToken: "GH_APP_ACCESS_TOKEN" OR "platform:DISCORD_BOT_TOKEN"
 *   - oauth.refreshToken: "GH_APP_REFRESH_TOKEN"
 *   - oauth.apiKey: "API_KEY"
 *
 * To (new):
 *   - { type: "platform_secret",  key: "GOOGLE_CLIENT_ID" }
 *   - { type: "connector_secret", key: "GH_APP_ACCESS_TOKEN" }
 *   - { type: "platform_secret",  key: "DISCORD_BOT_TOKEN" }
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
                jsonb_set(
                  jsonb_set(
                    COALESCE(runtime_config, '{}'::jsonb),
                    '{oauth,clientId}',
                    CASE
                      WHEN jsonb_typeof(runtime_config->'oauth'->'clientId') = 'string'
                        THEN jsonb_build_object('type','platform_secret','key', (runtime_config->'oauth'->>'clientId'))
                      ELSE COALESCE(runtime_config->'oauth'->'clientId', 'null'::jsonb)
                    END,
                    true
                  ),
                  '{oauth,clientSecret}',
                  CASE
                    WHEN jsonb_typeof(runtime_config->'oauth'->'clientSecret') = 'string'
                      THEN jsonb_build_object('type','platform_secret','key', (runtime_config->'oauth'->>'clientSecret'))
                    ELSE COALESCE(runtime_config->'oauth'->'clientSecret', 'null'::jsonb)
                  END,
                  true
                ),
                '{oauth,accessToken}',
                CASE
                  WHEN jsonb_typeof(runtime_config->'oauth'->'accessToken') = 'string' THEN
                    CASE
                      WHEN (runtime_config->'oauth'->>'accessToken') LIKE 'platform:%'
                        THEN jsonb_build_object('type','platform_secret','key', substring((runtime_config->'oauth'->>'accessToken') from 10))
                      ELSE jsonb_build_object('type','connector_secret','key', (runtime_config->'oauth'->>'accessToken'))
                    END
                  ELSE COALESCE(runtime_config->'oauth'->'accessToken', 'null'::jsonb)
                END,
                true
              ),
              '{oauth,refreshToken}',
              CASE
                WHEN jsonb_typeof(runtime_config->'oauth'->'refreshToken') = 'string'
                  THEN jsonb_build_object('type','connector_secret','key', (runtime_config->'oauth'->>'refreshToken'))
                ELSE COALESCE(runtime_config->'oauth'->'refreshToken', 'null'::jsonb)
              END,
              true
            ),
            '{oauth,apiKey}',
            CASE
              WHEN jsonb_typeof(runtime_config->'oauth'->'apiKey') = 'string'
                THEN jsonb_build_object('type','connector_secret','key', (runtime_config->'oauth'->>'apiKey'))
              ELSE COALESCE(runtime_config->'oauth'->'apiKey', 'null'::jsonb)
            END,
            true
          ),
        updated_at = NOW()
      WHERE runtime_config ? 'oauth'
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
    // Best-effort revert:
    // - platform_secret -> string key (and for accessToken specifically, re-add "platform:" prefix)
    // - connector_secret -> string key
    await client.query(`
      UPDATE connector_templates
      SET
        runtime_config =
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    COALESCE(runtime_config, '{}'::jsonb),
                    '{oauth,clientId}',
                    CASE
                      WHEN jsonb_typeof(runtime_config->'oauth'->'clientId') = 'object'
                        THEN to_jsonb(COALESCE(runtime_config->'oauth'->'clientId'->>'key','')::text)
                      ELSE COALESCE(runtime_config->'oauth'->'clientId', 'null'::jsonb)
                    END,
                    true
                  ),
                  '{oauth,clientSecret}',
                  CASE
                    WHEN jsonb_typeof(runtime_config->'oauth'->'clientSecret') = 'object'
                      THEN to_jsonb(COALESCE(runtime_config->'oauth'->'clientSecret'->>'key','')::text)
                    ELSE COALESCE(runtime_config->'oauth'->'clientSecret', 'null'::jsonb)
                  END,
                  true
                ),
                '{oauth,accessToken}',
                CASE
                  WHEN jsonb_typeof(runtime_config->'oauth'->'accessToken') = 'object' THEN
                    CASE
                      WHEN (runtime_config->'oauth'->'accessToken'->>'type') = 'platform_secret'
                        THEN to_jsonb(('platform:' || COALESCE(runtime_config->'oauth'->'accessToken'->>'key',''))::text)
                      ELSE to_jsonb(COALESCE(runtime_config->'oauth'->'accessToken'->>'key','')::text)
                    END
                  ELSE COALESCE(runtime_config->'oauth'->'accessToken', 'null'::jsonb)
                END,
                true
              ),
              '{oauth,refreshToken}',
              CASE
                WHEN jsonb_typeof(runtime_config->'oauth'->'refreshToken') = 'object'
                  THEN to_jsonb(COALESCE(runtime_config->'oauth'->'refreshToken'->>'key','')::text)
                ELSE COALESCE(runtime_config->'oauth'->'refreshToken', 'null'::jsonb)
              END,
              true
            ),
            '{oauth,apiKey}',
            CASE
              WHEN jsonb_typeof(runtime_config->'oauth'->'apiKey') = 'object'
                THEN to_jsonb(COALESCE(runtime_config->'oauth'->'apiKey'->>'key','')::text)
              ELSE COALESCE(runtime_config->'oauth'->'apiKey', 'null'::jsonb)
            END,
            true
          ),
        updated_at = NOW()
      WHERE runtime_config ? 'oauth'
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
