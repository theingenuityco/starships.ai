import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';

import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { verifyResourceAccess, verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { IdSchema } from '@/schemas/common';
import { handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
import { TaskBoardService } from '@/services/TaskBoardService';
import { TaskCardRepository, TaskColumnRepository } from '@starships/models';

const router: Router = Router();
const service = new TaskBoardService();
const columnRepo = new TaskColumnRepository();
const cardRepo = new TaskCardRepository();

function requireAuthUserId(req: Request, res: Response): string | null {
  const userId = (req.user as any)?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

function parseBoolish(value: unknown): boolean {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return v === 'true' || v === '1' || v === 'yes' || v === 'y';
}

async function requireBoardAccess(boardId: string, userId: string, res: Response) {
  const details = await service.getBoardDetails(boardId);
  if (!details) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404, { resource: 'task_board', id: boardId });
    return null;
  }
  if (!(await verifyResourceAccess(details.board.starshipId, userId, 'task_board', boardId, res))) {
    return null;
  }
  return details;
}

/**
 * GET /api/v1/starships/:starshipId/task-boards
 * List task boards for a starship.
 */
router.get('/starships/:starshipId/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = z.object({ starshipId: IdSchema }).parse(req.params);
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const includeArchived = parseBoolish((req.query as any)?.includeArchived);
    const boards = await service.listBoards(params.starshipId, { includeArchived });
    sendSuccess(res, { boards });
  } catch (error) {
    handleError(error, res, 'listing task boards');
  }
});

/**
 * POST /api/v1/starships/:starshipId/task-boards
 * Create a new task board for a starship.
 */
router.post('/starships/:starshipId/task-boards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = z.object({ starshipId: IdSchema }).parse(req.params);
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const BodySchema = z.object({
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(2000).optional(),
      pos: z.number().finite().optional(),
      createDefaultColumns: z.boolean().optional(),
      columns: z
        .array(
          z.object({
            title: z.string().trim().min(1).max(200),
            key: z.string().trim().min(1).max(100).nullable().optional(),
            pos: z.number().finite().optional(),
            wipLimit: z.number().int().positive().nullable().optional(),
          })
        )
        .optional(),
    });
    const body = BodySchema.parse(req.body);

    const created = await service.createBoard({
      starshipId: params.starshipId,
      name: body.name,
      slug: body.slug,
      description: body.description,
      pos: body.pos,
      createDefaultColumns: body.createDefaultColumns,
      columns: body.columns as any,
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    handleError(error, res, 'creating task board');
  }
});

/**
 * GET /api/v1/task-boards/:boardId
 * Get a task board with its columns.
 */
router.get('/task-boards/:boardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    sendSuccess(res, details);
  } catch (error) {
    handleError(error, res, 'fetching task board');
  }
});

/**
 * PATCH /api/v1/task-boards/:boardId
 * Update a task board.
 */
router.patch('/task-boards/:boardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    const BodySchema = z
      .object({
        name: z.string().trim().min(1).max(200).optional(),
        slug: z.string().trim().min(1).max(100).optional(),
        description: z.string().max(2000).optional(),
        pos: z.number().finite().optional(),
        archived: z.boolean().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const updated = await service.updateBoard(params.boardId, body);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404);
      return;
    }

    sendSuccess(res, updated);
  } catch (error) {
    handleError(error, res, 'updating task board');
  }
});

/**
 * DELETE /api/v1/task-boards/:boardId
 * Archive a task board (soft-delete).
 */
router.delete('/task-boards/:boardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    const archived = await service.archiveBoard(params.boardId);
    if (!archived) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404);
      return;
    }
    sendSuccess(res, archived, 200);
  } catch (error) {
    handleError(error, res, 'archiving task board');
  }
});

/**
 * POST /api/v1/task-boards/:boardId/columns
 * Create a column in a board.
 */
router.post('/task-boards/:boardId/columns', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    const BodySchema = z
      .object({
        title: z.string().trim().min(1).max(200),
        key: z.string().trim().min(1).max(100).nullable().optional(),
        pos: z.number().finite().optional(),
        wipLimit: z.number().int().positive().nullable().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const created = await service.createColumn({
      boardId: details.board.id,
      title: body.title,
      key: body.key ?? null,
      pos: body.pos,
      wipLimit: body.wipLimit ?? null,
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    handleError(error, res, 'creating task column');
  }
});

/**
 * PATCH /api/v1/task-columns/:columnId
 * Update a column.
 */
router.patch('/task-columns/:columnId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ columnId: IdSchema }).parse(req.params);

    const column = await columnRepo.findById(params.columnId);
    if (!column) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task column not found', 404);
      return;
    }

    const boardDetails = await requireBoardAccess(column.boardId, userId, res);
    if (!boardDetails) return;

    const BodySchema = z
      .object({
        title: z.string().trim().min(1).max(200).optional(),
        key: z.string().trim().min(1).max(100).nullable().optional(),
        pos: z.number().finite().optional(),
        wipLimit: z.number().int().positive().nullable().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const updated = await service.updateColumn(params.columnId, body);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task column not found', 404);
      return;
    }
    sendSuccess(res, updated);
  } catch (error) {
    handleError(error, res, 'updating task column');
  }
});

