import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Adding category column to agents...');

    await client.query(`
      ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'general'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_agents_category ON agents(category)
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully: Added agents.category');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed (017_add_agent_category):', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Rolling back agents.category column...');

    await client.query('DROP INDEX IF EXISTS idx_agents_category');
    await client.query('ALTER TABLE agents DROP COLUMN IF EXISTS category');

    await client.query('COMMIT');
    console.log('✅ Rollback completed for 017_add_agent_category');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
