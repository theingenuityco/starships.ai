type DbClient = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
};

/**
 * Migration 087: Remove Research Assistant agent template and unused instances
 *
 * Goal:
 * - Remove the Research Assistant agent template from agent_templates
 * - Remove any unused Research Assistant agent instances deployed from the marketplace
 *   (agents with no message history)
 * - Clean up tools that were exclusively assigned to those Research Assistant instances
 *
 * Definition (operational):
 * - "Research Assistant template": identified by name 'Research Assistant' or slug matching 'research-assistant'
 * - "Unused instances": agent instances deployed from the Research Assistant template with no message history:
 *   - no USER message exists in any conversation linked to the agent via `conversation_agents`, AND
 *   - (defensive) no message exists with `messages.agent_id = agent.id`
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
    // Step 1: Identify Research Assistant template(s)
    // Step 2: Delete unused Research Assistant agent instances and their exclusive tools
    // Step 3: Delete the Research Assistant template(s)
    const cleanupSql = `
      WITH research_template AS (
        SELECT id, name, slug
        FROM agent_templates
        WHERE LOWER(name) = 'research assistant'
           OR LOWER(slug) LIKE 'research-assistant%'
        LIMIT 1
      ),
      candidate_agents AS (
        SELECT a.id
        FROM agents a
        JOIN research_template rt ON rt.id = a.source_template_id
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
        JOIN candidate_agents c ON c.id = at.agent_id
      ),
      exclusive_tools AS (
        SELECT ct.tool_id
        FROM candidate_tools ct
        WHERE NOT EXISTS (
          SELECT 1
          FROM agent_tools at2
          WHERE at2.tool_id = ct.tool_id
            AND at2.agent_id NOT IN (SELECT id FROM candidate_agents)
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
            JOIN candidate_agents c3 ON c3.id = at3.agent_id
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
        USING candidate_agents c
        WHERE a.id = c.id
        RETURNING a.id
      ),
      deleted_template AS (
        DELETE FROM agent_templates at
        USING research_template rt
        WHERE at.id = rt.id
        RETURNING at.id, at.name
      )
      SELECT
        (SELECT COUNT(*)::int FROM research_template) AS research_templates_found,
        (SELECT COUNT(*)::int FROM candidate_agents) AS candidate_agents,
        (SELECT COUNT(*)::int FROM exclusive_tools) AS exclusive_tools,
        (SELECT COUNT(*)::int FROM deletable_tools) AS deletable_tools,
        (SELECT COUNT(*)::int FROM deleted_agents) AS deleted_agents,
        (SELECT COUNT(*)::int FROM deleted_tools) AS deleted_tools,
        (SELECT COUNT(*)::int FROM deleted_template) AS deleted_templates
    `;

    // Note: our migration runner passes a PostgresConnection-like client where `query()` returns `rows[]`,
    // not a pg QueryResult. So treat the return value as an array of rows.
    const rows = await client.query<{
      research_templates_found: number;
      candidate_agents: number;
      exclusive_tools: number;
      deletable_tools: number;
      deleted_agents: number;
      deleted_tools: number;
      deleted_templates: number;
    }>(cleanupSql);
    const row = rows?.[0];
    const deletedAgents = row?.deleted_agents ?? 0;
    const deletedTools = row?.deleted_tools ?? 0;
    const deletedTemplates = row?.deleted_templates ?? 0;

    console.log(
      `[MIGRATION-087] Removed Research Assistant: ${deletedTemplates} template(s), ${deletedAgents} unused agent instance(s), ${deletedTools} exclusive tool(s)`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  void client;
  console.warn('[087_remove_research_assistant] down() is a no-op (non-destructive reversal not supported).');
}
