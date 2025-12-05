import type { Client } from 'pg';

export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🚀 Changing agents.temperature and agent_templates.temperature to DOUBLE PRECISION...');

    // Agents table
    await client.query(`
      ALTER TABLE agents
      ALTER COLUMN temperature TYPE DOUBLE PRECISION
      USING temperature::DOUBLE PRECISION
    `);

    // Agent templates table
    await client.query(`
      ALTER TABLE agent_templates
      ALTER COLUMN temperature TYPE DOUBLE PRECISION
      USING temperature::DOUBLE PRECISION
    `);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully: temperature columns are now DOUBLE PRECISION');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed (018_change_agent_temperature_to_double):', error);
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');

  try {
    console.log('🔄 Reverting temperature columns back to DECIMAL(3,2)...');

    await client.query(`
      ALTER TABLE agents
      ALTER COLUMN temperature TYPE DECIMAL(3,2)
      USING temperature::DECIMAL(3,2)
    `);

    await client.query(`
      ALTER TABLE agent_templates
      ALTER COLUMN temperature TYPE DECIMAL(3,2)
      USING temperature::DECIMAL(3,2)
    `);

    await client.query('COMMIT');
    console.log('✅ Rollback completed for 018_change_agent_temperature_to_double');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
