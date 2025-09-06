import { jwtAuthMiddleware } from '@/middleware/jwt-auth';
import { ExecutionService } from '@/services/ExecutionService';
import { createPaginationMeta, handleCommonError, sendError, sendSuccess } from '@/utils/responseHelpers';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z, ZodError } from 'zod';

const router: Router = Router();

// Zod schemas for validation
const UuidSchema = z.string().uuid('Invalid UUID format');
const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const ExecutionStatusSchema = z.enum(['pending', 'running', 'paused', 'completed', 'failed', 'cancelled']);

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
 * GET /executions - Get all executions with optional filtering
 */
router.get('/executions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    // Validate optional filters
    const queryValidation = validateData(
      z.object({
        status: ExecutionStatusSchema.optional(),
        workflowId: UuidSchema.optional(),
      }),
      req.query,
      res,
      'query parameters'
    );
    if (!queryValidation) return;

    const { page, limit } = paginationValidation;
    const { status, workflowId } = queryValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    let executions;

    if (status) {
      executions = await executionService.getExecutionsByStatus(status);
    } else if (workflowId) {
      executions = await executionService.getExecutionsByWorkflow(workflowId);
    } else {
      // For now, return active executions by default to avoid overwhelming response
      executions = await executionService.getActiveExecutions();
    }

    // Apply pagination
    const offset = (page - 1) * limit;
    const paginatedExecutions = executions.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, executions.length);
    sendSuccess(res, paginatedExecutions, 200, paginationMeta);
  } catch (error) {
    handleCommonError(error, res, 'fetching executions');
  }
});

/**
 * GET /executions/:executionId - Get execution by ID
 */
router.get('/executions/:executionId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    const { executionId } = paramValidation;

    // Use service layer for data access
    const executionService = new ExecutionService();
    const execution = await executionService.getExecutionById(executionId);

    if (!execution) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Execution not found', 404, {
        resource: 'execution',
        id: executionId,
      });
      return;
    }

    sendSuccess(res, execution, 200);
  } catch (error) {
    handleCommonError(error, res, 'fetching execution details');
  }
});

/**
 * POST /executions - Create new execution
 */
router.post('/executions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        workflowId: UuidSchema,
        executionData: z.object({}).passthrough().optional(),
      }),
      req.body,
      res,
      'execution creation data'
    );
    if (!bodyValidation) return;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const execution = await executionService.createExecution(bodyValidation);

    sendSuccess(res, execution, 201);
  } catch (error) {
    handleCommonError(error, res, 'creating execution');
  }
});

/**
 * PUT /executions/:executionId - Update execution
 */
router.put('/executions/:executionId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    // Validate request body
    const bodyValidation = validateData(
      z.object({
        status: ExecutionStatusSchema.optional(),
        currentNodeRef: z.string().optional(),
        executionData: z.object({}).passthrough().optional(),
        result: z.object({}).passthrough().optional(),
        error: z.string().optional(),
      }),
      req.body,
      res,
      'execution update data'
    );
    if (!bodyValidation) return;

    const { executionId } = paramValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const updatedExecution = await executionService.updateExecution(executionId, bodyValidation as any);

    if (!updatedExecution) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Execution not found', 404, {
        resource: 'execution',
        id: executionId,
      });
      return;
    }

    sendSuccess(res, updatedExecution, 200);
  } catch (error) {
    handleCommonError(error, res, 'updating execution');
  }
});

/**
 * DELETE /executions/:executionId - Delete execution
 */
router.delete('/executions/:executionId', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    const { executionId } = paramValidation;

    // Verify execution exists
    const executionService = new ExecutionService();
    const execution = await executionService.getExecutionById(executionId);
    if (!execution) {
      sendError(res, 'RESOURCE_NOT_FOUND', 'Execution not found', 404, {
        resource: 'execution',
        id: executionId,
      });
      return;
    }

    const deleted = await executionService.deleteExecution(executionId);

    if (deleted) {
      sendSuccess(res, { message: 'Execution deleted successfully' }, 200);
    } else {
      sendError(res, 'INTERNAL_SERVER_ERROR', 'Failed to delete execution');
    }
  } catch (error) {
    handleCommonError(error, res, 'deleting execution');
  }
});

/**
 * POST /executions/:executionId/start - Start execution
 */
router.post('/executions/:executionId/start', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    const { executionId } = paramValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const execution = await executionService.startExecution(executionId);

    sendSuccess(res, execution, 200);
  } catch (error) {
    handleCommonError(error, res, 'starting execution');
  }
});

/**
 * POST /executions/:executionId/pause - Pause execution
 */
router.post('/executions/:executionId/pause', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    const { executionId } = paramValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const execution = await executionService.pauseExecution(executionId);

    sendSuccess(res, execution, 200);
  } catch (error) {
    handleCommonError(error, res, 'pausing execution');
  }
});

/**
 * POST /executions/:executionId/resume - Resume execution
 */
router.post('/executions/:executionId/resume', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    const { executionId } = paramValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const execution = await executionService.resumeExecution(executionId);

    sendSuccess(res, execution, 200);
  } catch (error) {
    handleCommonError(error, res, 'resuming execution');
  }
});

/**
 * POST /executions/:executionId/cancel - Cancel execution
 */
router.post('/executions/:executionId/cancel', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate executionId parameter
    const paramValidation = validateData(z.object({ executionId: UuidSchema }), req.params, res, 'execution parameter');
    if (!paramValidation) return;

    // Validate optional reason
    const bodyValidation = validateData(
      z.object({
        reason: z.string().optional(),
      }),
      req.body,
      res,
      'cancellation data'
    );
    if (!bodyValidation) return;

    const { executionId } = paramValidation;
    const { reason } = bodyValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const execution = await executionService.cancelExecution(executionId, reason);

    sendSuccess(res, execution, 200);
  } catch (error) {
    handleCommonError(error, res, 'cancelling execution');
  }
});

/**
 * GET /workflows/:workflowId/executions - Get executions by workflow
 */
router.get('/workflows/:workflowId/executions', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: UuidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    // Validate pagination query parameters
    const paginationValidation = validateData(PaginationSchema, req.query, res, 'pagination parameters');
    if (!paginationValidation) return;

    const { workflowId } = paramValidation;
    const { page, limit } = paginationValidation;

    // Use service layer for data access
    const executionService = new ExecutionService();
    const allExecutions = await executionService.getExecutionsByWorkflow(workflowId);

    // Apply pagination
    const offset = (page - 1) * limit;
    const executions = allExecutions.slice(offset, offset + limit);

    const paginationMeta = createPaginationMeta(page, limit, allExecutions.length);
    sendSuccess(res, executions, 200, paginationMeta);
  } catch (error) {
    handleCommonError(error, res, 'fetching workflow executions');
  }
});

/**
 * GET /workflows/:workflowId/executions/stats - Get execution statistics for workflow
 */
router.get('/workflows/:workflowId/executions/stats', jwtAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // Authentication check
    if (!checkAuth(req, res)) return;

    // Validate workflowId parameter
    const paramValidation = validateData(z.object({ workflowId: UuidSchema }), req.params, res, 'workflow parameter');
    if (!paramValidation) return;

    const { workflowId } = paramValidation;

    // Use service layer for business logic
    const executionService = new ExecutionService();
    const stats = await executionService.getExecutionStats(workflowId);

    sendSuccess(res, stats, 200);
  } catch (error) {
    handleCommonError(error, res, 'fetching execution statistics');
  }
});

export default router;
