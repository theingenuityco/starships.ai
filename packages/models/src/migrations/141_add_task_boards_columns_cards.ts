import type { Client } from 'pg';

/**
 * Migration 141: Add task boards (kanban) tables
 *
 * Starship-scoped kanban boards used by humans and agents.
 *
 * Ordering:
 * - `pos` is a floating point ordering key; callers can set midpoints to reorder cheaply.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS task_boards (
        id VARCHAR(255) PRIMARY KEY,
        starship_id VARCHAR(255) NOT NULL REFERENCES starships(id) ON DELETE CASCADE,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        description VARCHAR(2000) NOT NULL DEFAULT '',
        pos DOUBLE PRECISION NOT NULL DEFAULT 0,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (starship_id, slug)
      );

      CREATE INDEX IF NOT EXISTS idx_task_boards_starship_id ON task_boards(starship_id);
      CREATE INDEX IF NOT EXISTS idx_task_boards_starship_archived ON task_boards(starship_id, archived);
      CREATE INDEX IF NOT EXISTS idx_task_boards_starship_pos ON task_boards(starship_id, pos);

      CREATE TABLE IF NOT EXISTS task_columns (
        id VARCHAR(255) PRIMARY KEY,
        board_id VARCHAR(255) NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        key VARCHAR(100) NULL,
        pos DOUBLE PRECISION NOT NULL DEFAULT 0,
        wip_limit INTEGER NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        UNIQUE (board_id, key)
      );

      CREATE INDEX IF NOT EXISTS idx_task_columns_board_id ON task_columns(board_id);
      CREATE INDEX IF NOT EXISTS idx_task_columns_board_pos ON task_columns(board_id, pos);

      CREATE TABLE IF NOT EXISTS task_cards (
        id VARCHAR(255) PRIMARY KEY,
        board_id VARCHAR(255) NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
        column_id VARCHAR(255) NOT NULL REFERENCES task_columns(id) ON DELETE CASCADE,
        title VARCHAR(300) NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        pos DOUBLE PRECISION NOT NULL DEFAULT 0,
        priority INTEGER NULL,
        assignee_agent_id VARCHAR(255) NULL REFERENCES agents(id) ON DELETE SET NULL,
        assignee_user_id VARCHAR(255) NULL REFERENCES users(id) ON DELETE SET NULL,
        archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_task_cards_board_id ON task_cards(board_id);
      CREATE INDEX IF NOT EXISTS idx_task_cards_column_id ON task_cards(column_id);
      CREATE INDEX IF NOT EXISTS idx_task_cards_board_archived ON task_cards(board_id, archived);
      CREATE INDEX IF NOT EXISTS idx_task_cards_column_pos ON task_cards(column_id, pos);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('DROP TABLE IF EXISTS task_cards CASCADE;');
    await client.query('DROP TABLE IF EXISTS task_columns CASCADE;');
    await client.query('DROP TABLE IF EXISTS task_boards CASCADE;');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

