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
 * Migration 170: Update Starships connector action response schema for room resources.
 *
 * Server `GET /rooms/:roomId/resources` now includes:
 * - participants.users[] (id + slug `u:<userId>` + displayName/avatar/role)
 * - participants.agents[] (id + slug + name)
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

    const actionName = 'get-room-resources';

    // Keep this intentionally permissive; the server response has nested resource shapes.
    const responseSchema = {
      type: 'object',
      additionalProperties: true,
      properties: {
        views: { type: 'array' },
        datasets: { type: 'array' },
        taskBoards: { type: 'array' },
        tools: { type: 'array' },
        participants: {
          type: 'object',
          additionalProperties: false,
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'slug'],
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string', description: 'User slug in `u:<userId>` format' },
                  displayName: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  avatar: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                  role: { anyOf: [{ type: 'string' }, { type: 'null' }] },
                },
              },
            },
            agents: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'slug', 'name'],
                properties: {
                  id: { type: 'string' },
                  slug: { type: 'string' },
                  name: { type: 'string' },
                },
              },
            },
          },
          required: ['users', 'agents'],
        },
      },
    } as const;

    // Update runtime action row (source of truth)
    await client.query(
      `UPDATE connector_template_actions
          SET response_json = $1,
              updated_at = NOW()
        WHERE template_id = $2
          AND action_name = $3;`,
      [responseSchema, templateId, actionName]
    );

    // Update legacy/admin-visible endpoints_json (best-effort)
    const nextLegacy = legacyEndpoints.map((e) => {
      if (String(e?.name || '') !== actionName) return e;
      return { ...(e as Endpoint), response: responseSchema };
    });

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
  // Non-reversible: response schemas are best-effort metadata only.
  await client.query('BEGIN');
  await client.query('COMMIT');
}

