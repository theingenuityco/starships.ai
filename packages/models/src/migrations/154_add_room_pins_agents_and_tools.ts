import type { Client } from 'pg';

/**
 * Migration 154: Add room pinned agents + pinned tools tables.
 *
 * Rooms already support pinning views/datasets/task boards via join tables.
 * This extends the same pattern to agents and tools.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_pinned_agents (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, agent_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_pinned_agents_room ON room_pinned_agents(room_conversation_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pinned_agents_room_position ON room_pinned_agents(room_conversation_id, position);`
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_pinned_tools (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, tool_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_pinned_tools_room ON room_pinned_tools(room_conversation_id);`);
    await client.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pinned_tools_room_position ON room_pinned_tools(room_conversation_id, position);`
    );
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP TABLE IF EXISTS room_pinned_tools;');
    await client.query('DROP TABLE IF EXISTS room_pinned_agents;');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

