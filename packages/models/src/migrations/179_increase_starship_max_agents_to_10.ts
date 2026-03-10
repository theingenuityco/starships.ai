import type { Client } from 'pg';

/**
 * Migration 179: Increase maxAgents for existing starships to 10.
 *
 * Context:
 * - Code defaults for new Scout starships were updated to use maxAgents = 10.
 * - Existing starships in the database still have lower max_agents values (typically 5).
 * - AgentService.validateAgentLimit enforces the persisted max_agents value, so
 *   older starships continue to be limited to 5 agents unless we update them.
 *
 * This migration brings existing starships in line with the new default by:
 * - Updating starships with max_agents < 10 to max_agents = 10.
 *
 * We intentionally gate on max_agents < 10 to avoid clobbering any higher, plan-based
 * entitlements that may already exist.
 */
export async function up(client: Client): Promise<void> {
  await client.query(
    `
    UPDATE starships
    SET max_agents = 10
    WHERE max_agents < 10
  `
  );
}

export async function down(client: Client): Promise<void> {
  // This migration is intentionally irreversible because we don't know the previous
  // per-starship entitlements once we've increased the max_agents value.
  // If needed, a manual rollback can be performed with a targeted UPDATE.
  console.log('Migration 179 down(): no-op (max_agents changes are not automatically reversible).');
}
