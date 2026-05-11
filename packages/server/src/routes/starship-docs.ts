import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { validateData } from '@/utils/validation';
import { IdSchema, SlugSchema, noXSS, XSS_ERROR_MESSAGE } from '@/schemas/common';
import { verifyStarshipAccess } from '@/middleware/verify-starship-access';
import { sendError, sendSuccess, handleError } from '@/utils/responseHelpers';
import { StarshipDocRepository, getConnection } from '@starships/models';
import type { StarshipDocDetailResponse, StarshipDocListResponse } from '@starships/protocol';

const router: Router = Router();

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function requireAuthUserId(req: Request, res: Response): string | null {
  const userId = (req.user as any)?.id as string | undefined;
  if (!userId) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return null;
  }
  return userId;
}

const DocIdOrSlugSchema = z.union([IdSchema, SlugSchema.max(100)]);

async function requireDocInStarship(args: {
  docIdOrSlug: string;
  starshipId: string;
  docRepo: StarshipDocRepository;
  res: Response;
}) {
  const { docIdOrSlug, starshipId, docRepo, res } = args;
  let doc = null;
  if (IdSchema.safeParse(docIdOrSlug).success) {
    doc = await docRepo.findById(docIdOrSlug);
  }
  if (!doc) {
    doc = await docRepo.findBySlug(docIdOrSlug, starshipId);
  }
  if (!doc || doc.starshipId !== starshipId) {
    sendError(res, 'RESOURCE_NOT_FOUND', 'Doc not found', 404);
    return null;
  }
  return { doc };
}

// ----------------------------------------------------------------------------
// Zod schemas
// ----------------------------------------------------------------------------

const CreateDocSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(300)
      .refine(noXSS, { message: XSS_ERROR_MESSAGE }),
    content: z.string().max(500_000).optional(),
  })
  .strict();

const UpdateDocSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .max(300)
      .refine(noXSS, { message: XSS_ERROR_MESSAGE })
      .optional(),
    content: z.string().max(500_000).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const ListDocsQuerySchema = z
  .object({
    includeArchived: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
  })
  .optional();

// ----------------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------------

/**
 * GET /api/v1/starships/:starshipId/docs
 */
router.get('/starships/:starshipId/docs', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'docs params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const q = validateData(ListDocsQuerySchema, req.query, res, 'docs query') ?? {};
    const docRepo = new StarshipDocRepository(getConnection());
    const docs = await docRepo.listByStarship(params.starshipId, { includeArchived: Boolean((q as any).includeArchived) });

    const payload: StarshipDocListResponse = { docs };
    sendSuccess(res, payload);
  } catch (error) {
    handleError(error, res, 'list docs');
  }
});

/**
 * POST /api/v1/starships/:starshipId/docs
 */
router.post('/starships/:starshipId/docs', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema }), req.params, res, 'docs params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const body = validateData(CreateDocSchema, req.body, res, 'create doc body');
    if (!body) return;

    const docRepo = new StarshipDocRepository(getConnection());
    const created = await docRepo.create({
      starshipId: params.starshipId,
      title: body.title,
      content: body.content ?? '',
    });

    const resp: StarshipDocDetailResponse = { doc: created };
    sendSuccess(res, resp, 201);
  } catch (error) {
    handleError(error, res, 'create doc');
  }
});

/**
 * GET /api/v1/starships/:starshipId/docs/:docId
 */
router.get('/starships/:starshipId/docs/:docId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema, docId: DocIdOrSlugSchema }), req.params, res, 'doc params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const docRepo = new StarshipDocRepository(getConnection());
    const required = await requireDocInStarship({ docIdOrSlug: params.docId, starshipId: params.starshipId, docRepo, res });
    if (!required) return;

    const resp: StarshipDocDetailResponse = { doc: required.doc };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'get doc');
  }
});

/**
 * PATCH /api/v1/starships/:starshipId/docs/:docId
 */
router.patch('/starships/:starshipId/docs/:docId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema, docId: DocIdOrSlugSchema }), req.params, res, 'doc params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const body = validateData(UpdateDocSchema, req.body, res, 'update doc body');
    if (!body) return;

    const docRepo = new StarshipDocRepository(getConnection());
    const required = await requireDocInStarship({ docIdOrSlug: params.docId, starshipId: params.starshipId, docRepo, res });
    if (!required) return;

    const updated = await docRepo.update(required.doc.id, body);
    if (!updated) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Doc not found', 404);
      return;
    }

    const resp: StarshipDocDetailResponse = { doc: updated };
    sendSuccess(res, resp);
  } catch (error) {
    handleError(error, res, 'update doc');
  }
});

/**
 * DELETE /api/v1/starships/:starshipId/docs/:docId
 */
router.delete('/starships/:starshipId/docs/:docId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireAuthUserId(req, res);
    if (!userId) return;

    const params = validateData(z.object({ starshipId: IdSchema, docId: DocIdOrSlugSchema }), req.params, res, 'doc params');
    if (!params) return;
    if (!(await verifyStarshipAccess(params.starshipId, userId, res))) return;

    const docRepo = new StarshipDocRepository(getConnection());
    const required = await requireDocInStarship({ docIdOrSlug: params.docId, starshipId: params.starshipId, docRepo, res });
    if (!required) return;

    const removed = await docRepo.delete(required.doc.id);
    sendSuccess(res, { removed });
  } catch (error) {
    handleError(error, res, 'delete doc');
  }
});

export default router;
