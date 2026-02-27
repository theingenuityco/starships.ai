type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

type ActionEndpoint = Endpoint & {
  description?: string;
  method?: string;
  path?: string;
  timeoutMs?: number;
  requestStyle?: string;
  parameters?: unknown;
  mapping?: unknown;
  response?: unknown;
  baseUrlOverride?: string | null;
};

const ACTION_NAMES = [
  'get-task-board',
  'update-task-board',
  'archive-task-board',
  'create-task-column',
  'list-task-cards',
  'create-task-card',
] as const;

/**
 * Migration 146: Update Starships connector task board/card actions to accept board slugs.
 *
 * The server now supports starship-scoped routes:
 * - /starships/{starshipId}/task-boards/{boardIdOrSlug}
 * - /starships/{starshipId}/task-boards/{boardIdOrSlug}/cards
 * - /starships/{starshipId}/task-boards/{boardIdOrSlug}/columns
 *
 * We update connector_template_actions (and endpoints_json best-effort) so agents can pass:
 * - boardSlug (preferred), OR boardId (legacy)
 * - starshipId (optional; falls back to runtimeEnv.STARSHIP_ID)
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

    const updated: ActionEndpoint[] = [
      {
        name: 'get-task-board',
        description: 'Get a task board with its columns (by id or slug)',
        method: 'GET',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'update-task-board',
        description: 'Update a task board (by id or slug)',
        method: 'PATCH',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            pos: { type: 'number' },
            archived: { type: 'boolean' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            slug: '{{ args.slug }}',
            description: '{{ args.description }}',
            pos: '{{ args.pos }}',
            archived: '{{ args.archived }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'archive-task-board',
        description: 'Archive a task board (soft-delete) (by id or slug)',
        method: 'DELETE',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'create-task-column',
        description: 'Create a column in a task board (by id or slug)',
        method: 'POST',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}/columns',
        parameters: {
          type: 'object',
          required: ['starshipId', 'title'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
            title: { type: 'string' },
            key: { type: ['string', 'null'] },
            pos: { type: 'number' },
            wipLimit: { type: ['number', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
          body: {
            title: '{{ args.title }}',
            key: '{{ args.key }}',
            pos: '{{ args.pos }}',
            wipLimit: '{{ args.wipLimit }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'list-task-cards',
        description: 'List cards for a task board (by id or slug)',
        method: 'GET',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}/cards',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
            includeArchived: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
          query: {
            includeArchived: '{{ args.includeArchived == null ? "" : String(args.includeArchived) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-task-card',
        description: 'Create a card in a task board (by id or slug)',
        method: 'POST',
        path: '/starships/{starshipId}/task-boards/{boardIdOrSlug}/cards',
        parameters: {
          type: 'object',
          required: ['starshipId', 'columnId', 'title'],
          properties: {
            starshipId: { type: 'string' },
            boardId: { type: 'string' },
            boardSlug: { type: 'string' },
            id: { type: 'string' },
            columnId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            pos: { type: 'number' },
            priority: { type: ['number', 'null'] },
            assigneeAgentId: { type: ['string', 'null'] },
            assigneeUserId: { type: ['string', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
            boardIdOrSlug: '{{ String(args.boardSlug ?? args.boardId ?? args.id ?? "") }}',
          },
          body: {
            columnId: '{{ args.columnId }}',
            title: '{{ args.title }}',
            description: '{{ args.description }}',
            pos: '{{ args.pos }}',
            priority: '{{ args.priority }}',
            assigneeAgentId: '{{ args.assigneeAgentId }}',
            assigneeUserId: '{{ args.assigneeUserId }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
    ];

    // Update runtime action rows (by action_name).
    for (const e of updated) {
      const name = String(e.name);
      await client.query(
        `
          UPDATE connector_template_actions
             SET method = $1,
                 path = $2,
                 description = $3,
                 timeout_ms = $4,
                 request_style = $5,
                 parameters_json = $6,
                 mapping_json = $7,
                 updated_at = NOW()
           WHERE template_id = $8
             AND action_name = $9;
        `,
        [
          String(e.method || '').trim().toUpperCase(),
          String(e.path || '').trim(),
          (e.description ?? null) as string | null,
          (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
          e.requestStyle ?? null,
          e.parameters ?? null,
          e.mapping ?? null,
          templateId,
          name,
        ]
      );
    }

    // Keep legacy endpoints_json best-effort in sync.
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    for (const e of updated) byName.set(e.name, e);

    const nextLegacy: Endpoint[] = legacyEndpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    for (const name of ACTION_NAMES) {
      if (!nextLegacy.some((e) => e?.name === name)) {
        const e = updated.find((x) => x.name === name);
        if (e) nextLegacy.push(e);
      }
    }

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
  await client.query('BEGIN');
  try {
    // Best-effort: revert paths back to id-only (as in migration 142).
    // We do not attempt to perfectly restore prior JSON blobs beyond the key fields.
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const templateId = String(rows[0].id);

    const revertByName: Record<string, { path: string; method: string }> = {
      'get-task-board': { method: 'GET', path: '/task-boards/{boardId}' },
      'update-task-board': { method: 'PATCH', path: '/task-boards/{boardId}' },
      'archive-task-board': { method: 'DELETE', path: '/task-boards/{boardId}' },
      'create-task-column': { method: 'POST', path: '/task-boards/{boardId}/columns' },
      'list-task-cards': { method: 'GET', path: '/task-boards/{boardId}/cards' },
      'create-task-card': { method: 'POST', path: '/task-boards/{boardId}/cards' },
    };

    for (const name of ACTION_NAMES) {
      const r = revertByName[name];
      await client.query(
        `
          UPDATE connector_template_actions
             SET method = $1,
                 path = $2,
                 updated_at = NOW()
           WHERE template_id = $3
             AND action_name = $4;
        `,
        [r.method, r.path, templateId, name]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

