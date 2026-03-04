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
 * Migration 167:
 * Remove deprecated Starships connector actions for room "agent pins" and "tool pins".
 *
 * Server no longer supports these routes:
 * - GET /rooms/:roomId/pins/agents
 * - POST/DELETE /rooms/:roomId/pins/agents...
 * - GET /rooms/:roomId/pins/tools
 * - POST/DELETE /rooms/:roomId/pins/tools...
 *
 * Tools are now handled via room tool assignments:
 * - GET/POST /rooms/:roomId/tools
 * - DELETE /rooms/:roomId/tools/:toolId
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

    const REMOVE_ACTIONS = [
      // Agent pins (feature removed)
      'get-room-pinned-agents',
      'pin-room-agent',
      'unpin-room-agent',
      'reorder-room-pins-agents',

      // Tool pins (replaced by assignments)
      'get-room-pinned-tools',
      'pin-room-tool',
      'unpin-room-tool',
      'reorder-room-pins-tools',
    ] as const;

    // Remove runtime action rows (source of truth)
    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      [...REMOVE_ACTIONS] as unknown as string[],
    ]);

    // Prune legacy/admin-visible endpoints_json (best-effort)
    const blocked = new Set<string>(REMOVE_ACTIONS as unknown as string[]);
    const nextLegacy = legacyEndpoints
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0)
      .filter((e) => !blocked.has(String(e.name)));

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
  // Non-reversible: these endpoints are deprecated and should not be reintroduced.
  await client.query('BEGIN');
  await client.query('COMMIT');
}

