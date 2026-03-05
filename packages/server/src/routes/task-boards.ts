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

function getReqUserId(req: Request): string | null {
  const u = req.user as unknown;
  if (!u || typeof u !== 'object') return null;
  const id = (u as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

const BoardSlugSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((s) => s === s.trim(), 'slug must not have leading/trailing whitespace')
  .refine((s) => s === s.toLowerCase(), 'slug must be lowercase')
  .refine((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), 'slug must be lowercase alphanumeric with hyphens');

const BoardIdOrSlugSchema = z.union([IdSchema, BoardSlugSchema]);

const UserAssigneeSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((s) => {
    const raw = String(s || '').trim();
    if (!raw) return false;
    const m = raw.match(/^<@u:([^>]+)>$/i);
    const unwrapped = m ? String(m[1] || '').trim() : raw;
    const inner = unwrapped.startsWith('u:') ? unwrapped.slice(2) : unwrapped.toLowerCase().startsWith('u-') ? unwrapped.slice(2) : unwrapped;
    return IdSchema.safeParse(inner.trim()).success;
  }, 'user assignee slug must be u:<userId> (or <@u:userId>)');

const TaskAssigneeRefSchema = z
  .object({
    type: z.enum(['user', 'agent']),
    slug: z.string().trim().min(1).max(255),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'user') {
      const ok = UserAssigneeSlugSchema.safeParse(v.slug).success;
      if (!ok) ctx.addIssue({ code: 'custom', message: 'Invalid user assignee slug', path: ['slug'] });
    } else {
      const ok = BoardSlugSchema.safeParse(v.slug).success;
      if (!ok) ctx.addIssue({ code: 'custom', message: 'Invalid agent slug', path: ['slug'] });
    }
  });

const ColumnNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((s) => s === s.trim(), 'columnName must not have leading/trailing whitespace');

function requireAuthUserId(req: Request, res: Response): string | null {
  const userId = getReqUserId(req);
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

async function requireBoardAccessForStarship(starshipId: string, boardIdOrSlug: string, userId: string, res: Response) {
  if (!(await verifyStarshipAccess(starshipId, userId, res))) return null;

  const details = await service.getBoardDetailsForStarship(starshipId, boardIdOrSlug);
  if (!details) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404, {
      resource: 'task_board',
      starshipId,
      boardIdOrSlug,
    });
    return null;
  }

  if (!(await verifyResourceAccess(details.board.starshipId, userId, 'task_board', details.board.id, res))) {
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

    const includeArchived = parseBoolish(req.query.includeArchived);
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
      slug: BoardSlugSchema.optional(),
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
      columns: body.columns,
    });

    sendSuccess(res, created, 201);
  } catch (error) {
    handleError(error, res, 'creating task board');
  }
});

/**
 * GET /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug
 * Get a task board with its columns by id OR slug (slug is unique per starship).
 */
router.get(
  '/starships/:starshipId/task-boards/:boardIdOrSlug',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;

      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
      if (!details) return;

      sendSuccess(res, details);
    } catch (error) {
      handleError(error, res, 'fetching task board');
    }
  }
);

/**
 * PATCH /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug
 * Update a task board by id OR slug (slug is unique per starship).
 */
router.patch(
  '/starships/:starshipId/task-boards/:boardIdOrSlug',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;

      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
      if (!details) return;

      const BodySchema = z
        .object({
          name: z.string().trim().min(1).max(200).optional(),
          slug: BoardSlugSchema.optional(),
          description: z.string().max(2000).optional(),
          pos: z.number().finite().optional(),
          archived: z.boolean().optional(),
        })
        .strict();
      const body = BodySchema.parse(req.body);

      const updated = await service.updateBoard(details.board.id, body);
      if (!updated) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404);
        return;
      }

      sendSuccess(res, updated);
    } catch (error) {
      handleError(error, res, 'updating task board');
    }
  }
);

/**
 * DELETE /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug
 * Archive a task board (soft-delete) by id OR slug (slug is unique per starship).
 */
router.delete(
  '/starships/:starshipId/task-boards/:boardIdOrSlug',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;

      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
      if (!details) return;

      const archived = await service.archiveBoard(details.board.id);
      if (!archived) {
        sendError(res, 'RESOURCE_NOT_FOUND', 'Task board not found', 404);
        return;
      }
      sendSuccess(res, archived, 200);
    } catch (error) {
      handleError(error, res, 'archiving task board');
    }
  }
);

/**
 * POST /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug/columns
 * Create a column in a board by id OR slug (slug is unique per starship).
 */
router.post(
  '/starships/:starshipId/task-boards/:boardIdOrSlug/columns',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;
      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
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
  }
);

/**
 * GET /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug/cards
 * List cards for a board by id OR slug (slug is unique per starship).
 */
router.get(
  '/starships/:starshipId/task-boards/:boardIdOrSlug/cards',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;
      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
      if (!details) return;

      const includeArchived = parseBoolish(req.query.includeArchived);
      const cards = await service.listCards(details.board.id, { includeArchived });
      sendSuccess(res, { cards });
    } catch (error) {
      handleError(error, res, 'listing task cards');
    }
  }
);

/**
 * POST /api/v1/starships/:starshipId/task-boards/:boardIdOrSlug/cards
 * Create a card in a board by id OR slug (slug is unique per starship).
 */
router.post(
  '/starships/:starshipId/task-boards/:boardIdOrSlug/cards',
  jwtAuthMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = requireAuthUserId(req, res);
      if (!userId) return;
      const params = z.object({ starshipId: IdSchema, boardIdOrSlug: BoardIdOrSlugSchema }).parse(req.params);
      const details = await requireBoardAccessForStarship(params.starshipId, params.boardIdOrSlug, userId, res);
      if (!details) return;

      const BodySchema = z
        .object({
          columnName: ColumnNameSchema,
          title: z.string().trim().min(1).max(300),
          description: z.string().max(50_000).optional(),
          pos: z.number().finite().optional(),
          priority: z.number().int().nullable().optional(),
          assignee: TaskAssigneeRefSchema.nullable().optional(),
        })
        .strict()
        ;
      const body = BodySchema.parse(req.body);

      const created = await service.createCard({
        boardId: details.board.id,
        columnName: body.columnName,
        title: body.title,
        description: body.description,
        pos: body.pos,
        priority: body.priority ?? null,
        assignee: body.assignee ?? undefined,
      });

      sendSuccess(res, created, 201);
    } catch (error) {
      handleError(error, res, 'creating task card');
    }
  }
);

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
        slug: BoardSlugSchema.optional(),
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

    const includeArchived = parseBoolish(req.query.includeArchived);
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
        columnName: ColumnNameSchema,
        title: z.string().trim().min(1).max(300),
        description: z.string().max(50_000).optional(),
        pos: z.number().finite().optional(),
        priority: z.number().int().nullable().optional(),
        assignee: TaskAssigneeRefSchema.nullable().optional(),
      })
      .strict()
      ;
    const body = BodySchema.parse(req.body);

    const created = await service.createCard({
      boardId: details.board.id,
      columnName: body.columnName,
      title: body.title,
      description: body.description,
      pos: body.pos,
      priority: body.priority ?? null,
      assignee: body.assignee ?? undefined,
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
        assignee: TaskAssigneeRefSchema.nullable().optional(),
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
        toColumnName: ColumnNameSchema,
        toPos: z.number().finite().optional(),
      })
      .strict()
      ;
    const body = BodySchema.parse(req.body);

    const moved = await service.moveCard(params.cardId, { toColumnName: body.toColumnName, toPos: body.toPos });
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

