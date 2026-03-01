import type { Client } from 'pg';

/**
 * Migration 155: Rename room join tables to remove the `pinned` keyword.
 *
 * Renames:
 * - room_pinned_views       -> room_views
 * - room_pinned_datasets    -> room_datasets
 * - room_pinned_task_boards -> room_task_boards
 * - room_pinned_agents      -> room_agents
 * - room_pinned_tools       -> room_tools
 *
 * Also renames the common indexes created by migrations 153/154 where present.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const renameTableIfExists = async (from: string, to: string) => {
      await client.query(
        `
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)
             AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $2) THEN
            EXECUTE format('ALTER TABLE %I RENAME TO %I', $1, $2);
          END IF;
        END $$;
        `,
        [from, to]
      );
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      await client.query(
        `
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = $1)
             AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = $2) THEN
            EXECUTE format('ALTER INDEX %I RENAME TO %I', $1, $2);
          END IF;
        END $$;
        `,
        [from, to]
      );
    };

    await renameTableIfExists('room_pinned_views', 'room_views');
    await renameTableIfExists('room_pinned_datasets', 'room_datasets');
    await renameTableIfExists('room_pinned_task_boards', 'room_task_boards');
    await renameTableIfExists('room_pinned_agents', 'room_agents');
    await renameTableIfExists('room_pinned_tools', 'room_tools');

    // Indexes from migration 153
    await renameIndexIfExists('idx_room_pinned_views_room', 'idx_room_views_room');
    await renameIndexIfExists('uq_room_pinned_views_room_position', 'uq_room_views_room_position');

    await renameIndexIfExists('idx_room_pinned_datasets_room', 'idx_room_datasets_room');
    await renameIndexIfExists('uq_room_pinned_datasets_room_position', 'uq_room_datasets_room_position');

    await renameIndexIfExists('idx_room_pinned_task_boards_room', 'idx_room_task_boards_room');
    await renameIndexIfExists('uq_room_pinned_task_boards_room_position', 'uq_room_task_boards_room_position');

    // Indexes from migration 154
    await renameIndexIfExists('idx_room_pinned_agents_room', 'idx_room_agents_room');
    await renameIndexIfExists('uq_room_pinned_agents_room_position', 'uq_room_agents_room_position');

    await renameIndexIfExists('idx_room_pinned_tools_room', 'idx_room_tools_room');
    await renameIndexIfExists('uq_room_pinned_tools_room_position', 'uq_room_tools_room_position');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    const renameTableIfExists = async (from: string, to: string) => {
      await client.query(
        `
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)
             AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $2) THEN
            EXECUTE format('ALTER TABLE %I RENAME TO %I', $1, $2);
          END IF;
        END $$;
        `,
        [from, to]
      );
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      await client.query(
        `
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = $1)
             AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'i' AND relname = $2) THEN
            EXECUTE format('ALTER INDEX %I RENAME TO %I', $1, $2);
          END IF;
        END $$;
        `,
        [from, to]
      );
    };

    await renameTableIfExists('room_views', 'room_pinned_views');
    await renameTableIfExists('room_datasets', 'room_pinned_datasets');
    await renameTableIfExists('room_task_boards', 'room_pinned_task_boards');
    await renameTableIfExists('room_agents', 'room_pinned_agents');
    await renameTableIfExists('room_tools', 'room_pinned_tools');

    await renameIndexIfExists('idx_room_views_room', 'idx_room_pinned_views_room');
    await renameIndexIfExists('uq_room_views_room_position', 'uq_room_pinned_views_room_position');

    await renameIndexIfExists('idx_room_datasets_room', 'idx_room_pinned_datasets_room');
    await renameIndexIfExists('uq_room_datasets_room_position', 'uq_room_pinned_datasets_room_position');

    await renameIndexIfExists('idx_room_task_boards_room', 'idx_room_pinned_task_boards_room');
    await renameIndexIfExists('uq_room_task_boards_room_position', 'uq_room_pinned_task_boards_room_position');

    await renameIndexIfExists('idx_room_agents_room', 'idx_room_pinned_agents_room');
    await renameIndexIfExists('uq_room_agents_room_position', 'uq_room_pinned_agents_room_position');

    await renameIndexIfExists('idx_room_tools_room', 'idx_room_pinned_tools_room');
    await renameIndexIfExists('uq_room_tools_room_position', 'uq_room_pinned_tools_room_position');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

