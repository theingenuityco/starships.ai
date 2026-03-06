import type { Client } from 'pg';

type DbRow = { id: string; endpoints_json: unknown };

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 161:
 * - Backfill `conversation_participants` from legacy tables.
 * - Drop legacy tables:
 *   - conversation_members (user-only membership)
 *   - conversation_agents (agent join table)
 * - Remove room pinned agents feature:
 *   - drop room_agents join table
 *   - delete Starships connector actions related to pinning/reordering room agents
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const tableExists = async (name: string): Promise<boolean> => {
      const res = await client.query(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      const rows = toRows<{ exists: boolean }>(res);
      return Boolean(rows?.[0]?.exists);
    };

    // -----------------------------------------------------------------------
    // Backfill conversation_participants from conversation_members
    // -----------------------------------------------------------------------
    if (await tableExists('conversation_members')) {
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, user_id, role, created_at, created_by)
        SELECT conversation_id, user_id, role, created_at, created_by
          FROM conversation_members
         WHERE user_id IS NOT NULL
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
      `);
    }

    // -----------------------------------------------------------------------
    // Backfill conversation_participants from conversation_agents
    // -----------------------------------------------------------------------
    if (await tableExists('conversation_agents')) {
      await client.query(`
        INSERT INTO conversation_participants (conversation_id, agent_id, created_at)
        SELECT conversation_id, agent_id, linked_at
          FROM conversation_agents
         WHERE agent_id IS NOT NULL
        ON CONFLICT (conversation_id, agent_id) DO NOTHING;
      `);
    }

    // -----------------------------------------------------------------------
    // Remove Starships connector actions for room agent pins (best-effort)
    // -----------------------------------------------------------------------
    try {
      // Preferred schema (post-migration 112): connector_template_actions(template_id, action_name)
      await client.query(`
        DELETE FROM connector_template_actions a
        USING connector_templates t
        WHERE a.template_id = t.id
          AND t.provider = 'starships'
          AND a.action_name IN ('pin-room-agent', 'unpin-room-agent', 'reorder-room-pins-agents');
      `);
    } catch {
      // Back-compat (older schemas used different column names)
      await client.query(`
        DELETE FROM connector_template_actions a
        USING connector_templates t
        WHERE a.connector_template_id = t.id
          AND t.provider = 'starships'
          AND a.name IN ('pin-room-agent', 'unpin-room-agent', 'reorder-room-pins-agents');
      `);
    }

    // Also prune legacy/admin-visible endpoints_json on the starships connector template.
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<DbRow>(res);
    if (rows.length > 0) {
      const row = rows[0];
      const templateId = String(row.id);
      const endpoints = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Array<Record<string, unknown>>) : [];
      const blocked = new Set(['pin-room-agent', 'unpin-room-agent', 'reorder-room-pins-agents']);
      const next = endpoints.filter((e) => !blocked.has(String(e?.name || '')));
      try {
        await client.query(`UPDATE connector_templates SET endpoints_json = $2::jsonb WHERE id = $1`, [templateId, JSON.stringify(next)]);
      } catch {
        // endpoints_json may not be jsonb on older schemas; ignore.
      }
    }

    // -----------------------------------------------------------------------
    // Drop legacy tables (after backfill)
    // -----------------------------------------------------------------------
    await client.query(`DROP TABLE IF EXISTS conversation_members;`);
    await client.query(`DROP TABLE IF EXISTS conversation_agents;`);

    // Drop room pinned agents table (renamed to room_agents in migration 155)
    await client.query(`DROP TABLE IF EXISTS room_agents;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  // Intentionally non-reversible: re-creating and re-populating these legacy tables is not supported.
  await client.query('BEGIN');
  try {
    // Re-create tables in the simplest form so older code can run in dev rollbacks if needed.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_members (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        PRIMARY KEY (conversation_id, user_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_agents (
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        linked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (conversation_id, agent_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_agents (
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255) NULL,
        PRIMARY KEY (room_conversation_id, agent_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_agents_room ON room_agents(room_conversation_id);`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_room_agents_room_position ON room_agents(room_conversation_id, position);`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}
