import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { WorkflowService } from '@/services/WorkflowService';
import { createPaginationMeta, handleError, sendError, sendSuccess } from '@/utils/responseHelpers';
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
const CategorySchema = z.enum(['general', 'data-processing', 'automation', 'integration', 'analysis']);
const ExecutionModeSchema = z.enum(['simple', 'workflow']);
const StarshipClassSchema = z.enum(['scout', 'cruiser']);

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
 * GET /workflows - Get all workflows with optional filtering
 */
router.get('/workflows', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    // Validate optional filters
    const queryValidation = validateData(
      z.object({
        category: CategorySchema.optional(),
        authorId: NanoidSchema.optional(),
        starshipId: NanoidSchema.optional(),
        isPublic: z.coerce.boolean().optional(),
        tags: z
          .string()
          .transform((val) => val.split(','))
          .optional(),
        starshipClass: StarshipClassSchema.optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { page, limit } = paginationValidation;
    const { category, authorId, isPublic, tags, starshipClass } = queryValidation;

    // Use service layer for business logic (static methods for API responses)
    let workflows;

    if (Object.keys(queryValidation).length > 0) {
      // Use instance method for filtering
      const workflowService = new WorkflowService();
      workflows = await workflowService.getWorkflowsWithFilters({
        category,
        authorId,
        isPublic,
        tags,
        starshipClass,
      });
      // Convert Workflow instances to WorkflowModel for API response
      workflows = workflows.map(() => {
        return {
          name: 'Workflow', // TODO: Get proper name from workflow
          // Add other required WorkflowModel fields
          id: 'temp-id', // TODO: Add proper ID field
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
    } else {
      // Get all workflows using instance method
      const workflowService = new WorkflowService();
      const workflowInstances = await workflowService.getAllWorkflows();
      workflows = workflowInstances.map(() => {
        return {
          name: 'Workflow', // TODO: Get proper name from workflow
          // Add other required WorkflowModel fields
          id: 'temp-id', // TODO: Add proper ID field
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedWorkflows = workflows.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, workflows.length);
    sendSuccess(res, paginatedWorkflows, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching workflows');
  }
});

/**
 * GET /workflows/:workflowId - Get workflow by ID
 */
router.get('/workflows/:workflowId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: NanoidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    const { workflowId } = paramValidation;

    // Use service layer for data access
    const workflow = await WorkflowService.getWorkflow(workflowId);

    if (!workflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow not found', 404, {
        resource: 'workflow',
        id: workflowId,
      });
      return;
    }

    sendSuccess(res, workflow, 200);
  } catch (error) {
    handleError(error, res, 'fetching workflow details');
  }
});

/**
 * POST /workflows - Create new workflow
 */
router.post('/workflows', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
        description: z.string().optional(),
        category: CategorySchema,
        starshipId: NanoidSchema.optional(),
        isPublic: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        executionMode: ExecutionModeSchema.optional(),
        blueprint: z.any().optional(), // TODO: Add proper Blueprint validation
        timeout: z.number().min(1000).optional(),
      }),
      req.body,
      res,
      'workflow creation data'
    );
    if (!bodyValidation) return;

    // Use service layer for business logic
    const workflow = await WorkflowService.createWorkflow({
      ...bodyValidation,
    }); // Cast to avoid type error since authorId will be added to the interface

    sendSuccess(res, workflow, 201);
  } catch (error) {
    handleError(error, res, 'creating workflow');
  }
});

/**
 * PUT /workflows/:workflowId - Update workflow
 */
router.put('/workflows/:workflowId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: NanoidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        name: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        category: CategorySchema.optional(),
        isPublic: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        executionMode: ExecutionModeSchema.optional(),
        blueprint: z.any().optional(), // TODO: Add proper Blueprint validation
        timeout: z.number().min(1000).optional(),
        version: z.string().optional(),
      }),
      req.body,
      res,
      'workflow update data'
    );
    if (!bodyValidation) return;

    const { workflowId } = paramValidation;
    const userId = req.user!.id;

    // Use service layer for business logic and authorization

    // Check if user owns the workflow
    const existingWorkflow = await WorkflowService.getWorkflow(workflowId);
    if (!existingWorkflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow not found', 404, {
        resource: 'workflow',
        id: workflowId,
      });
      return;
    }

    if (existingWorkflow.authorId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only update your own workflows', 403);
      return;
    }

    const updatedWorkflow = await WorkflowService.updateWorkflow(workflowId, bodyValidation);

    if (!updatedWorkflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow not found', 404, {
        resource: 'workflow',
        id: workflowId,
      });
      return;
    }

    sendSuccess(res, updatedWorkflow, 200);
  } catch (error) {
    handleError(error, res, 'updating workflow');
  }
});

