import type { Client } from 'pg';

type MigrationConn = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
  transaction?: <T>(
    callback: (tx: { query: (text: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>
  ) => Promise<T>;
};

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object') {
    const maybe = result as { rows?: unknown };
    if (Array.isArray(maybe.rows)) return maybe.rows as T[];
  }
  return [];
}

function makeQueryRows(conn: MigrationConn) {
  return async function queryRows<T>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await conn.query(text, params);
    return extractRows<T>(result);
  };
}

async function withMigrationConn(conn: MigrationConn, fn: (c: MigrationConn) => Promise<void>): Promise<void> {
  if (typeof conn.transaction === 'function') {
    await conn.transaction(async (tx) => {
      // IMPORTANT: don't pass an unbound method reference; pg's Client#query relies on `this`.
      await fn({ query: (text, params) => tx.query(text, params) });
    });
    return;
  }

  await conn.query('BEGIN');
  try {
    await fn(conn);
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  }
  await conn.query('COMMIT');
}

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
  const conn = client as unknown as MigrationConn;
  await withMigrationConn(conn, async (c) => {
    const q = makeQueryRows(c);
    const exec = async (text: string, params: unknown[] = []): Promise<void> => {
      await c.query(text, params);
    };

    const tableExists = async (name: string): Promise<boolean> => {
      const rows = await q<{ exists: boolean }>(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      return Boolean(rows?.[0]?.exists);
    };

    const indexExists = async (name: string): Promise<boolean> => {
      const rows = await q<{ exists: boolean }>(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      return Boolean(rows?.[0]?.exists);
    };

    const renameTableIfExists = async (from: string, to: string) => {
      if (!(await tableExists(from))) return;
      if (await tableExists(to)) return;
      // Identifiers here are fixed (not user input) but we still quote them defensively.
      await exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      if (!(await indexExists(from))) return;
      if (await indexExists(to)) return;
      await exec(`ALTER INDEX "${from}" RENAME TO "${to}"`);
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
  });
}

export async function down(client: Client): Promise<void> {
  const conn = client as unknown as MigrationConn;
  await withMigrationConn(conn, async (c) => {
    const q = makeQueryRows(c);
    const exec = async (text: string, params: unknown[] = []): Promise<void> => {
      await c.query(text, params);
    };

    const tableExists = async (name: string): Promise<boolean> => {
      const rows = await q<{ exists: boolean }>(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      return Boolean(rows?.[0]?.exists);
    };

    const indexExists = async (name: string): Promise<boolean> => {
      const rows = await q<{ exists: boolean }>(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name]);
      return Boolean(rows?.[0]?.exists);
    };

    const renameTableIfExists = async (from: string, to: string) => {
      if (!(await tableExists(from))) return;
      if (await tableExists(to)) return;
      await exec(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      if (!(await indexExists(from))) return;
      if (await indexExists(to)) return;
      await exec(`ALTER INDEX "${from}" RENAME TO "${to}"`);
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
  });
}

