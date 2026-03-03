import type { Client } from 'pg';

/**
 * Migration 162: Add room invite approvals (Slack-like)
 *
 * Adds:
 * - room_invite_approvals: durable "pending approval" rows tied to a message
 * - room_invite_approval_targets: per-approval target ids (users + agents)
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS room_invite_approvals (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        room_conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        conversation_id VARCHAR(255) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id VARCHAR(255) NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        requested_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        resolved_at TIMESTAMP WITH TIME ZONE,
        resolved_by_user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL
      );
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approvals_room ON room_invite_approvals(room_conversation_id, created_at DESC);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approvals_conversation ON room_invite_approvals(conversation_id, created_at DESC);`
    );
    await client.query(`CREATE INDEX IF NOT EXISTS idx_room_invite_approvals_message ON room_invite_approvals(message_id);`);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approvals_room_message ON room_invite_approvals(room_conversation_id, message_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approvals_status ON room_invite_approvals(room_conversation_id, status, created_at DESC);`
    );
    // Ensure at most one approval row per message (status transitions handle pending→resolved).
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_room_invite_approvals_message ON room_invite_approvals(message_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS room_invite_approval_targets (
        approval_id VARCHAR(255) NOT NULL REFERENCES room_invite_approvals(id) ON DELETE CASCADE,
        target_type VARCHAR(10) NOT NULL CHECK (target_type IN ('user', 'agent')),
        target_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        PRIMARY KEY (approval_id, target_type, target_id)
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approval_targets_approval ON room_invite_approval_targets(approval_id);`
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_room_invite_approval_targets_target ON room_invite_approval_targets(target_type, target_id, created_at DESC);`
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
    await client.query(`DROP TABLE IF EXISTS room_invite_approval_targets;`);
    await client.query(`DROP TABLE IF EXISTS room_invite_approvals;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

