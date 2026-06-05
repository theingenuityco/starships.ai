import type { Client } from 'pg';

/**
 * Migration 199: split "agent" into "agent runtime" + "agent persona".
 *
 * The old `agents` registry conflated two concepts: the execution engine (an
 * external CLI on a machine) and the user-authored actor (identity + access +
 * behaviour). This migration separates them:
 *
 *  - `agents`          -> `agent_runtimes`  (the engine: kind, device, token, dispatch host)
 *  - new `agent_personas`                   (the actor: name, access, system prompt, model)
 *
 * Work now targets a persona; the runtime the persona is currently assigned to
 * executes it. So:
 *  - dispatches/events gain `persona_id` (actor) alongside the renamed
 *    `runtime_id` (engine that ran it), plus a `persona_config` snapshot column.
 *  - heartbeats retarget from runtime to persona (`agent_id` -> `persona_id`).
 *
 * Backfill creates exactly one persona per existing runtime (1:1), with a
 * deterministic id (`persona_<runtimeId>`) so child-table FKs can be remapped
 * with a plain UPDATE. `access_role` + `description` move off the runtime.
 *
 * down() is a no-op (forward-only, matching the rest of the chain).
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // 1. Rename the engine tables.
    await client.query('ALTER TABLE IF EXISTS agents RENAME TO agent_runtimes');
    await client.query('ALTER TABLE IF EXISTS agent_tokens RENAME TO agent_runtime_tokens');
    await client.query('ALTER TABLE IF EXISTS agent_devices RENAME TO agent_runtime_devices');
    await client.query('ALTER TABLE IF EXISTS agent_dispatches RENAME TO agent_runtime_dispatches');
    await client.query('ALTER TABLE IF EXISTS agent_events RENAME TO agent_runtime_events');
    await client.query('ALTER TABLE IF EXISTS agent_heartbeats RENAME TO agent_runtime_heartbeats');

    // 2. New persona table (the actor). runtime_id is the current, reassignable
    //    assignment; ON DELETE SET NULL keeps personas durable when an engine goes away.
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_personas (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500),
        avatar_url VARCHAR(1024),
        access_role VARCHAR(16) NOT NULL DEFAULT 'contributor',
        system_prompt TEXT,
        model VARCHAR(100),
        instructions TEXT,
        temperature REAL,
        runtime_id VARCHAR(255) REFERENCES agent_runtimes(id) ON DELETE SET NULL,
        created_by_user_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_personas_starship ON agent_personas(starship_id)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_personas_starship_slug ON agent_personas(starship_id, slug)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_personas_runtime ON agent_personas(runtime_id)`);

    // 3. Backfill one persona per runtime (reads access_role/description still on the runtime).
    await client.query(`
      INSERT INTO agent_personas (id, starship_id, slug, name, description, access_role, runtime_id, created_by_user_id, created_at, updated_at)
      SELECT 'persona_' || r.id, r.starship_id, r.slug, r.name, r.description, r.access_role, r.id, r.created_by_user_id, r.created_at, r.updated_at
      FROM agent_runtimes r
      ON CONFLICT (id) DO NOTHING`);

    // 4. Tokens + devices: agent_id -> runtime_id (token authenticates the engine).
    await client.query('ALTER TABLE agent_runtime_tokens RENAME COLUMN agent_id TO runtime_id');
    await client.query('ALTER TABLE agent_runtime_devices RENAME COLUMN agent_id TO runtime_id');

    // 5. Dispatches: agent_id -> runtime_id (engine), add persona_id (actor) + persona_config snapshot.
    await client.query('ALTER TABLE agent_runtime_dispatches RENAME COLUMN agent_id TO runtime_id');
    await client.query('ALTER TABLE agent_runtime_dispatches ALTER COLUMN runtime_id DROP NOT NULL');
    await client.query('ALTER TABLE agent_runtime_dispatches ADD COLUMN IF NOT EXISTS persona_id VARCHAR(255)');
    await client.query('ALTER TABLE agent_runtime_dispatches ADD COLUMN IF NOT EXISTS persona_config JSONB');
    await client.query(`UPDATE agent_runtime_dispatches SET persona_id = 'persona_' || runtime_id WHERE persona_id IS NULL AND runtime_id IS NOT NULL`);
    await client.query('ALTER TABLE agent_runtime_dispatches ALTER COLUMN persona_id SET NOT NULL');
    await client.query(
      `ALTER TABLE agent_runtime_dispatches ADD CONSTRAINT agent_runtime_dispatches_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES agent_personas(id) ON DELETE CASCADE`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_runtime_dispatches_persona ON agent_runtime_dispatches(persona_id, created_at)`);

    // 6. Events: agent_id -> runtime_id, add persona_id (nullable; runtime-level events allowed).
    await client.query('ALTER TABLE agent_runtime_events RENAME COLUMN agent_id TO runtime_id');
    await client.query('ALTER TABLE agent_runtime_events ALTER COLUMN runtime_id DROP NOT NULL');
    await client.query('ALTER TABLE agent_runtime_events ADD COLUMN IF NOT EXISTS persona_id VARCHAR(255)');
    await client.query(`UPDATE agent_runtime_events SET persona_id = 'persona_' || runtime_id WHERE persona_id IS NULL AND runtime_id IS NOT NULL`);
    await client.query(
      `ALTER TABLE agent_runtime_events ADD CONSTRAINT agent_runtime_events_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES agent_personas(id) ON DELETE SET NULL`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_runtime_events_persona ON agent_runtime_events(persona_id, created_at)`);

    // 7. Heartbeats: retarget from runtime to persona. The old FK referenced agents(id);
    //    drop it, remap values to the backfilled persona id, then re-point at agent_personas.
    await client.query('ALTER TABLE agent_runtime_heartbeats DROP CONSTRAINT IF EXISTS agent_heartbeats_agent_id_fkey');
    await client.query('ALTER TABLE agent_runtime_heartbeats RENAME COLUMN agent_id TO persona_id');
    await client.query(`UPDATE agent_runtime_heartbeats SET persona_id = 'persona_' || persona_id`);
    await client.query(
      `ALTER TABLE agent_runtime_heartbeats ADD CONSTRAINT agent_runtime_heartbeats_persona_id_fkey FOREIGN KEY (persona_id) REFERENCES agent_personas(id) ON DELETE CASCADE`
    );

    // 8. Drop the identity fields that moved to the persona. The search index over
    //    (name || description) must go before the description column it references.
    await client.query('DROP INDEX IF EXISTS idx_agents_search');
    await client.query('ALTER TABLE agent_runtimes DROP COLUMN IF EXISTS access_role');
    await client.query('ALTER TABLE agent_runtimes DROP COLUMN IF EXISTS description');

    // Persona full-text search (replaces the old agents search index).
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_personas_search ON agent_personas USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')))`
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(): Promise<void> {
  // No-op: forward-only.
}
