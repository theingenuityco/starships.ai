type DbClient = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
};

/**
 * Migration 075: Remove unused marketplace-deployed agents from starships (existing users cleanup)
 *
 * Goal:
 * - For existing installations, remove agent instances that were deployed from the marketplace
 *   onto a starship but were never actually used (i.e., the starship has no message history
 *   attributed to that agent).
 *
 * Definition (operational):
 * - "Deployed from marketplace": agent has a source template link to an `agent_templates` row
 *   via `agents.source_template_id` (we do NOT require `agent_templates.is_public = true`).
 * - "Hasn't had a conversation with them": there is NO evidence of user engagement with the agent:
 *   - no USER message exists in any conversation linked to the agent via `conversation_agents`, AND
 *   - (defensive) no message exists with `messages.agent_id = agent.id`.
 *
 * Notes:
 * - This is destructive and intentionally has no down migration.
 * - FK cleanup:
 *   - `messages.agent_id` is ON DELETE SET NULL; we additionally only delete agents with no messages referencing them.
 *   - Other agent-linked tables use ON DELETE CASCADE and will be cleaned up automatically.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    // Delete:
    // - candidate agents: deployed from PUBLIC marketplace templates and with no message history
    // - tools assigned ONLY to those agents (and not assigned to any other agents)
    //
    // Important: we delete tools first, because agent deletions will cascade `agent_tools` rows,
    // making it harder to reason about exclusivity after-the-fact.
    const cleanupSql = `
      WITH candidates AS (
        SELECT a.id
        FROM agents a
        JOIN agent_templates at ON at.id = a.source_template_id
        WHERE a.starship_id IS NOT NULL
          AND a.deployed_at IS NOT NULL
          -- "No conversation": no user message in any conversation linked to this agent
          AND NOT EXISTS (
            SELECT 1
            FROM conversation_agents ca
            JOIN messages m ON m.conversation_id = ca.conversation_id
            WHERE ca.agent_id = a.id
              AND m.role = 'user'
            LIMIT 1
          )
          AND NOT EXISTS (
            SELECT 1
            FROM messages m
            WHERE m.agent_id = a.id
            LIMIT 1
          )
      ),
      candidate_tools AS (
        SELECT DISTINCT at.tool_id
        FROM agent_tools at
        JOIN candidates c ON c.id = at.agent_id
      ),
      exclusive_tools AS (
        SELECT ct.tool_id
        FROM candidate_tools ct
        WHERE NOT EXISTS (
          SELECT 1
          FROM agent_tools at2
          WHERE at2.tool_id = ct.tool_id
            AND at2.agent_id NOT IN (SELECT id FROM candidates)
          LIMIT 1
        )
      ),
      deletable_tools AS (
        SELECT t.id AS tool_id
        FROM tools t
        JOIN exclusive_tools et ON et.tool_id = t.id
        WHERE t.starship_id IS NOT NULL
          AND t.deployed_at IS NOT NULL
          -- Defensive: ensure the tool is actually assigned to at least one candidate agent
          AND EXISTS (
            SELECT 1
            FROM agent_tools at3
            JOIN candidates c3 ON c3.id = at3.agent_id
            WHERE at3.tool_id = t.id
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
        USING candidates c
        WHERE a.id = c.id
        RETURNING a.id
      )
      SELECT
        (SELECT COUNT(*)::int FROM candidates) AS candidate_agents,
        (SELECT COUNT(*)::int FROM exclusive_tools) AS exclusive_tools,
        (SELECT COUNT(*)::int FROM deletable_tools) AS deletable_tools,
        (SELECT COUNT(*)::int FROM deleted_agents) AS deleted_agents,
        (SELECT COUNT(*)::int FROM deleted_tools) AS deleted_tools
    `;

    // Note: our migration runner passes a PostgresConnection-like client where `query()` returns `rows[]`,
    // not a pg QueryResult. So treat the return value as an array of rows.
    const rows = await client.query<{
      candidate_agents: number;
      exclusive_tools: number;
      deletable_tools: number;
      deleted_agents: number;
      deleted_tools: number;
    }>(cleanupSql);
    const row = rows?.[0];
    const deletedAgents = row?.deleted_agents ?? 0;
    const deletedTools = row?.deleted_tools ?? 0;

    console.log(`[MIGRATION-075] Removed ${deletedAgents} unused marketplace agent(s); removed ${deletedTools} exclusive tool(s)`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
