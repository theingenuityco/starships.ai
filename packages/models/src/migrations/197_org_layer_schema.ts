import type { Client } from 'pg';

/**
 * Migration 197: Org-layer schema.
 *
 * Reshapes the database for the org-layer pivot:
 *  - agents become a slim external-agent REGISTRY (drop runtime config columns;
 *    add kind / access_role / created_by_user_id; slug unique per starship)
 *  - rooms become own-id CONTAINERS (no longer conversation-backed); pin tables
 *    (room_tables / room_task_boards / room_docs) key off room_id
 *  - new agent registry tables: agent_devices, agent_tokens, agent_dispatches,
 *    agent_events
 *  - drop all dead agent-runtime / messaging / connector / scheduling tables
 *
 * Destructive: rooms + pins + all dropped tables lose data. down() is a no-op.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // ------------------------------------------------------------------
    // Agents -> slim registry
    // ------------------------------------------------------------------
    for (const col of [
      'model',
      'temperature',
      'max_tokens',
      'timeout',
      'system_prompt',
      'preview_prompts',
      'state',
      'blueprint',
      'template_id',
      'deployed_at',
      'content_hash',
      'category',
      'version',
      'reasoning',
      'avatar_attachment_id',
      'avatar_prompt',
      'problem_statements_attachment_id',
      'capabilities_attachment_id',
      'try_these_prompts_attachment_id',
      'role',
      'source_template_id',
      'published_template_id',
      'publication_status',
      'template_snapshot_at',
    ]) {
      await client.query(`ALTER TABLE agents DROP COLUMN IF EXISTS ${col} CASCADE`);
    }
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'custom'`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS access_role VARCHAR(16) NOT NULL DEFAULT 'contributor'`);
    await client.query(`ALTER TABLE agents ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(255)`);
    // Slug is unique per-starship (not globally) for registry agents.
    await client.query(`DROP INDEX IF EXISTS idx_agents_slug_unique`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_starship_slug ON agents(starship_id, slug)`);

    // ------------------------------------------------------------------
    // Rooms -> own-id containers (data loss acceptable)
    // ------------------------------------------------------------------
    await client.query(`DROP TABLE IF EXISTS room_views CASCADE`);
    await client.query(`DROP TABLE IF EXISTS room_tables CASCADE`);
    await client.query(`DROP TABLE IF EXISTS room_task_boards CASCADE`);
    await client.query(`DROP TABLE IF EXISTS room_docs CASCADE`);
    await client.query(`DROP TABLE IF EXISTS rooms CASCADE`);

    await client.query(`
      CREATE TABLE rooms (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        slug VARCHAR(100) NOT NULL,
        name VARCHAR(100) NOT NULL,
        is_private BOOLEAN NOT NULL DEFAULT false,
        topic TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (starship_id, slug)
      )`);
    await client.query(`CREATE INDEX idx_rooms_starship_id ON rooms(starship_id)`);

    await client.query(`
      CREATE TABLE room_tables (
        room_id VARCHAR(255) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        table_id VARCHAR(255) NOT NULL REFERENCES starship_tables(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        PRIMARY KEY (room_id, table_id)
      )`);
    await client.query(`
      CREATE TABLE room_task_boards (
        room_id VARCHAR(255) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        board_id VARCHAR(255) NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        PRIMARY KEY (room_id, board_id)
      )`);
    await client.query(`
      CREATE TABLE room_docs (
        room_id VARCHAR(255) NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        doc_id VARCHAR(255) NOT NULL REFERENCES docs(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        created_by VARCHAR(255),
        PRIMARY KEY (room_id, doc_id)
      )`);

    // ------------------------------------------------------------------
    // New agent registry tables
    // ------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_devices (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        device_label VARCHAR(255),
        platform VARCHAR(64),
        last_seen_at TIMESTAMP WITH TIME ZONE,
        connection_status VARCHAR(32) NOT NULL DEFAULT 'offline',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_devices_agent ON agent_devices(agent_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_tokens (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(255),
        last_used_at TIMESTAMP WITH TIME ZONE,
        expires_at TIMESTAMP WITH TIME ZONE,
        revoked_at TIMESTAMP WITH TIME ZONE,
        created_by_user_id VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash ON agent_tokens(token_hash)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_dispatches (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        card_id VARCHAR(255),
        command_type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        delivery_status VARCHAR(32) NOT NULL DEFAULT 'dispatched',
        ack_status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        acked_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_dispatches_agent ON agent_dispatches(agent_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_dispatches_starship ON agent_dispatches(starship_id, created_at)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_events (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        dispatch_id VARCHAR(255),
        card_id VARCHAR(255),
        type VARCHAR(64) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_events_starship ON agent_events(starship_id, created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id, created_at)`);

    // ------------------------------------------------------------------
    // Drop dead agent-runtime / messaging / connector / scheduling tables
    // ------------------------------------------------------------------
    const dead = [
      'messages', 'message_reactions', 'message_mentions',
      'conversations', 'conversation_participants', 'conversation_read_states',
      'conversation_notification_prefs', 'conversation_agents',
      'turns', 'tool_call_approvals', 'channels', 'direct_messages',
      'connectors', 'connector_events', 'connector_secrets',
      'connector_webhook_bindings', 'connector_templates', 'connector_template_actions',
      'llm_models', 'heartbeat_configs', 'heartbeat_runs', 'schedules',
      'notifications', 'marketing_content', 'usage', 'usage_ledger',
      'views', 'widgets', 'view_widgets',
      'room_pinned_views', 'room_pinned_tools', 'room_pinned_datasets',
      'room_pinned_agents', 'room_pinned_task_boards',
      'agent_tools', 'starship_tools', 'room_tools',
      'autopilot_awaits', 'autopilot_await_firings',
      'agent_templates', 'agent_template_tool_templates', 'tool_templates', 'tools',
    ];
    for (const t of dead) {
      await client.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export async function down(): Promise<void> {
  // No-op: destructive, forward-only.
}
