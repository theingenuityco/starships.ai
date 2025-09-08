import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { BlueprintService } from '@/services/BlueprintService';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const NanoidSchema = z.string().regex(/^[a-z0-9_-]{10,30}$/i, 'Invalid ID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const CategorySchema = z.enum(['general', 'workflow', 'automation', 'integration', 'analysis']);

// Helper function for authentication check
const checkAuth = (req: Request, res: Response): boolean => {
  const user = req.user;
  if (!user?.id) {
    sendError(res, 'AUTHENTICATION_REQUIRED', 'User not authenticated', 401);
    return false;
  }
  return true;
};

// Helper function for Zod validation
const validateData = <T>(schema: z.ZodSchema<T>, data: unknown, res: Response, context: string): T | null => {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      const fieldName = firstError.path.join('.');

      sendError(res, 'VALIDATION_ERROR', firstError.message, 400, {
        field: fieldName,
        context,
        validationErrors: error.issues.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
          code: err.code,
        })),
      });
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', `${context} validation error`, 500);
    }
    return null;
  }
};

/**
 * GET /blueprints - Get all blueprints with optional filtering
 */
router.get('/blueprints', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    // Validate optional category filter
    const queryValidation = validateData(
      z.object({
        category: CategorySchema.optional(),
        search: z.string().optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { page, limit } = paginationValidation;
    const { category, search } = queryValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    let blueprints;

    if (search) {
      blueprints = await blueprintService.searchBlueprints(search, category);
    } else if (category) {
      blueprints = await blueprintService.getBlueprintsByCategory(category);
    } else {
      blueprints = await blueprintService.getAllBlueprints();
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedBlueprints = blueprints.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, blueprints.length);
    sendSuccess(res, paginatedBlueprints, 200, paginationMeta);
  } catch (error) {
    handleCommonError(error, res, 'fetching blueprints');
  }
});

/**
 * GET /blueprints/:blueprintId - Get blueprint by ID
 */
router.get('/blueprints/:blueprintId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    const { blueprintId } = paramValidation;

    // Use service layer for data access
    const blueprintService = new BlueprintService();
    const blueprint = await blueprintService.getBlueprintById(blueprintId);

    if (!blueprint) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Blueprint not found', 404, {
        resource: 'blueprint',
        id: blueprintId,
      });
      return;
    }

    sendSuccess(res, blueprint, 200);
  } catch (error) {
    handleCommonError(error, res, 'fetching blueprint details');
  }
});

/**
 * POST /blueprints - Create new blueprint
 */
router.post('/blueprints', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
        description: z.string().optional(),
        category: CategorySchema.optional(),
        nodes: z.array(z.any()).min(1, 'At least one node is required'),
        edges: z.array(z.any()),
        metadata: z.object({}).passthrough().optional(),
      }),
      req.body,
      res,
      'blueprint creation data'
    );
    if (!bodyValidation) return;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const blueprint = await blueprintService.createBlueprint(bodyValidation);

    sendSuccess(res, blueprint, 201);
  } catch (error) {
    handleCommonError(error, res, 'creating blueprint');
  }
});

/**
 * PUT /blueprints/:blueprintId - Update blueprint
 */
router.put('/blueprints/:blueprintId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: CategorySchema.optional(),
        usageCount: z.number().min(0).optional(),
        metadata: z.object({}).passthrough().optional(),
      }),
      req.body,
      res,
      'blueprint update data'
    );
    if (!bodyValidation) return;

    const { blueprintId } = paramValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const updatedBlueprint = await blueprintService.updateBlueprint(blueprintId, bodyValidation);

    if (!updatedBlueprint) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Blueprint not found', 404, {
        resource: 'blueprint',
        id: blueprintId,
      });
      return;
    }

    sendSuccess(res, updatedBlueprint, 200);
  } catch (error) {
    handleCommonError(error, res, 'updating blueprint');
  }
});

/**
 * DELETE /blueprints/:blueprintId - Delete blueprint
 */
