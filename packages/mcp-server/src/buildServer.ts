import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  StarshipTableRepository,
  StarshipTableRowRepository,
  RoomRepository,
  RoomTablesRepository,
  RoomTaskBoardsRepository,
  RoomDocsRepository,
  TaskBoardRepository,
  TaskColumnRepository,
  TaskCardRepository,
  AgentDispatchRepository,
  AgentEventRepository,
  type TableRef,
  type StarshipTableRecord,
} from '@starships/models';
import type { AgentContext } from './auth';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const err = (message: string): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true });

function tableRefOf(t: StarshipTableRecord): TableRef {
  return { starshipId: t.starshipId, physicalTable: t.physicalTable, columns: t.columns, primaryKey: t.primaryKey };
}

/**
 * Build a per-request MCP server scoped to one authenticated agent + starship.
 * Reads run against the agent's starship; writes require the `contributor` role.
 */
export function buildServer(ctx: AgentContext): McpServer {
  const server = new McpServer({ name: 'starship', version: '1.0.0' });
  const canWrite = ctx.accessRole === 'contributor';
  const requireWrite = (): ToolResult | null => (canWrite ? null : err('This agent has viewer access; writes are not permitted.'));

  // ---- Tables ----
  server.registerTool('list_tables', { description: "List the starship's structured Tables." }, async () => {
    const tables = await new StarshipTableRepository().listByStarship(ctx.starshipId);
    return ok(tables.map((t) => ({ id: t.id, name: t.name, slug: t.slug, description: t.description, archived: t.archived })));
  });

  server.registerTool(
    'get_table_schema',
    { description: 'Get a Table\'s column schema.', inputSchema: { tableId: z.string() } },
    async ({ tableId }) => {
      const t = await new StarshipTableRepository().findById(tableId);
      if (!t || t.starshipId !== ctx.starshipId) return err('Table not found');
      return ok({ id: t.id, name: t.name, slug: t.slug, columns: t.columns, primaryKey: t.primaryKey });
    }
  );

  server.registerTool(
    'query_table',
    {
      description: 'Read rows from a Table.',
      inputSchema: { tableId: z.string(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional(), search: z.string().optional() },
    },
    async ({ tableId, limit, offset, search }) => {
      const t = await new StarshipTableRepository().findById(tableId);
      if (!t || t.starshipId !== ctx.starshipId) return err('Table not found');
      const rows = await new StarshipTableRowRepository().listByTable(tableRefOf(t), { limit, offset, search: search ?? null });
      return ok(rows);
    }
  );

  server.registerTool(
    'insert_table_rows',
    { description: 'Append rows to a Table (contributor only).', inputSchema: { tableId: z.string(), rows: z.array(z.record(z.string(), z.unknown())) } },
    async ({ tableId, rows }) => {
      const denied = requireWrite();
      if (denied) return denied;
      const t = await new StarshipTableRepository().findById(tableId);
      if (!t || t.starshipId !== ctx.starshipId) return err('Table not found');
      const result = await new StarshipTableRowRepository().appendMany(tableRefOf(t), rows.map((data) => ({ data })));
      return ok(result);
    }
  );

  // ---- Rooms (read-only containers) ----
  server.registerTool('list_rooms', { description: "List the starship's rooms." }, async () => {
    const rooms = await new RoomRepository().listByStarship(ctx.starshipId);
    return ok(rooms);
  });

  server.registerTool('get_room', { description: 'Get a room and its pinned resources.', inputSchema: { roomId: z.string() } }, async ({ roomId }) => {
    const room = await new RoomRepository().findById(roomId);
    if (!room || room.starshipId !== ctx.starshipId) return err('Room not found');
    const [tables, taskBoards, docs] = await Promise.all([
      new RoomTablesRepository().list(roomId),
      new RoomTaskBoardsRepository().list(roomId),
      new RoomDocsRepository().list(roomId),
    ]);
    return ok({ room, pins: { tables, taskBoards, docs } });
  });

  // ---- Goals (task boards) ----
  server.registerTool('list_task_boards', { description: "List the starship's goal/task boards." }, async () => {
    const boards = await new TaskBoardRepository().listByStarship(ctx.starshipId);
    return ok(boards);
  });

  server.registerTool('get_board', { description: 'Get a board with its columns and cards.', inputSchema: { boardId: z.string() } }, async ({ boardId }) => {
    const board = await new TaskBoardRepository().findById(boardId);
    if (!board || board.starshipId !== ctx.starshipId) return err('Board not found');
    const [columns, cards] = await Promise.all([new TaskColumnRepository().listByBoard(boardId), new TaskCardRepository().listByBoard(boardId)]);
    return ok({ board, columns, cards });
  });

  server.registerTool(
    'create_task',
    { description: 'Create a task card on a board (contributor only).', inputSchema: { boardId: z.string(), columnId: z.string(), title: z.string(), description: z.string().optional() } },
    async ({ boardId, columnId, title, description }) => {
      const denied = requireWrite();
      if (denied) return denied;
      const board = await new TaskBoardRepository().findById(boardId);
      if (!board || board.starshipId !== ctx.starshipId) return err('Board not found');
      // Ensure the column actually belongs to this board (not just any column ID the agent knows).
      const column = await new TaskColumnRepository().findById(columnId);
      if (!column || column.boardId !== boardId) return err('Column not found on this board');
      const card = await new TaskCardRepository().create({ boardId, columnId, title, description });
      return ok(card);
    }
  );

  // ---- Dispatch + status (the agent<->workspace channel) ----
  server.registerTool('pull_commands', { description: 'Pull commands dispatched to this agent that are not yet acknowledged.' }, async () => {
    const cmds = await new AgentDispatchRepository().listPendingForAgent(ctx.agentId);
    return ok(cmds);
  });

  server.registerTool('ack_command', { description: 'Acknowledge a dispatched command.', inputSchema: { dispatchId: z.string() } }, async ({ dispatchId }) => {
    const d = await new AgentDispatchRepository().markAcked(dispatchId, ctx.agentId);
    if (!d) return err('Dispatch not found or already acknowledged');
    // Record the transition so it shows in the activity log (proof of pickup).
    await new AgentEventRepository().append({
      starshipId: ctx.starshipId,
      agentId: ctx.agentId,
      dispatchId: d.id,
      cardId: d.cardId ?? null,
      type: 'command_acked',
      payload: { commandType: d.commandType, heartbeatId: d.heartbeatId ?? null },
    });
    return ok(d);
  });

  server.registerTool('complete_command', { description: 'Mark a dispatched command done.', inputSchema: { dispatchId: z.string() } }, async ({ dispatchId }) => {
    const d = await new AgentDispatchRepository().markDone(dispatchId, ctx.agentId);
    if (!d) return err('Dispatch not found');
    // Record the transition so it shows in the activity log (proof of completion).
    await new AgentEventRepository().append({
      starshipId: ctx.starshipId,
      agentId: ctx.agentId,
      dispatchId: d.id,
      cardId: d.cardId ?? null,
      type: 'command_completed',
      payload: { commandType: d.commandType, heartbeatId: d.heartbeatId ?? null },
    });
    return ok(d);
  });

  server.registerTool(
    'report_status',
    { description: 'Report this agent\'s status to the workspace activity log.', inputSchema: { status: z.enum(['online', 'busy', 'idle', 'offline']), detail: z.string().optional() } },
    async ({ status, detail }) => {
      await new AgentEventRepository().append({ starshipId: ctx.starshipId, agentId: ctx.agentId, type: 'status', payload: { status, detail: detail ?? null } });
      return ok({ recorded: true });
    }
  );

  server.registerTool(
    'post_event',
    { description: "Append an event to the workspace activity log. `type` is a lowercase namespaced slug (e.g. 'status', 'note', 'custom:my_event').", inputSchema: { type: z.string().regex(/^[a-z][a-z0-9_:]{0,63}$/, 'type must be a lowercase slug (a-z 0-9 _ :)'), payload: z.record(z.string(), z.unknown()).optional(), cardId: z.string().optional(), dispatchId: z.string().optional() } },
    async ({ type, payload, cardId, dispatchId }) => {
      const e = await new AgentEventRepository().append({
        starshipId: ctx.starshipId,
        agentId: ctx.agentId,
        type,
        payload: payload ?? {},
        cardId: cardId ?? null,
        dispatchId: dispatchId ?? null,
      });
      return ok({ id: e.id });
    }
  );

  return server;
}