/**
 * DELETE /workflows/:workflowId - Delete workflow
 */
router.delete('/workflows/:workflowId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: NanoidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    const { workflowId } = paramValidation;
    const userId = req.user!.id;

    // Use service layer for business logic and authorization

    // Check if user owns the workflow
    const existingWorkflow = await WorkflowService.getWorkflow(workflowId);
    if (!existingWorkflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow not found', 404, {
        resource: 'workflow',
        id: workflowId,
      });
      return;
    }

    if (existingWorkflow.authorId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only delete your own workflows', 403);
      return;
    }

    const deleted = await WorkflowService.deleteWorkflow(workflowId);

    if (deleted) {
      sendSuccess(res, { message: 'Workflow deleted successfully' }, 200);
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete workflow');
    }
  } catch (error) {
    handleError(error, res, 'deleting workflow');
  }
});

/**
 * GET /workflows/category/:category - Get workflows by category
 */
router.get('/workflows/category/:category', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
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
    const allWorkflows = await WorkflowService.getWorkflowsByCategory(category);

    // Apply pagination
    const offset = (page - 1) * limit;
    const workflows = allWorkflows.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allWorkflows.length);
    sendSuccess(res, workflows, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching workflows by category');
  }
});

/**
 * GET /workflows/author/:authorId - Get workflows by author
 */
router.get('/workflows/author/:authorId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate authorId parameter
    const paramValidation = validateData(z.object({ authorId: NanoidSchema }), req.params, res, 'author parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { authorId } = paramValidation;
    const { page, limit } = paginationValidation;
    const userId = req.user!.id;

    // Users can only view their own private workflows
    if (authorId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only view your own workflows', 403);
      return;
    }

    // Use service layer for data access
    const allWorkflows = await WorkflowService.getWorkflowsByAuthor(authorId);

    // Apply pagination
    const offset = (page - 1) * limit;
    const workflows = allWorkflows.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allWorkflows.length);
    sendSuccess(res, workflows, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching workflows by author');
  }
});

/**
 * GET /workflows/public - Get public workflows
 */
router.get('/workflows/public', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { page, limit } = paginationValidation;

    // Use service layer for data access
    const offset = (page - 1) * limit;
    const workflows = await WorkflowService.getPublicWorkflows(limit, offset);

    const paginationMeta = createPaginationMeta(page, limit, workflows.length);
    sendSuccess(res, workflows, 200, paginationMeta);
  } catch (error) {
    handleError(error, res, 'fetching public workflows');
  }
});

/**
 * POST /workflows/:workflowId/deploy - Deploy workflow to starship
 */
router.post('/workflows/:workflowId/deploy', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: NanoidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        starshipId: NanoidSchema,
      }),
      req.body,
      res,
      'deployment data'
    );
    if (!bodyValidation) return;

    const { workflowId } = paramValidation;
    const { starshipId } = bodyValidation;
    const userId = req.user!.id;

    // Use service layer for business logic

    // Check if user owns the workflow
    const workflow = await WorkflowService.getWorkflow(workflowId);
    if (!workflow) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Workflow not found', 404, {
        resource: 'workflow',
        id: workflowId,
      });
      return;
    }

    if (workflow.authorId !== userId) {
      sendError(res, 'ACCESS_DENIED', 'You can only deploy your own workflows', 403);
      return;
    }

    // Use instance method for deployment
    const workflowService = new WorkflowService();
    await workflowService.deployWorkflow(workflowId, starshipId);

    sendSuccess(
      res,
      {
        message: 'Workflow deployed successfully',
        deployedAt: new Date().toISOString(),
      },
      200
    );
  } catch (error) {
    handleError(error, res, 'deploying workflow');
  }
});

/**
 * POST /workflows/:workflowId/track-usage - Track workflow usage
 */
router.post('/workflows/:workflowId/track-usage', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: NanoidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    const { workflowId } = paramValidation;

    // Use service layer for business logic
    await WorkflowService.trackUsage(workflowId);

    sendSuccess(res, { message: 'Workflow usage tracked successfully' }, 200);
  } catch (error) {
    handleError(error, res, 'tracking workflow usage');
  }
});

/**
 * POST /workflows/search - Search workflows
 */
router.post('/workflows/search', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        query: z.string().min(1, 'Search query is required'),
      }),
      req.body,
      res,
      'search data'
    );
    if (!bodyValidation) return;

    const { query } = bodyValidation;

    // Use service layer for business logic
    const workflows = await WorkflowService.searchWorkflows(query);

    sendSuccess(res, workflows, 200);
  } catch (error) {
    handleError(error, res, 'searching workflows');
  }
});

export default router;
