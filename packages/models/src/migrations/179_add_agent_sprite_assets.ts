import type { Client } from 'pg';

/**
 * Migration 179: Add agent_sprite_assets registry table
 *
 * This table tracks offline-generated/published in-game sprites for agents.
 * Appearance is tied to the agent's avatarAttachmentId via appearanceKey derivation.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_sprite_assets (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        appearance_key VARCHAR(255) NOT NULL,
        avatar_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL,
        spritesheet_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL,
        atlas_attachment_id VARCHAR(255) REFERENCES attachments(id) ON DELETE SET NULL,
        static_base_path VARCHAR(1000),
        status VARCHAR(32) NOT NULL DEFAULT 'draft',
        style_id VARCHAR(128) NOT NULL DEFAULT 'default',
        model_version VARCHAR(128) NOT NULL DEFAULT 'unknown',
        generator_version VARCHAR(128) NOT NULL DEFAULT 'v1',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_agent_sprite_assets_agent_id ON agent_sprite_assets(agent_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sprite_assets_agent_appearance_key ON agent_sprite_assets(agent_id, appearance_key);
      CREATE INDEX IF NOT EXISTS idx_agent_sprite_assets_status ON agent_sprite_assets(status);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('DROP TABLE IF EXISTS agent_sprite_assets CASCADE');
}

