import type { Client } from 'pg';

/**
 * Introduce connector_templates as the canonical connector catalog.
 *
 * This mirrors the pattern of agent_templates -> agents and
 * tool_templates -> tools. Any previous connector_providers table
 * is deprecated and dropped here so that only connector_templates
 * remains going forward.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Creating connector_templates table...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS connector_templates (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        provider TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT NOT NULL,
        auth_type TEXT NOT NULL CHECK (auth_type IN ('oauth2', 'api_key', 'none')),
        required_env_keys TEXT[] NOT NULL DEFAULT '{}',
        optional_env_keys TEXT[] NOT NULL DEFAULT '{}',
        docs_slug TEXT,
        oauth_authorize_url TEXT,
        oauth_token_url TEXT,
        oauth_scopes TEXT[] NOT NULL DEFAULT '{}',
        oauth_redirect_path TEXT,
        runtime_config JSONB NOT NULL DEFAULT '{}'::jsonb,
        -- Versioning / metadata
        version TEXT NOT NULL DEFAULT '1.0.0',
        category TEXT NOT NULL DEFAULT 'connector',
        usage_count INTEGER NOT NULL DEFAULT 0,
        -- Inline Autopilot blueprints for connector flows
        connect_blueprint JSONB,
        refresh_blueprint JSONB,
        test_blueprint JSONB,
        -- Timestamps
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    console.log('➡️  Seeding connector_templates with built-in connectors...');

    // LinkedIn
    await client.query(
      `
      INSERT INTO connector_templates (
        id,
        slug,
        provider,
        display_name,
        description,
        auth_type,
        required_env_keys,
        optional_env_keys,
        docs_slug,
        oauth_authorize_url,
        oauth_token_url,
        oauth_scopes,
        oauth_redirect_path,
        runtime_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        'linkedin',
        'linkedin',
        'linkedin',
        'LinkedIn',
        'Connect a LinkedIn account to enable tools that create and manage posts using the LinkedIn API.',
        'oauth2',
        ['LINKEDIN_ACCESS_TOKEN'],
        ['LINKEDIN_ORG_ID'],
        '/public-docs/environment#linkedin-connector',
        'https://www.linkedin.com/oauth/v2/authorization',
        'https://www.linkedin.com/oauth/v2/accessToken',
        // -- Scopes mirror LINKEDIN_SCOPES in ConnectorService
        [
          'r_basicprofile',
          'w_member_social',
          'r_member_postAnalytics',
          'r_member_profileAnalytics',
          'rw_organization_admin',
          'r_organization_social',
          'w_organization_social',
          'r_organization_social_feed',
          'r_organization_followers',
        ],
        '/api/v1/connectors/linkedin/oauth/callback',
        {
          clientIdEnvKey: 'LINKEDIN_CLIENT_ID',
          clientSecretEnvKey: 'LINKEDIN_CLIENT_SECRET',
          accessTokenEnvKey: 'LINKEDIN_ACCESS_TOKEN',
        },
      ]
    );

    // Discord
    await client.query(
      `
      INSERT INTO connector_templates (
        id,
        slug,
        provider,
        display_name,
        description,
        auth_type,
        required_env_keys,
        optional_env_keys,
        docs_slug,
        oauth_authorize_url,
        oauth_token_url,
        oauth_scopes,
        oauth_redirect_path,
        runtime_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        'discord',
        'discord',
        'discord',
        'Discord',
        'Connect a Discord bot to enable tools that send messages or notifications to your Discord servers via an installed bot.',
        'oauth2',
        [],
        [],
        '/public-docs/environment#discord-connector',
        'https://discord.com/oauth2/authorize',
        'https://discord.com/api/oauth2/token',
        // -- Scopes mirror DISCORD_SCOPES in ConnectorService
        ['bot', 'applications.commands', 'identify'],
        '/api/v1/connectors/discord/oauth/callback',
        {
          clientIdEnvKey: 'DISCORD_CLIENT_ID',
          clientSecretEnvKey: 'DISCORD_CLIENT_SECRET',
          permissions: '805317649',
          metadataFromQuery: ['guild_id', 'permissions'],
        },
      ]
    );

    // Google Drive
    await client.query(
      `
      INSERT INTO connector_templates (
        id,
        slug,
        provider,
        display_name,
        description,
        auth_type,
        required_env_keys,
        optional_env_keys,
        docs_slug,
        oauth_authorize_url,
        oauth_token_url,
        oauth_scopes,
        oauth_redirect_path,
        runtime_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        'google_drive',
        'google_drive',
        'google_drive',
        'Google Drive',
        'Connect a Google Drive account to enable tools that list, read, and write files via the Google Drive API.',
        'oauth2',
        ['GOOGLE_DRIVE_ACCESS_TOKEN'],
        ['GOOGLE_DRIVE_REFRESH_TOKEN'],
        '/public-docs/environment#google-drive-connector',
        'https://accounts.google.com/o/oauth2/v2/auth',
        'https://oauth2.googleapis.com/token',
        // Scopes mirror GOOGLE_DRIVE_SCOPES in ConnectorService
        ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.metadata.readonly'],
        '/api/v1/connectors/google_drive/oauth/callback',
        {
          clientIdEnvKey: 'GOOGLE_DRIVE_CLIENT_ID',
          clientSecretEnvKey: 'GOOGLE_DRIVE_CLIENT_SECRET',
          accessType: 'offline',
          prompt: 'consent',
          accessTokenEnvKey: 'GOOGLE_DRIVE_ACCESS_TOKEN',
          refreshTokenEnvKey: 'GOOGLE_DRIVE_REFRESH_TOKEN',
        },
      ]
    );

    // GitHub
    await client.query(
      `
      INSERT INTO connector_templates (
        id,
        slug,
        provider,
        display_name,
        description,
        auth_type,
        required_env_keys,
        optional_env_keys,
        docs_slug,
        runtime_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        'github',
        'github',
        'github',
        'GitHub',
        'Connect a GitHub App installation to enable tools that read and write repositories, issues, and pull requests via the GitHub API.',
        'oauth2',
        [],
        [],
        '/public-docs/environment#github-connector',
        {
          appIdEnvKey: 'GITHUB_APP_ID',
          privateKeyEnvKey: 'GITHUB_APP_PRIVATE_KEY_BASE64',
        },
      ]
    );

    // Starships (internal, no auth)
    await client.query(
      `
      INSERT INTO connector_templates (
        id,
        slug,
        provider,
        display_name,
        description,
        auth_type,
        required_env_keys,
        optional_env_keys,
        docs_slug,
        runtime_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO NOTHING
      `,
      [
        'starships',
        'starships',
        'starships',
        'Starships',
        'Use the Starships API itself (tools, docs, models, etc.) as a connector-backed capability for this starship.',
        'none',
        [],
        [],
        '/public-docs/environment#starships-connector',
        {
          usesPlatformJwt: true,
        },
      ]
    );

    // Drop legacy connector_providers table if it exists; connector_templates
    // is the new source of truth.
    await client.query('DROP TABLE IF EXISTS connector_providers');

    await client.query('COMMIT');
    console.log('✅ connector_templates table created and seeded successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create connector_templates table:', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Dropping connector_templates table...');

    await client.query('DROP TABLE IF EXISTS connector_templates');

    await client.query('COMMIT');
    console.log('✅ connector_templates table dropped successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
