type DbClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

function toRows<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object' && Array.isArray((res as { rows?: unknown[] }).rows)) return (res as { rows: T[] }).rows;
  return [];
}

type Endpoint = Record<string, unknown> & { name: string };

const ACTION_NAMES = [
  'list-task-boards',
  'create-task-board',
  'get-task-board',
  'update-task-board',
  'archive-task-board',
  'create-task-column',
  'update-task-column',
  'delete-task-column',
  'list-task-cards',
  'create-task-card',
  'update-task-card',
  'move-task-card',
  'archive-task-card',
] as const;

/**
 * Migration 142: Add Starships connector actions for task boards (kanban).
 *
 * Source of truth: connector_template_actions rows.
 * Also sync connector_templates.endpoints_json best-effort for legacy/admin visibility.
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

    const newEndpoints: Endpoint[] = [
      {
        name: 'list-task-boards',
        description: 'List task boards for a starship',
        method: 'GET',
        path: '/starships/{starshipId}/task-boards',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
            includeArchived: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          query: {
            includeArchived: '{{ args.includeArchived == null ? "" : String(args.includeArchived) }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'create-task-board',
        description: 'Create a task board for a starship',
        method: 'POST',
        path: '/starships/{starshipId}/task-boards',
        parameters: {
          type: 'object',
          required: ['starshipId', 'name'],
          properties: {
            starshipId: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            description: { type: 'string' },
            pos: { type: 'number' },
            createDefaultColumns: { type: 'boolean' },
            columns: { type: 'array' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            slug: '{{ args.slug }}',
            description: '{{ args.description }}',
            pos: '{{ args.pos }}',
            createDefaultColumns: '{{ args.createDefaultColumns }}',
            columns: '{{ args.columns }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'get-task-board',
        description: 'Get a task board with its columns',
        method: 'GET',
        path: '/task-boards/{boardId}',
        parameters: {
          type: 'object',
          required: ['boardId'],
          properties: {
            boardId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 5000,
      },
      {
        name: 'update-task-board',
        description: 'Update a task board',
        method: 'PATCH',
        path: '/task-boards/{boardId}',
        parameters: {
          type: 'object',
          required: ['boardId'],
          properties: {
            boardId: { type: 'string' },
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
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
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
        description: 'Archive a task board (soft-delete)',
        method: 'DELETE',
        path: '/task-boards/{boardId}',
        parameters: {
          type: 'object',
          required: ['boardId'],
          properties: {
            boardId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },

      // Columns
      {
        name: 'create-task-column',
        description: 'Create a column in a task board',
        method: 'POST',
        path: '/task-boards/{boardId}/columns',
        parameters: {
          type: 'object',
          required: ['boardId', 'title'],
          properties: {
            boardId: { type: 'string' },
            title: { type: 'string' },
            key: { type: ['string', 'null'] },
            pos: { type: 'number' },
            wipLimit: { type: ['number', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
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
        name: 'update-task-column',
        description: 'Update a task column',
        method: 'PATCH',
        path: '/task-columns/{columnId}',
        parameters: {
          type: 'object',
          required: ['columnId'],
          properties: {
            columnId: { type: 'string' },
            title: { type: 'string' },
            key: { type: ['string', 'null'] },
            pos: { type: 'number' },
            wipLimit: { type: ['number', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            columnId: '{{ String(args.columnId ?? args.id ?? "") }}',
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
        name: 'delete-task-column',
        description: 'Delete a task column',
        method: 'DELETE',
        path: '/task-columns/{columnId}',
        parameters: {
          type: 'object',
          required: ['columnId'],
          properties: {
            columnId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            columnId: '{{ String(args.columnId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },

      // Cards
      {
        name: 'list-task-cards',
        description: 'List cards for a task board',
        method: 'GET',
        path: '/task-boards/{boardId}/cards',
        parameters: {
          type: 'object',
          required: ['boardId'],
          properties: {
            boardId: { type: 'string' },
            includeArchived: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
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
        description: 'Create a card in a task board',
        method: 'POST',
        path: '/task-boards/{boardId}/cards',
        parameters: {
          type: 'object',
          required: ['boardId', 'columnId', 'title'],
          properties: {
            boardId: { type: 'string' },
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
            boardId: '{{ String(args.boardId ?? args.id ?? "") }}',
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
      {
        name: 'update-task-card',
        description: 'Update a task card',
        method: 'PATCH',
        path: '/task-cards/{cardId}',
        parameters: {
          type: 'object',
          required: ['cardId'],
          properties: {
            cardId: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            pos: { type: 'number' },
            priority: { type: ['number', 'null'] },
            assigneeAgentId: { type: ['string', 'null'] },
            assigneeUserId: { type: ['string', 'null'] },
            archived: { type: 'boolean' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            cardId: '{{ String(args.cardId ?? args.id ?? "") }}',
          },
          body: {
            title: '{{ args.title }}',
            description: '{{ args.description }}',
            pos: '{{ args.pos }}',
            priority: '{{ args.priority }}',
            assigneeAgentId: '{{ args.assigneeAgentId }}',
            assigneeUserId: '{{ args.assigneeUserId }}',
            archived: '{{ args.archived }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'move-task-card',
        description: 'Move a task card to a new column/position',
        method: 'POST',
        path: '/task-cards/{cardId}/move',
        parameters: {
          type: 'object',
          required: ['cardId', 'toColumnId'],
          properties: {
            cardId: { type: 'string' },
            toColumnId: { type: 'string' },
            toPos: { type: 'number' },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            cardId: '{{ String(args.cardId ?? args.id ?? "") }}',
          },
          body: {
            toColumnId: '{{ args.toColumnId }}',
            toPos: '{{ args.toPos }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },
      {
        name: 'archive-task-card',
        description: 'Archive a task card (soft-delete)',
        method: 'DELETE',
        path: '/task-cards/{cardId}',
        parameters: {
          type: 'object',
          required: ['cardId'],
          properties: {
            cardId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            cardId: '{{ String(args.cardId ?? args.id ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
    ];

    // Upsert runtime action rows
    const existingRes = await client.query(
      `SELECT action_name, ordinal FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`,
      [templateId, ACTION_NAMES as unknown as string[]]
    );
    const existingRows = toRows<{ action_name: string; ordinal: number }>(existingRes);
    const existingOrdinalByName = new Map(existingRows.map((r) => [String(r.action_name), Number(r.ordinal)]));

    const maxRes = await client.query(`SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal FROM connector_template_actions WHERE template_id = $1;`, [
      templateId,
    ]);
    const maxRows = toRows<{ max_ordinal: number | string | null }>(maxRes);
    const maxOrdinalRaw = maxRows[0]?.max_ordinal ?? -1;
    const baseMaxOrdinal = typeof maxOrdinalRaw === 'number' ? maxOrdinalRaw : Number(maxOrdinalRaw ?? -1);
    let nextOrdinal = Number.isFinite(baseMaxOrdinal) ? baseMaxOrdinal : -1;

    for (const e of newEndpoints) {
      const name = String(e.name);
      const ordinal =
        existingOrdinalByName.has(name) && Number.isFinite(existingOrdinalByName.get(name) as number)
          ? (existingOrdinalByName.get(name) as number)
          : ++nextOrdinal;

      const id = `${templateId}:${name}`;
      const method = String(e.method || '').trim().toUpperCase();
      const path = String(e.path || '').trim();

      await client.query(
        `
          INSERT INTO connector_template_actions (
            id,
            template_id,
            action_name,
            ordinal,
            method,
            path,
            description,
            base_url_override,
            timeout_ms,
            request_style,
            parameters_json,
            mapping_json,
            response_json,
            created_at,
            updated_at
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
          ON CONFLICT (id) DO UPDATE SET
            ordinal = EXCLUDED.ordinal,
            method = EXCLUDED.method,
            path = EXCLUDED.path,
            description = EXCLUDED.description,
            base_url_override = EXCLUDED.base_url_override,
            timeout_ms = EXCLUDED.timeout_ms,
            request_style = EXCLUDED.request_style,
            parameters_json = EXCLUDED.parameters_json,
            mapping_json = EXCLUDED.mapping_json,
            response_json = EXCLUDED.response_json,
            updated_at = NOW()
        `,
        [
          id,
          templateId,
          name,
          ordinal,
          method,
          path,
          (e.description ?? null) as string | null,
          (e.baseUrlOverride ?? null) as string | null,
          (typeof e.timeoutMs === 'number' ? Math.floor(e.timeoutMs) : null) as number | null,
          (e.requestStyle ?? null) as string | null,
          (e.parameters ?? null) as unknown | null,
          (e.mapping ?? null) as unknown | null,
          (e.response ?? null) as unknown | null,
        ]
      );
    }

    // Keep legacy endpoints_json best-effort in sync
    const byName = new Map(legacyEndpoints.map((e) => [String(e?.name || ''), e]));
    for (const e of newEndpoints) byName.set(e.name, e);

    const nextLegacy: Endpoint[] = legacyEndpoints
      .map((e) => {
        const name = String(e?.name || '');
        return byName.get(name) ?? e;
      })
      .filter((e) => e && typeof e.name === 'string' && e.name.trim().length > 0);

    for (const name of ACTION_NAMES) {
      if (!nextLegacy.some((e) => e?.name === name)) {
        const e = newEndpoints.find((x) => x.name === name);
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
    const res = await client.query(`SELECT id, endpoints_json FROM connector_templates WHERE provider = 'starships' LIMIT 1;`);
    const rows = toRows<{ id: string; endpoints_json: unknown }>(res);
    if (!rows.length) {
      await client.query('COMMIT');
      return;
    }

    const templateId = String(rows[0].id);
    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      ACTION_NAMES as unknown as string[],
    ]);

    const legacyEndpoints: Endpoint[] = Array.isArray(rows[0].endpoints_json) ? (rows[0].endpoints_json as Endpoint[]) : [];
    const nameSet = new Set<string>(ACTION_NAMES as unknown as string[]);
    const nextLegacy = legacyEndpoints.filter((e) => {
      const name = typeof e?.name === 'string' ? e.name : '';
      return !nameSet.has(name);
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

