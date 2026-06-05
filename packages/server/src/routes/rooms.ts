import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyStarshipAccess, verifyStarshipOwnerAccess } from '@/middleware/verify-starship-access';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { validateData } from '@/utils/validation';
import { IdSchema } from '@/schemas/common';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  RoomTablesRepository,
  RoomDocsRepository,
  RoomTaskBoardsRepository,
  RoomRepository,
  StarshipTableRepository,
  StarshipDocRepository,
  TaskBoardRepository,
  getConnection,
} from '@starships/models';
import type { RoomModel } from '@starships/protocol';
import { rateLimiters } from '@/middleware/rateLimiter';

const router: Router = Router();

/**
 * Rooms are organizational containers within a starship: they group structured
 * Tables, Goals (task boards), and Docs. Access is governed by starship access
 * (read) and starship ownership (write); there is no per-room membership.
 */

async function requireRoomReadAccess(args: {
  roomId: string;
  req: Request;
  res: Response;
}): Promise<{ authUserId: string; room: RoomModel } | null> {
  const roomId = String(args.roomId || '').trim();
  if (!roomId) {
    sendError(args.res, 'VALIDATION_ERROR', 'Missing roomId', 400);
    return null;
  }
  const authUserId = args.req.user?.id as string | undefined;
  if (!authUserId) {
    sendError(args.res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }

  const room = await new RoomRepository().findById(roomId);
  if (!room) {
    sendError(args.res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId });
    return null;
  }
  if (!(await verifyStarshipAccess(room.starshipId, authUserId, args.res))) return null;
  return { authUserId, room };
}

async function requireRoomWriteAccess(args: {
  roomId: string;
  req: Request;
  res: Response;
}): Promise<{ authUserId: string; room: RoomModel } | null> {
  const roomId = String(args.roomId || '').trim();
  const authUserId = args.req.user?.id as string | undefined;
  if (!authUserId) {
    sendError(args.res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  const room = await new RoomRepository().findById(roomId);
  if (!room) {
    sendError(args.res, 'RESOURCE_NOT_FOUND', 'Room not found', 404, { roomId });
    return null;
  }
  if (!(await verifyStarshipOwnerAccess(room.starshipId, authUserId, args.res))) return null;
  return { authUserId, room };
}

// ============================================================================
// Room CRUD
// ============================================================================

// GET /starships/:starshipId/rooms - List a starship's rooms
router.get('/starships/:starshipId/rooms', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const rooms = await new RoomRepository().listByStarship(params.starshipId);
    sendSuccess(res, { rooms }, 200);
  } catch (error) {
    handleError(error, res, 'listing rooms');
  }
});

// POST /starships/:starshipId/rooms - Create a container room
router.post('/starships/:starshipId/rooms', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'starship parameter');
    if (!params) return;

    const authUserId = req.user?.id as string | undefined;
    if (!authUserId) {
      sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
      return;
    }
    if (!(await verifyStarshipAccess(params.starshipId, authUserId, res))) return;

    const body = validateData(
      z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .refine((s) => s === s.trim(), 'name must not have leading/trailing whitespace')
          .refine((s) => s.trim().length > 0, 'name cannot be empty'),
        isPrivate: z.boolean().optional(),
        topic: z.string().max(2000).optional().nullable(),
      }),
      req.body,
      res,
      'room create'
    );
    if (!body) return;

    const room = await new RoomRepository().create({
      starshipId: params.starshipId,
      name: body.name,
      isPrivate: Boolean(body.isPrivate),
      topic: body.topic ?? null,
    });
    sendSuccess(res, { room }, 201);
  } catch (error) {
    handleError(error, res, 'creating room');
  }
});

// GET /rooms/:roomId - Get a room
router.get('/rooms/:roomId', jwtAuthMiddleware, rateLimiters.apiAuthenticated, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    sendSuccess(res, { room: access.room }, 200);
  } catch (error) {
    handleError(error, res, 'fetching room');
  }
});

// PATCH /rooms/:roomId - Update room metadata
router.patch('/rooms/:roomId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const body = validateData(
      z.object({
        name: z.string().min(1).max(100).optional(),
        isPrivate: z.boolean().optional(),
        topic: z.string().max(2000).optional().nullable(),
      }),
      req.body,
      res,
      'room update'
    );
    if (!body) return;

    const room = await new RoomRepository().update(params.roomId, body);
    sendSuccess(res, { room }, 200);
  } catch (error) {
    handleError(error, res, 'updating room');
  }
});

// DELETE /rooms/:roomId - Delete a room
router.delete('/rooms/:roomId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const removed = await new RoomRepository().delete(params.roomId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'deleting room');
  }
});

// ============================================================================
// Pins (composition: which Tables / Goals / Docs are surfaced in a room)
// ============================================================================

