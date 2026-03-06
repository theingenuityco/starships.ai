import type { Client } from 'pg';

type AnyResult = { rows?: unknown };

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const anyRes = result as AnyResult;
  return Array.isArray(anyRes?.rows) ? (anyRes.rows as T[]) : [];
}

function qi(ident: string): string {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

async function regclassExists(client: Client, qualifiedName: string): Promise<boolean> {
  const res = await client.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [qualifiedName]);
  const rows = getRows<{ exists: boolean }>(res);
  return Boolean(rows?.[0]?.exists);
}

async function listSchemasForTable(client: Client, tableName: string): Promise<string[]> {
  const res = await client.query<{ schema: string }>(
    `
    SELECT n.nspname AS schema
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = $1
       AND c.relkind IN ('r', 'p')
     ORDER BY (n.nspname = 'public') DESC, n.nspname ASC
    `,
    [tableName]
  );
  const rows = getRows<{ schema: string }>(res);
  return rows.map((r) => String(r.schema)).filter(Boolean);
}

/**
 * Migration 175: Repair room pin join tables + room tool assignments table.
 *
 * This is a consolidated "safety net" for installations where the original rename migration (155)
 * didn't apply to the same schema/database that the server is using.
 *
 * Ensures the current code's expected tables exist:
 * - room_views, room_datasets, room_task_boards
 * - room_tools (room-level tool assignments)
 *
 * Notes:
 * - Room pinned agents were removed in migration 161; we intentionally do NOT recreate/rename those.
 * - This migration is idempotent and "public-first": it ensures the server-visible (default) schema is correct.
 */
