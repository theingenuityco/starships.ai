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
  // NOTE: migrations are executed with our PostgresConnection abstraction,
  // whose `query()` returns rows (T[]) directly (not a pg QueryResult).
  // We keep this helper compatible with both shapes for safety.
  const queryRows = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => {
    const r: any = await (client as any).query(text, params);
    if (Array.isArray(r)) return r as T[];
    if (r && Array.isArray(r.rows)) return r.rows as T[];
    return [];
  };

  const run = async (fn: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<void>) => {
    const anyClient: any = client as any;
    if (typeof anyClient.transaction === 'function') {
      await anyClient.transaction(async (tx: any) => {
        const txQueryRows = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => {
          const rr: any = await tx.query(text, params);
          if (Array.isArray(rr)) return rr as T[];
          if (rr && Array.isArray(rr.rows)) return rr.rows as T[];
          return [];
        };
        await fn(txQueryRows);
      });
      return;
    }
    await (client as any).query('BEGIN');
    try {
      await fn(queryRows);
    } catch (e) {
      await (client as any).query('ROLLBACK');
      throw e;
    }
    await (client as any).query('COMMIT');
  };

  await run(async (q) => {
    const tableExists = async (name: string): Promise<boolean> => {
      const rows = (await q(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name])) as Array<{ exists: boolean }>;
      return Boolean(rows?.[0]?.exists);
    };

    const indexExists = async (name: string): Promise<boolean> => {
      const rows = (await q(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name])) as Array<{ exists: boolean }>;
      return Boolean(rows?.[0]?.exists);
    };

    const renameTableIfExists = async (from: string, to: string) => {
      if (!(await tableExists(from))) return;
      if (await tableExists(to)) return;
      // Identifiers here are fixed (not user input) but we still quote them defensively.
      await (client as any).query(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      if (!(await indexExists(from))) return;
      if (await indexExists(to)) return;
      await (client as any).query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
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
  const queryRows = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => {
    const r: any = await (client as any).query(text, params);
    if (Array.isArray(r)) return r as T[];
    if (r && Array.isArray(r.rows)) return r.rows as T[];
    return [];
  };

  const run = async (fn: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<void>) => {
    const anyClient: any = client as any;
    if (typeof anyClient.transaction === 'function') {
      await anyClient.transaction(async (tx: any) => {
        const txQueryRows = async <T = any>(text: string, params: unknown[] = []): Promise<T[]> => {
          const rr: any = await tx.query(text, params);
          if (Array.isArray(rr)) return rr as T[];
          if (rr && Array.isArray(rr.rows)) return rr.rows as T[];
          return [];
        };
        await fn(txQueryRows);
      });
      return;
    }
    await (client as any).query('BEGIN');
    try {
      await fn(queryRows);
    } catch (e) {
      await (client as any).query('ROLLBACK');
      throw e;
    }
    await (client as any).query('COMMIT');
  };

  await run(async (q) => {
    const tableExists = async (name: string): Promise<boolean> => {
      const rows = (await q(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name])) as Array<{ exists: boolean }>;
      return Boolean(rows?.[0]?.exists);
    };

    const indexExists = async (name: string): Promise<boolean> => {
      const rows = (await q(`SELECT to_regclass('public.' || $1) IS NOT NULL AS exists`, [name])) as Array<{ exists: boolean }>;
      return Boolean(rows?.[0]?.exists);
    };

    const renameTableIfExists = async (from: string, to: string) => {
      if (!(await tableExists(from))) return;
      if (await tableExists(to)) return;
      await (client as any).query(`ALTER TABLE "${from}" RENAME TO "${to}"`);
    };

    const renameIndexIfExists = async (from: string, to: string) => {
      if (!(await indexExists(from))) return;
      if (await indexExists(to)) return;
      await (client as any).query(`ALTER INDEX "${from}" RENAME TO "${to}"`);
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

