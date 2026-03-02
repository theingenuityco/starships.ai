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
  // Rooms CRUD
  'list-rooms',
  'create-room',
  'get-room',
  'update-room',
  'delete-room',

  // Notification level
  'get-room-notification-level',
  'update-room-notification-level',

  // Private membership
  'add-room-member',
  'remove-room-member',

  // Pins
  'get-room-pins',
  'pin-room-agent',
  'unpin-room-agent',
  'pin-room-tool',
  'unpin-room-tool',
  'pin-room-view',
  'unpin-room-view',
  'pin-room-dataset',
  'unpin-room-dataset',
  'pin-room-task-board',
  'unpin-room-task-board',

  // Pin reorder
  'reorder-room-pins-views',
  'reorder-room-pins-datasets',
  'reorder-room-pins-task-boards',
  'reorder-room-pins-agents',
  'reorder-room-pins-tools',
] as const;

/**
 * Migration 160: Add Starships connector actions for rooms endpoints:
 * - Room CRUD
 * - Notification level
 * - Private membership add/remove
 * - Pins list/pin/unpin + reorder per kind
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
      // ---------------------------------------------------------------------
      // Rooms CRUD
      // ---------------------------------------------------------------------
      {
        name: 'list-rooms',
        description: 'List rooms for a starship (visibility-filtered)',
        method: 'GET',
        path: '/starships/{starshipId}/rooms',
        parameters: {
          type: 'object',
          required: ['starshipId'],
          properties: {
            starshipId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'create-room',
        description: 'Create a conversation-backed room within a starship',
        method: 'POST',
        path: '/starships/{starshipId}/rooms',
        parameters: {
          type: 'object',
          required: ['starshipId', 'slug', 'name'],
          properties: {
            starshipId: { type: 'string' },
            slug: { type: 'string' },
            name: { type: 'string' },
            isPrivate: { type: 'boolean' },
            topic: { type: ['string', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            starshipId: '{{ String(args.starshipId ?? runtimeEnv.STARSHIP_ID ?? "") }}',
          },
          body: {
            slug: '{{ String(args.slug ?? "") }}',
            name: '{{ String(args.name ?? "") }}',
            isPrivate: '{{ args.isPrivate }}',
            topic: '{{ args.topic }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'get-room',
        description: 'Get a room by id (roomId is the backing conversation id)',
        method: 'GET',
        path: '/rooms/{roomId}',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'update-room',
        description: 'Update a room by id (roomId is the backing conversation id)',
        method: 'PATCH',
        path: '/rooms/{roomId}',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string' },
            name: { type: 'string' },
            isPrivate: { type: 'boolean' },
            topic: { type: ['string', 'null'] },
          },
          additionalProperties: true,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            name: '{{ args.name }}',
            isPrivate: '{{ args.isPrivate }}',
            topic: '{{ args.topic }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'delete-room',
        description: 'Delete a room by id (deletes the backing conversation)',
        method: 'DELETE',
        path: '/rooms/{roomId}',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      // ---------------------------------------------------------------------
      // Notification level (per-user)
      // ---------------------------------------------------------------------
      {
        name: 'get-room-notification-level',
        description: 'Get your notification level for a room (all/mentions/mute)',
        method: 'GET',
        path: '/rooms/{roomId}/notification-level',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 10000,
      },
      {
        name: 'update-room-notification-level',
        description: 'Update your notification level for a room (all/mentions/mute)',
        method: 'PUT',
        path: '/rooms/{roomId}/notification-level',
        parameters: {
          type: 'object',
          required: ['roomId', 'level'],
          properties: {
            roomId: { type: 'string' },
            level: { type: 'string', enum: ['all', 'mentions', 'mute'] },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            level: '{{ String(args.level ?? "") }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 10000,
      },

      // ---------------------------------------------------------------------
      // Private membership (owner/admin only by server policy)
      // ---------------------------------------------------------------------
      {
        name: 'add-room-member',
        description: 'Add a member to a private room',
        method: 'POST',
        path: '/rooms/{roomId}/members',
        parameters: {
          type: 'object',
          required: ['roomId', 'userId'],
          properties: {
            roomId: { type: 'string' },
            userId: { type: 'string' },
            role: { type: 'string', enum: ['member', 'admin'] },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            userId: '{{ String(args.userId ?? "") }}',
            role: '{{ args.role }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'remove-room-member',
        description: 'Remove a member from a private room',
        method: 'DELETE',
        path: '/rooms/{roomId}/members/{userId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'userId'],
          properties: {
            roomId: { type: 'string' },
            userId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            userId: '{{ String(args.userId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      // ---------------------------------------------------------------------
      // Pins
      // ---------------------------------------------------------------------
      {
        name: 'get-room-pins',
        description: 'List pinned resources for a room (views/datasets/taskBoards/agents/tools)',
        method: 'GET',
        path: '/rooms/{roomId}/pins',
        parameters: {
          type: 'object',
          required: ['roomId'],
          properties: {
            roomId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      {
        name: 'pin-room-agent',
        description: 'Pin an agent to a room (optionally at a position)',
        method: 'POST',
        path: '/rooms/{roomId}/pins/agents',
        parameters: {
          type: 'object',
          required: ['roomId', 'agentId'],
          properties: {
            roomId: { type: 'string' },
            agentId: { type: 'string' },
            position: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            agentId: '{{ String(args.agentId ?? "") }}',
            position: '{{ args.position }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unpin-room-agent',
        description: 'Unpin an agent from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/pins/agents/{agentId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'agentId'],
          properties: {
            roomId: { type: 'string' },
            agentId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            agentId: '{{ String(args.agentId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      {
        name: 'pin-room-tool',
        description: 'Pin a tool to a room (optionally at a position)',
        method: 'POST',
        path: '/rooms/{roomId}/pins/tools',
        parameters: {
          type: 'object',
          required: ['roomId', 'toolId'],
          properties: {
            roomId: { type: 'string' },
            toolId: { type: 'string' },
            position: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            toolId: '{{ String(args.toolId ?? "") }}',
            position: '{{ args.position }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unpin-room-tool',
        description: 'Unpin a tool from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/pins/tools/{toolId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'toolId'],
          properties: {
            roomId: { type: 'string' },
            toolId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            toolId: '{{ String(args.toolId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      {
        name: 'pin-room-view',
        description: 'Pin a view to a room (optionally at a position)',
        method: 'POST',
        path: '/rooms/{roomId}/pins/views',
        parameters: {
          type: 'object',
          required: ['roomId', 'viewId'],
          properties: {
            roomId: { type: 'string' },
            viewId: { type: 'string' },
            position: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            viewId: '{{ String(args.viewId ?? "") }}',
            position: '{{ args.position }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unpin-room-view',
        description: 'Unpin a view from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/pins/views/{viewId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'viewId'],
          properties: {
            roomId: { type: 'string' },
            viewId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            viewId: '{{ String(args.viewId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      {
        name: 'pin-room-dataset',
        description: 'Pin a dataset to a room (optionally at a position)',
        method: 'POST',
        path: '/rooms/{roomId}/pins/datasets',
        parameters: {
          type: 'object',
          required: ['roomId', 'datasetId'],
          properties: {
            roomId: { type: 'string' },
            datasetId: { type: 'string' },
            position: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            datasetId: '{{ String(args.datasetId ?? "") }}',
            position: '{{ args.position }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unpin-room-dataset',
        description: 'Unpin a dataset from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/pins/datasets/{datasetId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'datasetId'],
          properties: {
            roomId: { type: 'string' },
            datasetId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            datasetId: '{{ String(args.datasetId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      {
        name: 'pin-room-task-board',
        description: 'Pin a task board to a room (optionally at a position)',
        method: 'POST',
        path: '/rooms/{roomId}/pins/task-boards',
        parameters: {
          type: 'object',
          required: ['roomId', 'boardId'],
          properties: {
            roomId: { type: 'string' },
            boardId: { type: 'string' },
            position: { type: 'number' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            boardId: '{{ String(args.boardId ?? "") }}',
            position: '{{ args.position }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 20000,
      },
      {
        name: 'unpin-room-task-board',
        description: 'Unpin a task board from a room',
        method: 'DELETE',
        path: '/rooms/{roomId}/pins/task-boards/{boardId}',
        parameters: {
          type: 'object',
          required: ['roomId', 'boardId'],
          properties: {
            roomId: { type: 'string' },
            boardId: { type: 'string' },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
            boardId: '{{ String(args.boardId ?? "") }}',
          },
        },
        requestStyle: 'query',
        timeoutMs: 20000,
      },

      // ---------------------------------------------------------------------
      // Pin reorder (owner/admin only by server policy)
      // ---------------------------------------------------------------------
      {
        name: 'reorder-room-pins-views',
        description: 'Reorder pinned views within a room',
        method: 'POST',
        path: '/rooms/{roomId}/pins/views/reorder',
        parameters: {
          type: 'object',
          required: ['roomId', 'viewIds'],
          properties: {
            roomId: { type: 'string' },
            viewIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            viewIds: '{{ args.viewIds ?? [] }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
      {
        name: 'reorder-room-pins-datasets',
        description: 'Reorder pinned datasets within a room',
        method: 'POST',
        path: '/rooms/{roomId}/pins/datasets/reorder',
        parameters: {
          type: 'object',
          required: ['roomId', 'datasetIds'],
          properties: {
            roomId: { type: 'string' },
            datasetIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            datasetIds: '{{ args.datasetIds ?? [] }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
      {
        name: 'reorder-room-pins-task-boards',
        description: 'Reorder pinned task boards within a room',
        method: 'POST',
        path: '/rooms/{roomId}/pins/task-boards/reorder',
        parameters: {
          type: 'object',
          required: ['roomId', 'boardIds'],
          properties: {
            roomId: { type: 'string' },
            boardIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            boardIds: '{{ args.boardIds ?? [] }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
      {
        name: 'reorder-room-pins-agents',
        description: 'Reorder pinned agents within a room',
        method: 'POST',
        path: '/rooms/{roomId}/pins/agents/reorder',
        parameters: {
          type: 'object',
          required: ['roomId', 'agentIds'],
          properties: {
            roomId: { type: 'string' },
            agentIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            agentIds: '{{ args.agentIds ?? [] }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
      {
        name: 'reorder-room-pins-tools',
        description: 'Reorder pinned tools within a room',
        method: 'POST',
        path: '/rooms/{roomId}/pins/tools/reorder',
        parameters: {
          type: 'object',
          required: ['roomId', 'toolIds'],
          properties: {
            roomId: { type: 'string' },
            toolIds: { type: 'array', items: { type: 'string' } },
          },
          additionalProperties: false,
        },
        mapping: {
          path: {
            roomId: '{{ String(args.roomId ?? args.id ?? runtimeEnv.CONVERSATION_ID ?? "") }}',
          },
          body: {
            toolIds: '{{ args.toolIds ?? [] }}',
          },
        },
        requestStyle: 'json',
        timeoutMs: 30000,
      },
    ];

    // ---- Upsert runtime action rows (source of truth: connector_template_actions) ----
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

    // ---- Keep legacy endpoints_json in sync (best-effort) ----
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

    const row = rows[0];
    const templateId = String(row.id);

    await client.query(`DELETE FROM connector_template_actions WHERE template_id = $1 AND action_name = ANY($2::text[]);`, [
      templateId,
      ACTION_NAMES as unknown as string[],
    ]);

    const legacyEndpoints: Endpoint[] = Array.isArray(row.endpoints_json) ? (row.endpoints_json as Endpoint[]) : [];
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

