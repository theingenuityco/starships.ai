import type { Client } from 'pg';

/**
 * Migration 179: Increase maxAgents for existing starships to 20.
 *
 * Context:
 * - Code defaults for new Scout starships were updated to use maxAgents = 20.
 * - Existing starships in the database may still have lower max_agents values (10 or below).
 * - AgentService.validateAgentLimit enforces the persisted max_agents value, so
 *   older starships would otherwise remain capped at their previous limits.
 *
 * This migration brings existing starships in line with the new default by:
 * - Updating starships with max_agents < 20 to max_agents = 20.
 *
 * We intentionally gate on max_agents < 20 to avoid clobbering any higher, plan-based
 * entitlements that may already exist.
 */
export async function up(client: Client): Promise<void> {
  await client.query(
    `
    UPDATE starships
    SET max_agents = 20
    WHERE max_agents < 20
  `
  );
}

export async function down(): Promise<void> {
  // This migration is intentionally irreversible because we don't know the previous
  // per-starship entitlements once we've increased the max_agents value.
  // If needed, a manual rollback can be performed with a targeted UPDATE.
  console.log('Migration 179 down(): no-op (max_agents changes are not automatically reversible).');
}