router.delete('/blueprints/:blueprintId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    const { blueprintId } = paramValidation;

    // Verify blueprint exists
    const blueprintService = new BlueprintService();
    const blueprint = await blueprintService.getBlueprintById(blueprintId);
    if (!blueprint) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Blueprint not found', 404, {
        resource: 'blueprint',
        id: blueprintId,
      });
      return;
    }

    await blueprintService.deleteBlueprint(blueprintId);

    sendSuccess(res, { message: 'Blueprint deleted successfully' }, 200);
  } catch (error) {
    handleCommonError(error, res, 'deleting blueprint');
  }
});

/**
 * GET /blueprints/category/:category - Get blueprints by category
 */
router.get('/blueprints/category/:category', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate category parameter
    const paramValidation = validateData(z.object({ category: CategorySchema }), req.params, res, 'category parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { category } = paramValidation;
    const { page, limit } = paginationValidation;

    // Use service layer for data access
    const blueprintService = new BlueprintService();
    const allBlueprints = await blueprintService.getBlueprintsByCategory(category);

    // Apply pagination
    const offset = (page - 1) * limit;
    const blueprints = allBlueprints.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allBlueprints.length);
    sendSuccess(res, blueprints, 200, paginationMeta);
  } catch (error) {
    handleCommonError(error, res, 'fetching blueprints by category');
  }
});

/**
 * POST /blueprints/:blueprintId/clone - Clone blueprint
 */
router.post('/blueprints/:blueprintId/clone', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
        description: z.string().optional(),
        category: CategorySchema.optional(),
        metadata: z.object({}).passthrough().optional(),
      }),
      req.body,
      res,
      'blueprint clone data'
    );
    if (!bodyValidation) return;

    const { blueprintId } = paramValidation;
    const { name, ...modifications } = bodyValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const clonedBlueprint = await blueprintService.cloneBlueprint(blueprintId, name, modifications);

    // Track usage of the original blueprint
    await blueprintService.trackBlueprintUsage(blueprintId);

    sendSuccess(res, clonedBlueprint, 201);
  } catch (error) {
    handleCommonError(error, res, 'cloning blueprint');
  }
});

/**
 * GET /blueprints/popular - Get popular blueprints
 */
router.get('/blueprints/popular', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate query parameters
    const queryValidation = validateData(
      z.object({
        limit: z.coerce.number().int().min(1).max(50).default(10),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { limit } = queryValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const popularBlueprints = await blueprintService.getPopularBlueprints(limit);

    sendSuccess(res, popularBlueprints, 200);
  } catch (error) {
    handleCommonError(error, res, 'fetching popular blueprints');
  }
});

/**
 * POST /blueprints/:blueprintId/track-usage - Track blueprint usage
 */
router.post('/blueprints/:blueprintId/track-usage', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    const { blueprintId } = paramValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    await blueprintService.trackBlueprintUsage(blueprintId);

    sendSuccess(res, { message: 'Blueprint usage tracked successfully' }, 200);
  } catch (error) {
    handleCommonError(error, res, 'tracking blueprint usage');
  }
});

/**
 * GET /blueprints/:blueprintId/stats - Get blueprint statistics
 */
router.get('/blueprints/:blueprintId/stats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    const { blueprintId } = paramValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const stats = await blueprintService.getBlueprintStats(blueprintId);

    if (!stats) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Blueprint not found', 404, {
        resource: 'blueprint',
        id: blueprintId,
      });
      return;
    }

    sendSuccess(res, stats, 200);
  } catch (error) {
    handleCommonError(error, res, 'fetching blueprint statistics');
  }
});

/**
 * POST /blueprints/:blueprintId/validate - Validate blueprint structure
 */
router.post('/blueprints/:blueprintId/validate', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate blueprintId parameter
    const paramValidation = validateData(z.object({ blueprintId: NanoidSchema }), req.params, res, 'blueprint parameter');
    if (!paramValidation) return;

    const { blueprintId } = paramValidation;

    // Use service layer for business logic
    const blueprintService = new BlueprintService();
    const validation = await blueprintService.validateBlueprintStructure(blueprintId);

    sendSuccess(res, validation, 200);
  } catch (error) {
    handleCommonError(error, res, 'validating blueprint structure');
  }
});

export default router;
