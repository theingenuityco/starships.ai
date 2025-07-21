/**
 * Expedition API Routes
 *
 * Complete REST API endpoints for expedition management including CRUD operations,
 * control actions, task management, messaging, and results.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  validateCreateExpedition,
  validateUpdateExpedition,
  validateCreateTask,
  validateSendMessage,
  validateCreateResult,
  validateQualityScore,
  validateTaskAssignment,
  validateTaskCompletion,
} from '../middleware/validation';
import {
  ExpeditionService,
  FirstOfficerService,
  TaskService,
  MessageService,
  ResultService,
  ServiceFactory,
} from '../services';
import {
  CreateExpeditionRequest,
  UpdateExpeditionRequest,
  SendMessageRequest,
  CreateTaskRequest,
  CreateResultRequest,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
} from '@starships/protocol';
import { SocketIOService } from '../services/SocketIOService';

const router: Router = Router();

// Get service instances using ServiceFactory
const expeditionService = ServiceFactory.getExpeditionService();
const firstOfficerService = ServiceFactory.getFirstOfficerService();
const taskService = ServiceFactory.getTaskService();
const messageService = ServiceFactory.getMessageService();
const resultService = ServiceFactory.getResultService();

// Helper function to safely get SocketIO service
function getSocketService() {
  try {
    return SocketIOService.getInstance();
  } catch (error) {
    console.warn('[EXPEDITION-API] SocketIO service not available:', error);
    return null;
  }
}

// Helper function to emit Socket.IO events with error handling
async function emitSocketEvent(
  eventType: string,
  expeditionId: string,
  data: any,
  userId?: string
) {
  const socketService = getSocketService();
  if (!socketService) return;

  try {
    // Emit to expedition room
    await socketService.emitToExpeditionRoomWithRetry(expeditionId, eventType as any, data);

    // Also emit to user room if specified
    if (userId) {
      await socketService.emitToUserWithRetry(userId, eventType as any, data);
    }

    console.log(
      `[EXPEDITION-API] Socket event emitted: ${eventType} for expedition ${expeditionId}`
    );
  } catch (error) {
    console.error(`[EXPEDITION-API] Failed to emit socket event ${eventType}:`, error);
  }
}

// ============================================================================
// EXPEDITION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/starships/:starshipId/expeditions
 * Create a new expedition
 */
