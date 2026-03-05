import type { Client } from 'pg';

/**
 * Migration 148: Enforce unique task column titles per board.
 *
 * Uniqueness is case-insensitive and ignores leading/trailing whitespace:
 *   UNIQUE (board_id, lower(btrim(title)))
 *
 * Notes:
 * - Does NOT mutate existing data; fails fast if duplicates exist.
 */
export async function up(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    // Fail-fast if any board has duplicate normalized titles.
    await client.query(`
      DO $$
      DECLARE
        dup_count integer;
      BEGIN
        SELECT count(*) INTO dup_count
          FROM (
            SELECT board_id, lower(btrim(title)) AS norm, count(*) AS c
              FROM task_columns
             GROUP BY board_id, lower(btrim(title))
            HAVING count(*) > 1
          ) d;

        IF dup_count > 0 THEN
          RAISE EXCEPTION 'Cannot add unique task column title constraint: % board(s) have duplicate column titles (case-insensitive, trimmed). Fix task_columns first.', dup_count;
        END IF;
      END $$;
    `);

    // Create unique index (idempotent).
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_task_columns_board_title_norm
        ON task_columns (board_id, lower(btrim(title)));
    `);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

export async function down(client: Client): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(`DROP INDEX IF EXISTS ux_task_columns_board_title_norm;`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
  await client.query('COMMIT');
}

