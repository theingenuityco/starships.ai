type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

/**
 * Migration 080: Cleanup duplicate Aria agents per starship.
 *
 * Problem:
 * - Some starships ended up with 2+ marketplace-deployed Aria agents.
 *
 * Goal:
 * - For each affected starship:
 *   - Keep the *oldest* Aria agent (by created_at).
 *   - Shift all conversation linkage + message attribution from the newer Aria agent(s) to the oldest.
 *   - Delete the duplicate Aria agent(s) that end up with no remaining conversation/message references.
 *   - Delete tool instances that were attached exclusively to the deleted Aria agent(s).
 *
 * Safety:
 * - We only consider template-deployed Aria agents (agents.source_template_id IS NOT NULL),
 *   and we confirm Aria by template slug when available (agent_templates.slug='aria'),
 *   with a defensive fallback when the template row is missing (agent slug starts with 'aria').
 * - We never delete an Aria agent if it still has any messages or conversation links after the shift.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1) Identify Aria agents (template-deployed) and compute keep_id per starship
    // 2) Shift conversation_agents (delete conflicting duplicates first, then update)
    // 3) Shift messages.agent_id (and agent_name) to keep_id
    // 4) Identify deletable duplicate Aria agents (now with no references)
    // 5) Delete tools that are exclusive to those duplicate agents
    // 6) Delete the duplicate agents
    const sql = `
      WITH aria_agents AS (
        SELECT
          a.id,
          a.starship_id,
          a.created_at,
          FIRST_VALUE(a.id) OVER (PARTITION BY a.starship_id ORDER BY a.created_at ASC, a.id ASC) AS keep_id,
          ROW_NUMBER() OVER (PARTITION BY a.starship_id ORDER BY a.created_at ASC, a.id ASC) AS rn
        FROM agents a
        LEFT JOIN agent_templates at ON at.id = a.source_template_id
        WHERE a.starship_id IS NOT NULL
          AND a.deployed_at IS NOT NULL
          AND a.source_template_id IS NOT NULL
          AND (
            LOWER(COALESCE(at.slug, '')) = 'aria'
            OR (at.id IS NULL AND LOWER(a.slug) LIKE 'aria%')
          )
      ),
      affected_starships AS (
        SELECT starship_id
        FROM aria_agents
        GROUP BY starship_id
        HAVING COUNT(*) >= 2
      ),
      dups AS (
        SELECT aa.*
        FROM aria_agents aa
        JOIN affected_starships s ON s.starship_id = aa.starship_id
        WHERE aa.rn > 1
      ),
      keepers AS (
        SELECT DISTINCT aa.starship_id, aa.keep_id
        FROM aria_agents aa
        JOIN affected_starships s ON s.starship_id = aa.starship_id
      ),

      -- Conversation-agent links: prevent PK conflicts when updating dup -> keep for same conversation.
      deleted_ca_conflicts AS (
        DELETE FROM conversation_agents ca
        USING dups d, conversations c
        WHERE ca.agent_id = d.id
          AND c.id = ca.conversation_id
          AND c.starship_id = d.starship_id
          AND EXISTS (
            SELECT 1
            FROM conversation_agents ca2
            WHERE ca2.conversation_id = ca.conversation_id
              AND ca2.agent_id = d.keep_id
            LIMIT 1
          )
        RETURNING ca.conversation_id, ca.agent_id
      ),
      updated_ca AS (
        UPDATE conversation_agents ca
        SET agent_id = d.keep_id
        FROM dups d, conversations c
        WHERE ca.agent_id = d.id
          AND c.id = ca.conversation_id
          AND c.starship_id = d.starship_id
        RETURNING ca.conversation_id, ca.agent_id
      ),

      -- Messages: move agent attribution to keeper Aria
      updated_messages AS (
        UPDATE messages m
        SET
          agent_id = d.keep_id,
          agent_name = k.name
        FROM dups d
        JOIN agents k ON k.id = d.keep_id
        WHERE m.agent_id = d.id
          AND m.starship_id = d.starship_id
        RETURNING m.id
      ),

      -- After shifting, only delete duplicate aria agents with no remaining references
      deletable_dups AS (
        SELECT d.*
        FROM dups d
        WHERE NOT EXISTS (
          SELECT 1 FROM conversation_agents ca WHERE ca.agent_id = d.id LIMIT 1
        )
          AND NOT EXISTS (
          SELECT 1 FROM messages m WHERE m.agent_id = d.id LIMIT 1
        )
      ),

      -- Tools attached to deletable dup aria agents
      candidate_tools AS (
        SELECT DISTINCT at.tool_id
        FROM agent_tools at
        JOIN deletable_dups d ON d.id = at.agent_id
      ),
      exclusive_tools AS (
        SELECT ct.tool_id
        FROM candidate_tools ct
        WHERE NOT EXISTS (
          SELECT 1
          FROM agent_tools at2
          WHERE at2.tool_id = ct.tool_id
            AND at2.agent_id NOT IN (SELECT id FROM deletable_dups)
          LIMIT 1
        )
      ),
      deletable_tools AS (
        SELECT t.id AS tool_id
        FROM tools t
        JOIN exclusive_tools et ON et.tool_id = t.id
        WHERE t.starship_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM deletable_dups d
            WHERE d.starship_id = t.starship_id
            LIMIT 1
          )
      ),
      deleted_tools AS (
        DELETE FROM tools t
        USING deletable_tools dt
        WHERE t.id = dt.tool_id
        RETURNING t.id
      ),
      deleted_agents AS (
        DELETE FROM agents a
        USING deletable_dups d
        WHERE a.id = d.id
        RETURNING a.id
      )
      SELECT
        (SELECT COUNT(*)::int FROM affected_starships) AS affected_starships,
        (SELECT COUNT(*)::int FROM dups) AS duplicate_aria_agents,
        (SELECT COUNT(*)::int FROM deleted_ca_conflicts) AS conversation_agent_links_deleted_for_conflict,
        (SELECT COUNT(*)::int FROM updated_ca) AS conversation_agent_links_shifted,
        (SELECT COUNT(*)::int FROM updated_messages) AS messages_shifted,
        (SELECT COUNT(*)::int FROM deletable_tools) AS tools_eligible_for_delete,
        (SELECT COUNT(*)::int FROM deleted_tools) AS tools_deleted,
        (SELECT COUNT(*)::int FROM deleted_agents) AS duplicate_aria_agents_deleted
    `;

    const rows = toRows<{
      affected_starships: number;
      duplicate_aria_agents: number;
      conversation_agent_links_deleted_for_conflict: number;
      conversation_agent_links_shifted: number;
      messages_shifted: number;
      tools_eligible_for_delete: number;
      tools_deleted: number;
      duplicate_aria_agents_deleted: number;
    }>(await client.query(sql));

    const r = rows?.[0];
    console.log(
      `[MIGRATION-080] Duplicate Aria cleanup: starships=${r?.affected_starships ?? 0}, dups=${r?.duplicate_aria_agents ?? 0}, ` +
        `caShifted=${r?.conversation_agent_links_shifted ?? 0}, caConflictsDeleted=${r?.conversation_agent_links_deleted_for_conflict ?? 0}, ` +
        `messagesShifted=${r?.messages_shifted ?? 0}, toolsDeleted=${r?.tools_deleted ?? 0}, agentsDeleted=${r?.duplicate_aria_agents_deleted ?? 0}`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  void client;
  console.warn('[080_cleanup_duplicate_aria_agents] down() is a no-op (non-destructive reversal not supported).');
}