// GET /rooms/:roomId/pins - All pins for a room
router.get('/rooms/:roomId/pins', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const [tables, taskBoards, docs] = await Promise.all([
      new RoomTablesRepository().list(access.room.id),
      new RoomTaskBoardsRepository().list(access.room.id),
      new RoomDocsRepository().list(access.room.id),
    ]);
    sendSuccess(res, { tables, taskBoards, docs }, 200);
  } catch (error) {
    handleError(error, res, 'listing room pins');
  }
});

// GET /rooms/:roomId/pins/tables - Pinned tables resolved to resource objects
router.get('/rooms/:roomId/pins/tables', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const pins = await new RoomTablesRepository().list(access.room.id);
    const ids = pins.map((p) => String(p.tableId)).filter(Boolean);
    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      archived: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, archived, created_at, updated_at
         FROM starship_tables
        WHERE id = ANY($1::text[]) AND starship_id = $2`,
      [ids, access.room.starshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = pins
      .map((pin) => {
        const r = byId.get(String(pin.tableId));
        if (!r) return null;
        return {
          pin,
          table: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);
    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing pinned tables');
  }
});

// GET /rooms/:roomId/pins/task-boards - Pinned task boards resolved to resource objects
router.get('/rooms/:roomId/pins/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomReadAccess({ roomId: params.roomId, req, res });
    if (!access) return;

    const pins = await new RoomTaskBoardsRepository().list(access.room.id);
    const ids = pins.map((p) => String(p.boardId)).filter(Boolean);
    if (ids.length === 0) {
      sendSuccess(res, { items: [] }, 200);
      return;
    }

    const conn = getConnection();
    const rows = await conn.query<{
      id: string;
      name: string;
      slug: string;
      description: string;
      archived: boolean;
      pos: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, name, slug, description, archived, pos, created_at, updated_at
         FROM task_boards
        WHERE id = ANY($1::text[]) AND starship_id = $2`,
      [ids, access.room.starshipId]
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    const items = pins
      .map((pin) => {
        const r = byId.get(String(pin.boardId));
        if (!r) return null;
        return {
          pin,
          taskBoard: {
            id: String(r.id),
            name: String(r.name),
            slug: String(r.slug),
            description: String(r.description ?? ''),
            archived: Boolean(r.archived),
            pos: Number(r.pos ?? 0),
            createdAt: String(r.created_at),
            updatedAt: String(r.updated_at),
          },
        };
      })
      .filter(Boolean);
    sendSuccess(res, { items }, 200);
  } catch (error) {
    handleError(error, res, 'listing pinned task boards');
  }
});

// ---------------------------------------------------------------------------
// Table pins
// ---------------------------------------------------------------------------

router.post('/rooms/:roomId/pins/tables', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ tableId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin table');
    if (!body) return;

    const table = await new StarshipTableRepository().findById(body.tableId);
    if (!table || String(table.starshipId) !== String(access.room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned table must belong to the same starship as the room', 400, { tableId: body.tableId });
      return;
    }

    const pin = await new RoomTablesRepository().upsert({
      roomId: access.room.id,
      tableId: body.tableId,
      position: body.position ?? null,
      createdBy: access.authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning table');
  }
});

router.delete('/rooms/:roomId/pins/tables/:tableId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, tableId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const removed = await new RoomTablesRepository().remove(access.room.id, params.tableId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning table');
  }
});

router.post('/rooms/:roomId/pins/tables/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ tableIds: z.array(IdSchema) }), req.body, res, 'reorder pinned tables');
    if (!body) return;

    const pinnedRepo = new RoomTablesRepository();
    const existing = await pinnedRepo.list(access.room.id);
    if (!validateReorder(existing.map((p) => String(p.tableId)), body.tableIds, res, 'tables')) return;
    await reorderPins('room_tables', 'table_id', access.room.id, body.tableIds);
    sendSuccess(res, { tables: await pinnedRepo.list(access.room.id) }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned tables');
  }
});

// ---------------------------------------------------------------------------
// Task board pins
// ---------------------------------------------------------------------------

router.post('/rooms/:roomId/pins/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ boardId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin task board');
    if (!body) return;

    const board = await new TaskBoardRepository().findById(body.boardId);
    if (!board || String(board.starshipId) !== String(access.room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned task board must belong to the same starship as the room', 400, { boardId: body.boardId });
      return;
    }

    const pin = await new RoomTaskBoardsRepository().upsert({
      roomId: access.room.id,
      boardId: body.boardId,
      position: body.position ?? null,
      createdBy: access.authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning task board');
  }
});

router.delete('/rooms/:roomId/pins/task-boards/:boardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, boardId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const removed = await new RoomTaskBoardsRepository().remove(access.room.id, params.boardId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning task board');
  }
});