/**
 * DELETE /api/v1/task-columns/:columnId
 * Delete a column (cascades cards).
 */
router.delete('/task-columns/:columnId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ columnId: IdSchema }).parse(req.params);

    const column = await columnRepo.findById(params.columnId);
    if (!column) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task column not found', 404);
      return;
    }

    const boardDetails = await requireBoardAccess(column.boardId, userId, res);
    if (!boardDetails) return;

    const ok = await service.deleteColumn(params.columnId);
    if (!ok) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task column not found', 404);
      return;
    }
    res.status(204).send();
  } catch (error) {
    handleError(error, res, 'deleting task column');
  }
});

/**
 * GET /api/v1/task-boards/:boardId/cards
 * List cards for a board.
 */
router.get('/task-boards/:boardId/cards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    const includeArchived = parseBoolish((req.query as any)?.includeArchived);
    const cards = await service.listCards(details.board.id, { includeArchived });
    sendSuccess(res, { cards });
  } catch (error) {
    handleError(error, res, 'listing task cards');
  }
});

/**
 * POST /api/v1/task-boards/:boardId/cards
 * Create a card in a board.
 */
router.post('/task-boards/:boardId/cards', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ boardId: IdSchema }).parse(req.params);
    const details = await requireBoardAccess(params.boardId, userId, res);
    if (!details) return;

    const BodySchema = z
      .object({
        columnId: IdSchema,
        title: z.string().trim().min(1).max(300),
        description: z.string().max(50_000).optional(),
        pos: z.number().finite().optional(),
        priority: z.number().int().nullable().optional(),
        assigneeAgentId: IdSchema.nullable().optional(),
        assigneeUserId: IdSchema.nullable().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const created = await service.createCard({
      boardId: details.board.id,
      columnId: body.columnId,
      title: body.title,
      description: body.description,
      pos: body.pos,
      priority: body.priority ?? null,
      assigneeAgentId: body.assigneeAgentId ?? null,
      assigneeUserId: body.assigneeUserId ?? null,
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    handleError(error, res, 'creating task card');
  }
});

/**
 * PATCH /api/v1/task-cards/:cardId
 * Update a card.
 */
router.patch('/task-cards/:cardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ cardId: IdSchema }).parse(req.params);

    const card = await cardRepo.findById(params.cardId);
    if (!card) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }

    const boardDetails = await requireBoardAccess(card.boardId, userId, res);
    if (!boardDetails) return;

    const BodySchema = z
      .object({
        title: z.string().trim().min(1).max(300).optional(),
        description: z.string().max(50_000).optional(),
        pos: z.number().finite().optional(),
        priority: z.number().int().nullable().optional(),
        assigneeAgentId: IdSchema.nullable().optional(),
        assigneeUserId: IdSchema.nullable().optional(),
        archived: z.boolean().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const updated = await service.updateCard(params.cardId, body);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }
    sendSuccess(res, updated);
  } catch (error) {
    handleError(error, res, 'updating task card');
  }
});

/**
 * POST /api/v1/task-cards/:cardId/move
 * Move a card to another column/position.
 */
router.post('/task-cards/:cardId/move', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ cardId: IdSchema }).parse(req.params);

    const card = await cardRepo.findById(params.cardId);
    if (!card) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }
    const boardDetails = await requireBoardAccess(card.boardId, userId, res);
    if (!boardDetails) return;

    const BodySchema = z
      .object({
        toColumnId: IdSchema,
        toPos: z.number().finite().optional(),
      })
      .strict();
    const body = BodySchema.parse(req.body);

    const moved = await service.moveCard(params.cardId, { toColumnId: body.toColumnId, toPos: body.toPos });
    if (!moved) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }
    sendSuccess(res, moved, 200);
  } catch (error) {
    handleError(error, res, 'moving task card');
  }
});

/**
 * DELETE /api/v1/task-cards/:cardId
 * Archive a card (soft-delete).
 */
router.delete('/task-cards/:cardId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;
    const params = z.object({ cardId: IdSchema }).parse(req.params);

    const card = await cardRepo.findById(params.cardId);
    if (!card) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }
    const boardDetails = await requireBoardAccess(card.boardId, userId, res);
    if (!boardDetails) return;

    const archived = await service.archiveCard(params.cardId);
    if (!archived) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Task card not found', 404);
      return;
    }
    sendSuccess(res, archived, 200);
  } catch (error) {
    handleError(error, res, 'archiving task card');
  }
});

export default router;