router.post(
  '/starships/:starshipId/expeditions',
  authMiddleware,
  validateCreateExpedition,
  async (req: Request, res: Response) => {
    try {
      const { starshipId } = req.params;
      const userId = req.user!.id;
      const createRequest: CreateExpeditionRequest = {
        starshipId,
        ...req.body,
      };

      console.log(`[EXPEDITION-API] Creating expedition for starship: ${starshipId}`, {
        userId,
        requestBody: req.body,
        createRequest,
      });

      const expeditionResponse = await expeditionService.createExpedition(userId, createRequest);

      console.log(
        `[EXPEDITION-API] Expedition created successfully: ${expeditionResponse.expedition.id}`
      );

      // Emit real-time event for expedition creation
      await emitSocketEvent(
        'expedition:created',
        expeditionResponse.expedition.id,
        {
          expeditionId: expeditionResponse.expedition.id,
          expedition: {
            id: expeditionResponse.expedition.id,
            title: expeditionResponse.expedition.title,
            objective: expeditionResponse.expedition.objective,
            status: expeditionResponse.expedition.status,
            priority: expeditionResponse.expedition.priority,
            starshipId: expeditionResponse.expedition.starshipId,
            createdBy: userId,
            createdAt: expeditionResponse.expedition.createdAt,
          },
          timestamp: new Date().toISOString(),
        },
        userId
      );

      res.status(201).json({
        success: true,
        data: expeditionResponse,
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to create expedition - Enhanced Debug:', {
        error,
        errorMessage: error.message,
        errorCode: error.code,
        errorStack: error.stack,
        errorType: typeof error,
        errorConstructor: error.constructor?.name,
        starshipId: req.params.starshipId,
        userId: req.user?.id,
        requestBody: req.body,
      });

      res.status(error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 : 500).json({
        success: false,
        error: error.message || 'Failed to create expedition',
        code: error.code || 'UNKNOWN_ERROR',
        debug: {
          errorType: error.constructor?.name,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions
 * Get all expeditions for a starship
 */
router.get(
  '/starships/:starshipId/expeditions',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { starshipId } = req.params;
      const userId = req.user!.id;

      // Parse query parameters
      const filters: ExpeditionFilters = {};
      const sort: ExpeditionSort = {
        field: (req.query.sortField as any) || 'createdAt',
        direction: (req.query.sortDirection as any) || 'desc',
      };
      const pagination: PaginationOptions = {
        page: Math.floor(parseInt(req.query.page as string, 10) || 1),
        limit: Math.floor(parseInt(req.query.limit as string, 10) || 20),
      };

      // Parse filters
      if (req.query.status) {
        filters.status = Array.isArray(req.query.status)
          ? (req.query.status as any[])
          : [req.query.status as any];
      }
      if (req.query.priority) {
        filters.priority = Array.isArray(req.query.priority)
          ? (req.query.priority as any[])
          : [req.query.priority as any];
      }
      if (req.query.tags) {
        filters.tags = Array.isArray(req.query.tags)
          ? (req.query.tags as string[])
          : [req.query.tags as string];
      }
      if (req.query.search) {
        filters.search = req.query.search as string;
      }

      console.log(`[EXPEDITION-API] Getting expeditions for starship: ${starshipId}`);

      const expeditionList = await expeditionService.getExpeditions(
        starshipId,
        userId,
        filters,
        sort,
        pagination
      );

      res.json({
        success: true,
        data: expeditionList,
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get expeditions:', error);
      res.status(error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 : 500).json({
        success: false,
        error: error.message || 'Failed to get expeditions',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/stats
 * Get expedition statistics for a starship
 */
router.get(
  '/starships/:starshipId/expeditions/stats',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { starshipId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting expedition stats for starship: ${starshipId}`);

      const stats = await expeditionService.getExpeditionStats(starshipId, userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get expedition stats:', error);
      res.status(error.code === 'STARSHIP_NOT_FOUND' ? 404 : 500).json({
        success: false,
        error: error.message || 'Failed to get expedition stats',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/active
 * Get all active expeditions for a starship
 */
router.get(
  '/starships/:starshipId/expeditions/active',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { starshipId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting active expeditions for starship: ${starshipId}`);

      // Get active expeditions
      const filters: ExpeditionFilters = { status: ['planning', 'in-progress'] as any[] };
      const expeditionList = await expeditionService.getExpeditions(starshipId, userId, filters);

      // Get active expedition IDs from First Officer Service
      const activeExpeditionIds = firstOfficerService.getActiveExpeditionIds();

      // Enhance with real-time status
      const activeExpeditions = expeditionList.expeditions.map((expedition) => ({
        ...expedition,
        isActivelyProcessing: activeExpeditionIds.includes(expedition.id),
      }));

      res.json({
        success: true,
        data: {
          expeditions: activeExpeditions,
          total: activeExpeditions.length,
          activeCount: firstOfficerService.getActiveExpeditionsCount(),
        },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get active expeditions:', error);
      const statusCode = error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get active expeditions',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId
 * Get specific expedition details
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting expedition: ${expeditionId}`);

      const expeditionResponse = await expeditionService.getExpedition(expeditionId, userId);

      res.json({
        success: true,
        data: expeditionResponse,
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get expedition',
        code: error.code,
      });
    }
  }
);

/**
 * PUT /api/starships/:starshipId/expeditions/:expeditionId
 * Update expedition details
 */
router.put(
  '/starships/:starshipId/expeditions/:expeditionId',
  authMiddleware,
  validateUpdateExpedition,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;
      const updateRequest: UpdateExpeditionRequest = req.body;

      console.log(`[EXPEDITION-API] Updating expedition: ${expeditionId}`);

      const expeditionResponse = await expeditionService.updateExpedition(
        expeditionId,
        userId,
        updateRequest
      );

      res.json({
        success: true,
        data: expeditionResponse,
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to update expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'EXPEDITION_CANNOT_MODIFY'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to update expedition',
        code: error.code,
      });
    }
  }
);

/**
 * DELETE /api/starships/:starshipId/expeditions/:expeditionId
 * Delete expedition
 */
router.delete(
  '/starships/:starshipId/expeditions/:expeditionId',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Deleting expedition: ${expeditionId}`);

      await expeditionService.deleteExpedition(expeditionId, userId);

      res.json({
        success: true,
        message: 'Expedition deleted successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to delete expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'EXPEDITION_CANNOT_DELETE'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to delete expedition',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// EXPEDITION CONTROL ENDPOINTS
// ============================================================================

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/start
 * Start expedition execution
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/start',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Starting expedition: ${expeditionId}`);

      const expeditionResponse = await expeditionService.startExpedition(expeditionId, userId);

      // Emit real-time event for expedition start
      await emitSocketEvent(
        'expedition:started',
        expeditionId,
        {
          expeditionId,
          status: 'in-progress',
          previousStatus: 'draft',
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
        userId
      );

      // Also emit status update with progress
      await emitSocketEvent('expedition:status-update', expeditionId, {
        expeditionId,
        progress: {
          overall: 0,
          currentPhase: 'initializing',
          completedTasks: 0,
          totalTasks: 0,
          lastActivity: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: expeditionResponse,
        message: 'Expedition started successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to start expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'INVALID_STATUS_TRANSITION'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to start expedition',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/pause
 * Pause expedition execution
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/pause',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Pausing expedition: ${expeditionId}`);

      const expeditionResponse = await expeditionService.pauseExpedition(expeditionId, userId);

      // Emit real-time event for expedition pause
      await emitSocketEvent(
        'expedition:paused',
        expeditionId,
        {
          expeditionId,
          status: 'paused',
          previousStatus: 'in-progress',
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
        userId
      );

      res.json({
        success: true,
        data: expeditionResponse,
        message: 'Expedition paused successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to pause expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'INVALID_STATUS_TRANSITION'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to pause expedition',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/resume
 * Resume expedition execution
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/resume',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Resuming expedition: ${expeditionId}`);

      const expeditionResponse = await expeditionService.resumeExpedition(expeditionId, userId);

      // Emit real-time event for expedition resume
      await emitSocketEvent(
        'expedition:resumed',
        expeditionId,
        {
          expeditionId,
          status: 'in-progress',
          previousStatus: 'paused',
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
        userId
      );

      res.json({
        success: true,
        data: expeditionResponse,
        message: 'Expedition resumed successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to resume expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'INVALID_STATUS_TRANSITION'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to resume expedition',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/cancel
 * Cancel expedition execution
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/cancel',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Cancelling expedition: ${expeditionId}`);

      await expeditionService.cancelExpedition(expeditionId, userId);

      // Emit real-time event for expedition cancellation
      await emitSocketEvent(
        'expedition:cancelled',
        expeditionId,
        {
          expeditionId,
          status: 'cancelled',
          previousStatus: 'in-progress',
          changedBy: userId,
          timestamp: new Date().toISOString(),
        },
        userId
      );

      res.json({
        success: true,
        message: 'Expedition cancelled successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to cancel expedition:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'INVALID_STATUS_TRANSITION'
              ? 400
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to cancel expedition',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// TASK MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/tasks
 * Get all tasks for an expedition
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/tasks',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting tasks for expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get tasks from repository
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const tasks = await taskRepo.findByExpedition(expeditionId);

      res.json({
        success: true,
        data: { tasks },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get tasks:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get tasks',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/tasks
 * Create a new task for an expedition
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/tasks',
  authMiddleware,
  validateCreateTask,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;
      const createTaskRequest: CreateTaskRequest = {
        expeditionId,
        ...req.body,
      };

      console.log(`[EXPEDITION-API] Creating task for expedition: ${expeditionId}`);

      // Use TaskService for task creation
      const task = await taskService.createTask(userId, createTaskRequest);

      res.status(201).json({
        success: true,
        data: { task },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to create task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to create task',
        code: error.code,
      });
    }
  }
);

/**
 * PUT /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId
 * Update a task
 */
router.put(
  '/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, taskId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Updating task: ${taskId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Update task
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.update(taskId, {
        ...req.body,
        updatedAt: new Date().toISOString(),
      });

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: { task },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to update task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to update task',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId
 * Get specific task details
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, taskId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting task: ${taskId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get task from repository
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      // Verify task belongs to expedition
      if (task.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Task not found in this expedition',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: { task },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get task',
        code: error.code,
      });
    }
  }
);

/**
 * DELETE /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId
 * Delete a task
 */
router.delete(
  '/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, taskId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Deleting task: ${taskId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get task to verify it exists and belongs to expedition
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task || task.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      // Check if task can be deleted (not in progress or completed)
      if (['in-progress', 'completed'].includes(task.status)) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete task in current status',
          code: 'TASK_CANNOT_DELETE',
        });
        return;
      }

      // Delete task
      const deleted = await taskRepo.delete(taskId);

      if (!deleted) {
        res.status(500).json({
          success: false,
          error: 'Failed to delete task',
          code: 'DELETE_FAILED',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Task deleted successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to delete task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to delete task',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId/assign
 * Assign task to an agent
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId/assign',
  authMiddleware,
  validateTaskAssignment,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, taskId } = req.params;
      const { agentId } = req.body;
      const userId = req.user!.id;

      console.log(
        `[EXPEDITION-API] Assigning task: ${taskId} to agent: ${agentId} in expedition: ${expeditionId}`
      );

      // Validate required fields
      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get task to verify it exists and belongs to expedition
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task || task.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      // Check if task can be assigned
      if (!['pending', 'failed'].includes(task.status)) {
        res.status(400).json({
          success: false,
          error: 'Task cannot be assigned in current status',
          code: 'TASK_CANNOT_ASSIGN',
        });
        return;
      }

      // Verify agent exists and belongs to the starship
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agent = await agentRepo.findById(agentId);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found',
          code: 'AGENT_NOT_FOUND',
        });
        return;
      }

      // Get expedition to check starship
      const expedition = await expeditionService.getExpedition(expeditionId, userId);
      if (agent.starshipId !== expedition.expedition.starshipId) {
        res.status(400).json({
          success: false,
          error: 'Agent does not belong to this starship',
          code: 'AGENT_NOT_AVAILABLE',
        });
        return;
      }

      // Assign task to agent
      const updatedTask = await taskRepo.assignToAgent(taskId, agentId);

      if (!updatedTask) {
        res.status(500).json({
          success: false,
          error: 'Failed to assign task',
          code: 'ASSIGNMENT_FAILED',
        });
        return;
      }

      // Emit real-time event for task assignment
      await emitSocketEvent('expedition:task-assigned', expeditionId, {
        expeditionId,
        taskId,
        task: {
          id: updatedTask.id,
          title: updatedTask.title,
          description: updatedTask.description,
          status: updatedTask.status,
          priority: updatedTask.priority,
          assignedTo: updatedTask.assignedAgentId,
          agentId: updatedTask.assignedAgentId,
          estimatedEffort: updatedTask.estimatedEffort,
        },
        assignedBy: userId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: { task: updatedTask },
        message: 'Task assigned successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to assign task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'TASK_NOT_FOUND'
              ? 404
              : error.code === 'AGENT_NOT_FOUND'
                ? 404
                : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to assign task',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId/complete
 * Mark task as completed
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId/complete',
  authMiddleware,
  validateTaskCompletion,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, taskId } = req.params;
      const { result } = req.body;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Completing task: ${taskId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get task to verify it exists and belongs to expedition
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const task = await taskRepo.findById(taskId);

      if (!task || task.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Task not found',
          code: 'TASK_NOT_FOUND',
        });
        return;
      }

      // Check if task can be completed
      if (!['assigned', 'in-progress'].includes(task.status)) {
        res.status(400).json({
          success: false,
          error: 'Task cannot be completed in current status',
          code: 'TASK_CANNOT_COMPLETE',
        });
        return;
      }

      // Update task status and result
      const updates: any = {
        status: 'completed',
        updatedAt: new Date().toISOString(),
      };

      if (result) {
        updates.result = result;
      }

      const updatedTask = await taskRepo.update(taskId, updates);

      if (!updatedTask) {
        res.status(500).json({
          success: false,
          error: 'Failed to complete task',
          code: 'COMPLETION_FAILED',
        });
        return;
      }

      // Emit real-time event for task completion
      await emitSocketEvent('expedition:task-completed', expeditionId, {
        expeditionId,
        taskId,
        task: {
          id: updatedTask.id,
          title: updatedTask.title,
          status: updatedTask.status,
          result: updatedTask.result,
          completedAt: updatedTask.updatedAt || new Date().toISOString(),
          completedBy: updatedTask.assignedAgentId,
          agentId: updatedTask.assignedAgentId,
        },
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: { task: updatedTask },
        message: 'Task completed successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to complete task:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'TASK_NOT_FOUND'
              ? 404
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to complete task',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// MESSAGING ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages
 * Get all messages for an expedition
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/messages',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, starshipId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[EXPEDITION-API] Getting messages for expedition: ${expeditionId} in starship: ${starshipId}`
      );

      // Validate expedition access first
      console.log(`[EXPEDITION-API] Validating expedition access...`);
      await expeditionService.getExpedition(expeditionId, userId);
      console.log(`[EXPEDITION-API] Expedition access validated successfully`);

      // Get messages from repository
      console.log(`[EXPEDITION-API] Fetching messages from repository...`);
      const { RepositoryFactory } = await import('@starships/models');
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const messages = await messageRepo.findByExpedition(expeditionId);
      console.log(
        `[EXPEDITION-API] Found ${messages.length} messages for expedition: ${expeditionId}`
      );

      res.json({
        success: true,
        data: { messages },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get messages:', error);
      console.error('[EXPEDITION-API] Error stack:', error.stack);
      console.error('[EXPEDITION-API] Error code:', error.code);
      console.error('[EXPEDITION-API] Error message:', error.message);

      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'RESOURCE_NOT_FOUND'
              ? 404
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get messages',
        code: error.code || 'UNKNOWN_ERROR',
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/messages
 * Send a message to an expedition
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/messages',
  authMiddleware,
  validateSendMessage,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;
      const sendMessageRequest: SendMessageRequest = {
        expeditionId,
        ...req.body,
      };

      console.log(`[EXPEDITION-API] Sending message to expedition: ${expeditionId}`);

      // Use MessageService for message handling
      const message = await messageService.sendMessage(userId, sendMessageRequest);

      res.json({
        success: true,
        data: { message },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to send message:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to send message',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages/:messageId/thread
 * Get message thread
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/messages/:messageId/thread',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, messageId } = req.params;
      const userId = req.user!.id;

      console.log(
        `[EXPEDITION-API] Getting message thread: ${messageId} in expedition: ${expeditionId}`
      );

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get message thread from repository
      const { RepositoryFactory } = await import('@starships/models');
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const thread = await messageRepo.findByThread(messageId);

      res.json({
        success: true,
        data: { thread },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get message thread:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get message thread',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// RESULTS ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/results
 * Get all results for an expedition
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/results',
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting results for expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get results from repository
      const { RepositoryFactory } = await import('@starships/models');
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const results = await resultRepo.findByExpedition(expeditionId);

      res.json({
        success: true,
        data: { results },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get results:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get results',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/results/:resultId
 * Get specific result details
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/results/:resultId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, resultId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting result: ${resultId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get result from repository
      const { RepositoryFactory } = await import('@starships/models');
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(resultId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Result not found',
          code: 'RESULT_NOT_FOUND',
        });
        return;
      }

      // Verify result belongs to expedition
      if (result.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Result not found in this expedition',
          code: 'RESULT_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: { result },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get result:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get result',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/results
 * Create a new expedition result
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/results',
  authMiddleware,
  validateCreateResult,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;
      const createResultRequest: CreateResultRequest = {
        expeditionId,
        ...req.body,
      };

      console.log(`[EXPEDITION-API] Creating result for expedition: ${expeditionId}`);

      // Validate required fields
      if (
        !createResultRequest.title ||
        !createResultRequest.content ||
        !createResultRequest.resultType ||
        !createResultRequest.format
      ) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: title, content, resultType, format',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Use ResultService for result creation
      const result = await resultService.createResult(userId, createResultRequest);

      res.status(201).json({
        success: true,
        data: { result },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to create result:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to create result',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/results/:resultId/quality-score
 * Add or update quality assessment for a result
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/results/:resultId/quality-score',
  authMiddleware,
  validateQualityScore,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, resultId } = req.params;
      const { overall, completeness, accuracy, relevance, clarity, notes } = req.body;
      const userId = req.user!.id;

      console.log(
        `[EXPEDITION-API] Adding quality score for result: ${resultId} in expedition: ${expeditionId}`
      );

      // Validate required fields
      if (typeof overall !== 'number' || overall < 0 || overall > 100) {
        res.status(400).json({
          success: false,
          error: 'Overall score must be a number between 0 and 100',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Use ResultService for quality assessment
      const qualityAssessment = {
        resultId,
        assessorId: userId,
        overall,
        completeness: completeness || overall,
        accuracy: accuracy || overall,
        relevance: relevance || overall,
        clarity: clarity || overall,
        notes,
      };

      const updatedResult = await resultService.assessQuality(userId, qualityAssessment);

      res.json({
        success: true,
        data: { result: updatedResult },
        message: 'Quality score updated successfully',
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to update quality score:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : error.code === 'RESULT_NOT_FOUND'
              ? 404
              : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to update quality score',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/results/analytics
 * Get results analytics for an expedition
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/results/analytics',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting results analytics for expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get all results for the expedition
      const { RepositoryFactory } = await import('@starships/models');
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const results = await resultRepo.findByExpedition(expeditionId);

      // Calculate analytics
      const analytics = {
        totalResults: results.length,
        resultsByType: {} as Record<string, number>,
        resultsByFormat: {} as Record<string, number>,
        averageQuality: {
          overall: 0,
          completeness: 0,
          accuracy: 0,
          relevance: 0,
          clarity: 0,
        },
        qualityDistribution: {
          excellent: 0, // 90-100
          good: 0, // 70-89
          fair: 0, // 50-69
          poor: 0, // 0-49
        },
      };

      if (results.length > 0) {
        // Count by type and format
        results.forEach((result) => {
          analytics.resultsByType[result.resultType] =
            (analytics.resultsByType[result.resultType] || 0) + 1;
          analytics.resultsByFormat[result.format] =
            (analytics.resultsByFormat[result.format] || 0) + 1;

          // Quality distribution
          const overall = result.quality.overall;
          if (overall >= 90) analytics.qualityDistribution.excellent++;
          else if (overall >= 70) analytics.qualityDistribution.good++;
          else if (overall >= 50) analytics.qualityDistribution.fair++;
          else analytics.qualityDistribution.poor++;
        });

        // Calculate average quality
        const qualitySum = results.reduce(
          (sum, result) => ({
            overall: sum.overall + result.quality.overall,
            completeness: sum.completeness + result.quality.completeness,
            accuracy: sum.accuracy + result.quality.accuracy,
            relevance: sum.relevance + result.quality.relevance,
            clarity: sum.clarity + result.quality.clarity,
          }),
          { overall: 0, completeness: 0, accuracy: 0, relevance: 0, clarity: 0 }
        );

        analytics.averageQuality = {
          overall: Math.round(qualitySum.overall / results.length),
          completeness: Math.round(qualitySum.completeness / results.length),
          accuracy: Math.round(qualitySum.accuracy / results.length),
          relevance: Math.round(qualitySum.relevance / results.length),
          clarity: Math.round(qualitySum.clarity / results.length),
        };
      }

      res.json({
        success: true,
        data: { analytics },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get results analytics:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get results analytics',
        code: error.code,
      });
    }
  }
);

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/results/:resultId/validate
 * Validate expedition result
 */
router.post(
  '/starships/:starshipId/expeditions/:expeditionId/results/:resultId/validate',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, resultId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Validating result: ${resultId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get result and perform validation
      const { RepositoryFactory } = await import('@starships/models');
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(resultId);

      if (!result) {
        res.status(404).json({
          success: false,
          error: 'Result not found',
          code: 'RESULT_NOT_FOUND',
        });
        return;
      }

      // Placeholder validation logic
      const validation = {
        isValid: true,
        score: 85,
        issues: [],
        suggestions: [],
      };

      res.json({
        success: true,
        data: { validation },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to validate result:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to validate result',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// REAL-TIME STATUS ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/status
 * Get real-time expedition status and progress
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/status',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting real-time status for expedition: ${expeditionId}`);

      // Validate expedition access first
      const expeditionResponse = await expeditionService.getExpedition(expeditionId, userId);

      // Get progress from First Officer if active
      const progress = await firstOfficerService.getExpeditionProgress(expeditionId);

      // Get task statistics
      const { RepositoryFactory } = await import('@starships/models');
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
      const taskStats = await taskRepo.getTaskStats(expeditionId);

      // Get recent messages (last 10)
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const recentMessages = await messageRepo.findByExpedition(expeditionId);
      const lastMessages = recentMessages.slice(-10);

      // Check if expedition is active
      const isActive = firstOfficerService.isExpeditionActive(expeditionId);

      const status = {
        expedition: expeditionResponse.expedition,
        isActive,
        progress,
        taskStats,
        recentMessages: lastMessages,
        lastUpdated: new Date().toISOString(),
      };

      res.json({
        success: true,
        data: { status },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get expedition status:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get expedition status',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/progress
 * Get detailed expedition progress information
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/progress',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting progress for expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get detailed progress from First Officer
      const progress = await firstOfficerService.getExpeditionProgress(expeditionId);

      if (!progress) {
        res.json({
          success: true,
          data: {
            progress: null,
            message: 'No active progress tracking for this expedition',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: { progress },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get expedition progress:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get expedition progress',
        code: error.code,
      });
    }
  }
);

// ============================================================================
// ENHANCED MESSAGING ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages/:messageId
 * Get specific message details
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/messages/:messageId',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId, messageId } = req.params;
      const userId = req.user!.id;

      console.log(`[EXPEDITION-API] Getting message: ${messageId} in expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get message from repository
      const { RepositoryFactory } = await import('@starships/models');
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const message = await messageRepo.findById(messageId);

      if (!message) {
        res.status(404).json({
          success: false,
          error: 'Message not found',
          code: 'MESSAGE_NOT_FOUND',
        });
        return;
      }

      // Verify message belongs to expedition
      if (message.expeditionId !== expeditionId) {
        res.status(404).json({
          success: false,
          error: 'Message not found in this expedition',
          code: 'MESSAGE_NOT_FOUND',
        });
        return;
      }

      res.json({
        success: true,
        data: { message },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get message:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get message',
        code: error.code,
      });
    }
  }
);

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages/recent
 * Get recent messages with pagination
 */
router.get(
  '/starships/:starshipId/expeditions/:expeditionId/messages/recent',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { expeditionId } = req.params;
      const userId = req.user!.id;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      console.log(`[EXPEDITION-API] Getting recent messages for expedition: ${expeditionId}`);

      // Validate expedition access first
      await expeditionService.getExpedition(expeditionId, userId);

      // Get messages from repository
      const { RepositoryFactory } = await import('@starships/models');
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const allMessages = await messageRepo.findByExpedition(expeditionId);

      // Apply pagination
      const totalMessages = allMessages.length;
      const messages = allMessages.slice(offset, offset + limit);

      res.json({
        success: true,
        data: {
          messages,
          pagination: {
            total: totalMessages,
            limit,
            offset,
            hasMore: offset + limit < totalMessages,
          },
        },
      });
    } catch (error: any) {
      console.error('[EXPEDITION-API] Failed to get recent messages:', error);
      const statusCode =
        error.code === 'EXPEDITION_NOT_FOUND'
          ? 404
          : error.code === 'EXPEDITION_ACCESS_DENIED'
            ? 403
            : 500;
      res.status(statusCode).json({
        success: false,
        error: error.message || 'Failed to get recent messages',
        code: error.code,
      });
    }
  }
);

export default router;