router.post('/rooms/:roomId/pins/task-boards/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ boardIds: z.array(IdSchema) }), req.body, res, 'reorder pinned task boards');
    if (!body) return;

    const pinnedRepo = new RoomTaskBoardsRepository();
    const existing = await pinnedRepo.list(access.room.id);
    if (!validateReorder(existing.map((p) => String(p.boardId)), body.boardIds, res, 'task boards')) return;
    await reorderPins('room_task_boards', 'board_id', access.room.id, body.boardIds);
    sendSuccess(res, { taskBoards: await pinnedRepo.list(access.room.id) }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned task boards');
  }
});

// ---------------------------------------------------------------------------
// Doc pins
// ---------------------------------------------------------------------------

router.post('/rooms/:roomId/pins/docs', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ docId: IdSchema, position: z.number().int().min(0).optional() }), req.body, res, 'pin doc');
    if (!body) return;

    const doc = await new StarshipDocRepository(getConnection()).findById(body.docId);
    if (!doc || String(doc.starshipId) !== String(access.room.starshipId)) {
      sendError(res, 'VALIDATION_ERROR', 'Pinned doc must belong to the same starship as the room', 400, { docId: body.docId });
      return;
    }

    const pin = await new RoomDocsRepository().upsert({
      roomId: access.room.id,
      docId: body.docId,
      position: body.position ?? null,
      createdBy: access.authUserId,
    });
    sendSuccess(res, { pin }, 200);
  } catch (error) {
    handleError(error, res, 'pinning doc');
  }
});

router.delete('/rooms/:roomId/pins/docs/:docId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema, docId: IdSchema }), req.params, res, 'pin parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const removed = await new RoomDocsRepository().remove(access.room.id, params.docId);
    sendSuccess(res, { removed }, 200);
  } catch (error) {
    handleError(error, res, 'unpinning doc');
  }
});

router.post('/rooms/:roomId/pins/docs/reorder', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const params = validateData(z.object({ roomId: IdSchema }), req.params, res, 'room parameter');
    if (!params) return;
    const access = await requireRoomWriteAccess({ roomId: params.roomId, req, res });
    if (!access) return;
    const body = validateData(z.object({ docIds: z.array(IdSchema) }), req.body, res, 'reorder pinned docs');
    if (!body) return;

    const pinnedRepo = new RoomDocsRepository();
    const existing = await pinnedRepo.list(access.room.id);
    if (!validateReorder(existing.map((p) => String(p.docId)), body.docIds, res, 'docs')) return;
    const docs = await pinnedRepo.reorder(access.room.id, body.docIds);
    sendSuccess(res, { docs }, 200);
  } catch (error) {
    handleError(error, res, 'reordering pinned docs');
  }
});

// ---------------------------------------------------------------------------
// Reorder helpers
// ---------------------------------------------------------------------------

function validateReorder(existingIds: string[], requested: string[], res: Response, label: string): boolean {
  const nextIds = requested.map((x) => String(x));
  const uniq = new Set(nextIds);
  if (uniq.size !== nextIds.length) {
    sendError(res, 'VALIDATION_ERROR', `Duplicate ${label} in reorder list`, 400);
    return false;
  }
  if (existingIds.length !== nextIds.length || existingIds.some((id) => !uniq.has(id))) {
    sendError(res, 'VALIDATION_ERROR', `Reorder list must include exactly the currently pinned ${label}`, 400, {
      pinnedCount: existingIds.length,
      providedCount: nextIds.length,
    });
    return false;
  }
  return true;
}

async function reorderPins(table: 'room_tables' | 'room_task_boards', idColumn: 'table_id' | 'board_id', roomId: string, ids: string[]): Promise<void> {
  const conn = getConnection();
  const caseTemp = ids.map((_, idx) => `WHEN $${idx + 2} THEN ${-(idx + 1)}`).join(' ');
  const caseFinal = ids.map((_, idx) => `WHEN $${idx + 2} THEN ${idx}`).join(' ');
  const inList = ids.map((_, idx) => `$${idx + 2}`).join(', ');
  const args = [roomId, ...ids];
  await conn.query('BEGIN');
  try {
    await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${table}:${roomId}`]);
    await conn.query(
      `UPDATE ${table} SET position = CASE ${idColumn} ${caseTemp} ELSE position END WHERE room_id = $1 AND ${idColumn} IN (${inList})`,
      args
    );
    await conn.query(
      `UPDATE ${table} SET position = CASE ${idColumn} ${caseFinal} ELSE position END WHERE room_id = $1 AND ${idColumn} IN (${inList})`,
      args
    );
    await conn.query('COMMIT');
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  }
}

export default router;