export async function up(client: Client): Promise<void> {
  // ---------------------------------------------------------------------------
  // Best-effort renames (migration 155 intent) in `public`.
  // ---------------------------------------------------------------------------
  if ((await regclassExists(client, 'public.room_pinned_views')) && !(await regclassExists(client, 'public.room_views'))) {
    await client.query(`ALTER TABLE public.${qi('room_pinned_views')} RENAME TO ${qi('room_views')}`);
  }
  if ((await regclassExists(client, 'public.room_pinned_datasets')) && !(await regclassExists(client, 'public.room_datasets'))) {
    await client.query(`ALTER TABLE public.${qi('room_pinned_datasets')} RENAME TO ${qi('room_datasets')}`);
  }
  if (
    (await regclassExists(client, 'public.room_pinned_task_boards')) &&
    !(await regclassExists(client, 'public.room_task_boards'))
  ) {
    await client.query(`ALTER TABLE public.${qi('room_pinned_task_boards')} RENAME TO ${qi('room_task_boards')}`);
  }
  if ((await regclassExists(client, 'public.room_pinned_tools')) && !(await regclassExists(client, 'public.room_tools'))) {
    await client.query(`ALTER TABLE public.${qi('room_pinned_tools')} RENAME TO ${qi('room_tools')}`);
  }

  if ((await regclassExists(client, 'public.idx_room_pinned_views_room')) && !(await regclassExists(client, 'public.idx_room_views_room'))) {
    await client.query(`ALTER INDEX public.${qi('idx_room_pinned_views_room')} RENAME TO ${qi('idx_room_views_room')}`);
  }
  if (
    (await regclassExists(client, 'public.uq_room_pinned_views_room_position')) &&
    !(await regclassExists(client, 'public.uq_room_views_room_position'))
  ) {
    await client.query(
      `ALTER INDEX public.${qi('uq_room_pinned_views_room_position')} RENAME TO ${qi('uq_room_views_room_position')}`
    );
  }

  if (
    (await regclassExists(client, 'public.idx_room_pinned_datasets_room')) &&
    !(await regclassExists(client, 'public.idx_room_datasets_room'))
  ) {
    await client.query(`ALTER INDEX public.${qi('idx_room_pinned_datasets_room')} RENAME TO ${qi('idx_room_datasets_room')}`);
  }
  if (
    (await regclassExists(client, 'public.uq_room_pinned_datasets_room_position')) &&
    !(await regclassExists(client, 'public.uq_room_datasets_room_position'))
  ) {
    await client.query(
      `ALTER INDEX public.${qi('uq_room_pinned_datasets_room_position')} RENAME TO ${qi('uq_room_datasets_room_position')}`
    );
  }

  if (
    (await regclassExists(client, 'public.idx_room_pinned_task_boards_room')) &&
    !(await regclassExists(client, 'public.idx_room_task_boards_room'))
  ) {
    await client.query(
      `ALTER INDEX public.${qi('idx_room_pinned_task_boards_room')} RENAME TO ${qi('idx_room_task_boards_room')}`
    );
  }
  if (
    (await regclassExists(client, 'public.uq_room_pinned_task_boards_room_position')) &&
    !(await regclassExists(client, 'public.uq_room_task_boards_room_position'))
  ) {
    await client.query(
      `ALTER INDEX public.${qi('uq_room_pinned_task_boards_room_position')} RENAME TO ${qi('uq_room_task_boards_room_position')}`
    );
  }

  if ((await regclassExists(client, 'public.idx_room_pinned_tools_room')) && !(await regclassExists(client, 'public.idx_room_tools_room'))) {
    await client.query(`ALTER INDEX public.${qi('idx_room_pinned_tools_room')} RENAME TO ${qi('idx_room_tools_room')}`);
  }
  if (
    (await regclassExists(client, 'public.uq_room_pinned_tools_room_position')) &&
    !(await regclassExists(client, 'public.uq_room_tools_room_position'))
  ) {
    await client.query(
      `ALTER INDEX public.${qi('uq_room_pinned_tools_room_position')} RENAME TO ${qi('uq_room_tools_room_position')}`
    );
  }

  // ---------------------------------------------------------------------------
  // Ensure room pin join tables exist with the expected schema.
  // ---------------------------------------------------------------------------
  if (!(await regclassExists(client, 'public.room_views'))) {
    await client.query(`
    CREATE TABLE public.room_views (
      room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
      view_id VARCHAR(255) NOT NULL REFERENCES views(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_by VARCHAR(255) NULL,
      PRIMARY KEY (room_conversation_id, view_id)
    );
  `);
  }
  await client.query(`CREATE INDEX IF NOT EXISTS idx_room_views_room ON public.room_views(room_conversation_id);`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_room_views_room_position ON public.room_views(room_conversation_id, position);`);

  if (!(await regclassExists(client, 'public.room_datasets'))) {
    await client.query(`
    CREATE TABLE public.room_datasets (
      room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
      dataset_id VARCHAR(255) NOT NULL REFERENCES starship_datasets(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_by VARCHAR(255) NULL,
      PRIMARY KEY (room_conversation_id, dataset_id)
    );
  `);
  }
  await client.query(`CREATE INDEX IF NOT EXISTS idx_room_datasets_room ON public.room_datasets(room_conversation_id);`);
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_datasets_room_position ON public.room_datasets(room_conversation_id, position);`
  );

  if (!(await regclassExists(client, 'public.room_task_boards'))) {
    await client.query(`
    CREATE TABLE public.room_task_boards (
      room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
      board_id VARCHAR(255) NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      created_by VARCHAR(255) NULL,
      PRIMARY KEY (room_conversation_id, board_id)
    );
  `);
  }
  await client.query(`CREATE INDEX IF NOT EXISTS idx_room_task_boards_room ON public.room_task_boards(room_conversation_id);`);
  await client.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_room_task_boards_room_position ON public.room_task_boards(room_conversation_id, position);`
  );

  // ---------------------------------------------------------------------------
  // Ensure room_tools exists in its current (assignment) form and matches repository expectations.
  // ---------------------------------------------------------------------------
  if (!(await regclassExists(client, 'public.room_tools'))) {
    await client.query(`
    CREATE TABLE public.room_tools (
      room_conversation_id VARCHAR(255) NOT NULL REFERENCES rooms(conversation_id) ON DELETE CASCADE,
      tool_id VARCHAR(255) NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
      permission VARCHAR(10) NOT NULL DEFAULT 'allow' CHECK (permission IN ('allow', 'ask', 'deny')),
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      PRIMARY KEY (room_conversation_id, tool_id)
    );
  `);
  }

  // If this table came from a pinned schema, bring it forward to "assignment" semantics.
  await client.query(`DROP INDEX IF EXISTS public.uq_room_tools_room_position;`);
  await client.query(`ALTER TABLE public.room_tools ADD COLUMN IF NOT EXISTS permission VARCHAR(10) NOT NULL DEFAULT 'allow';`);
  await client.query(`ALTER TABLE public.room_tools ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();`);
  await client.query(`UPDATE public.room_tools SET updated_at = COALESCE(updated_at, created_at, NOW());`);
  await client.query(`ALTER TABLE public.room_tools DROP COLUMN IF EXISTS position, DROP COLUMN IF EXISTS created_by;`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_room_tools_room ON public.room_tools(room_conversation_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_room_tools_room_permission ON public.room_tools(room_conversation_id, permission);`);

  // ---------------------------------------------------------------------------
  // Best-effort backfill from non-public schemas (if present).
  // ---------------------------------------------------------------------------
  // Room pins
  for (const schema of new Set([
    ...(await listSchemasForTable(client, 'room_pinned_views')),
    ...(await listSchemasForTable(client, 'room_views')),
  ])) {
    if (!schema || schema === 'public') continue;
    const src = await regclassExists(client, `${schema}.room_views`) ? 'room_views' : 'room_pinned_views';
    if (!(await regclassExists(client, `${schema}.${src}`))) continue;
    await client.query(
      `INSERT INTO public.room_views (room_conversation_id, view_id, position, created_at, created_by)
       SELECT room_conversation_id, view_id, position, created_at, created_by
         FROM ${qi(schema)}.${qi(src)}
       ON CONFLICT (room_conversation_id, view_id) DO NOTHING`
    );
  }
  for (const schema of new Set([
    ...(await listSchemasForTable(client, 'room_pinned_datasets')),
    ...(await listSchemasForTable(client, 'room_datasets')),
  ])) {
    if (!schema || schema === 'public') continue;
    const src = await regclassExists(client, `${schema}.room_datasets`) ? 'room_datasets' : 'room_pinned_datasets';
    if (!(await regclassExists(client, `${schema}.${src}`))) continue;
    await client.query(
      `INSERT INTO public.room_datasets (room_conversation_id, dataset_id, position, created_at, created_by)
       SELECT room_conversation_id, dataset_id, position, created_at, created_by
         FROM ${qi(schema)}.${qi(src)}
       ON CONFLICT (room_conversation_id, dataset_id) DO NOTHING`
    );
  }
  for (const schema of new Set([
    ...(await listSchemasForTable(client, 'room_pinned_task_boards')),
    ...(await listSchemasForTable(client, 'room_task_boards')),
  ])) {
    if (!schema || schema === 'public') continue;
    const src = await regclassExists(client, `${schema}.room_task_boards`) ? 'room_task_boards' : 'room_pinned_task_boards';
    if (!(await regclassExists(client, `${schema}.${src}`))) continue;
    await client.query(
      `INSERT INTO public.room_task_boards (room_conversation_id, board_id, position, created_at, created_by)
       SELECT room_conversation_id, board_id, position, created_at, created_by
         FROM ${qi(schema)}.${qi(src)}
       ON CONFLICT (room_conversation_id, board_id) DO NOTHING`
    );
  }

  // Room tool assignments
  for (const schema of new Set([
    ...(await listSchemasForTable(client, 'room_pinned_tools')),
    ...(await listSchemasForTable(client, 'room_tools')),
  ])) {
    if (!schema || schema === 'public') continue;
    const src = await regclassExists(client, `${schema}.room_tools`) ? 'room_tools' : 'room_pinned_tools';
    if (!(await regclassExists(client, `${schema}.${src}`))) continue;
    // Older pinned schema doesn't have (permission, updated_at). Default to 'allow' and mirror timestamps.
    const hasPermission = await client
      .query<{ ok: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = $1
             AND table_name = $2
             AND column_name = 'permission'
        ) AS ok
        `,
        [schema, src]
      )
      .then((r) => Boolean(getRows<{ ok: boolean }>(r)[0]?.ok));
    const hasUpdatedAt = await client
      .query<{ ok: boolean }>(
        `
        SELECT EXISTS (
          SELECT 1
            FROM information_schema.columns
           WHERE table_schema = $1
             AND table_name = $2
             AND column_name = 'updated_at'
        ) AS ok
        `,
        [schema, src]
      )
      .then((r) => Boolean(getRows<{ ok: boolean }>(r)[0]?.ok));

    const permissionExpr = hasPermission ? 'permission' : `'allow'::varchar`;
    const updatedAtExpr = hasUpdatedAt ? 'updated_at' : 'created_at';

    await client.query(
      `INSERT INTO public.room_tools (room_conversation_id, tool_id, permission, created_at, updated_at)
       SELECT room_conversation_id, tool_id, ${permissionExpr}, created_at, ${updatedAtExpr}
         FROM ${qi(schema)}.${qi(src)}
       ON CONFLICT (room_conversation_id, tool_id) DO NOTHING`
    );
  }
}

export async function down(client: Client): Promise<void> {
  // No-op: this migration is a best-effort repair for drifted installations.
  void client;
}

