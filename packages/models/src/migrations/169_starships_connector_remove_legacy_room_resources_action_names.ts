type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

/**
 * Migration 169: Remove legacy Starships connector action names for room resources.
 *
 * Legacy names to remove:
 * - get-room-pinned-resources  (renamed to get-room-resources)
 * - get-room-pinned-views      (renamed to get-room-pins-views)
 * - get-room-pinned-datasets   (renamed to get-room-pins-datasets)
 * - get-room-pinned-task-boards(renamed to get-room-pins-task-boards)
 *
 * This migration intentionally provides NO backward-compat aliases.
 */
export async function up(client: DbClient): Promise<void> {
  await client.query('BEGIN');
  try {
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const row = rows[0];
    const templateId = String(row.id);
    const legacyEndpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];

    const LEGACY = [
      'get-room-pinned-resources',
      'get-room-pinned-views',
      'get-room-pinned-datasets',
      'get-room-pinned-task-boards',
    ] as const;

    // Remove runtime action rows (source of truth)
    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      [...LEGACY] as unknown as string[],
    ]);

    // Prune legacy/admin-visible endpoints_json (best-effort)
    const removeSet = new Set<string>(LEGACY as unknown as string[]);
    const nextLegacy = legacyEndpoints
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0)
      .filter((e) => !removeSet.has(String(e.name)));

    await client.query(`UPDATE connector_templates SET endpoints_json = $1::jsonb, updated_at = NOW() WHERE id = $2;`, [
      JSON.stringify(nextLegacy),
      templateId,
    ]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export async function down(client: DbClient): Promise<void> {
  // Non-reversible: we intentionally do not re-add legacy names.
  await client.query('BEGIN');
  await client.query('COMMIT');
}

