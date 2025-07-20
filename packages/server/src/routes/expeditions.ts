/**
 * Expedition API Routes
 * 
 * Complete REST API endpoints for expedition management including CRUD operations,
 * control actions, task management, messaging, and results.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { ExpeditionService } from '../services/ExpeditionService';
import { FirstOfficerService } from '../services/FirstOfficerService';
import { 
  CreateExpeditionRequest,
  UpdateExpeditionRequest,
  SendMessageRequest,
  CreateTaskRequest,
  CreateResultRequest,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions
} from '@starships/protocol';

const router: Router = Router();

// Get service instances
const expeditionService = ExpeditionService.getInstance();
const firstOfficerService = FirstOfficerService.getInstance();

// ============================================================================
// EXPEDITION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/starships/:starshipId/expeditions
 * Create a new expedition
 */
router.post('/starships/:starshipId/expeditions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;
    const createRequest: CreateExpeditionRequest = {
      starshipId,
      ...req.body
    };

    console.log(`[EXPEDITION-API] Creating expedition for starship: ${starshipId}`);

    const expeditionResponse = await expeditionService.createExpedition(userId, createRequest);

    res.status(201).json({
      success: true,
      data: expeditionResponse
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to create expedition:', error);
    res.status(error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to create expedition',
      code: error.code
    });
  }
});

/**
 * GET /api/starships/:starshipId/expeditions
 * Get all expeditions for a starship
 */
router.get('/starships/:starshipId/expeditions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    // Parse query parameters
    const filters: ExpeditionFilters = {};
    const sort: ExpeditionSort = {
      field: (req.query.sortField as any) || 'createdAt',
      direction: (req.query.sortDirection as any) || 'desc'
    };
    const pagination: PaginationOptions = {
      page: Math.floor(parseInt(req.query.page as string, 10) || 1),
      limit: Math.floor(parseInt(req.query.limit as string, 10) || 20)
    };

    // Parse filters
    if (req.query.status) {
      filters.status = Array.isArray(req.query.status) 
        ? req.query.status as any[] 
        : [req.query.status as any];
    }
    if (req.query.priority) {
      filters.priority = Array.isArray(req.query.priority) 
        ? req.query.priority as any[] 
        : [req.query.priority as any];
    }
    if (req.query.tags) {
      filters.tags = Array.isArray(req.query.tags) 
        ? req.query.tags as string[] 
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
      data: expeditionList
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get expeditions:', error);
    res.status(error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 : 500).json({
      success: false,
      error: error.message || 'Failed to get expeditions',
      code: error.code
    });
  }
});

/**
 * GET /api/starships/:starshipId/expeditions/stats
 * Get expedition statistics for a starship
 */
router.get('/starships/:starshipId/expeditions/stats', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { starshipId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Getting expedition stats for starship: ${starshipId}`);

    const stats = await expeditionService.getExpeditionStats(starshipId, userId);

    res.json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get expedition stats:', error);
    res.status(error.code === 'STARSHIP_NOT_FOUND' ? 404 : 500).json({
      success: false,
      error: error.message || 'Failed to get expedition stats',
      code: error.code
    });
  }
});

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId
 * Get specific expedition details
 */
router.get('/starships/:starshipId/expeditions/:expeditionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Getting expedition: ${expeditionId}`);

    const expeditionResponse = await expeditionService.getExpedition(expeditionId, userId);

    res.json({
      success: true,
      data: expeditionResponse
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get expedition',
      code: error.code
    });
  }
});

/**
 * PUT /api/starships/:starshipId/expeditions/:expeditionId
 * Update expedition details
 */
router.put('/starships/:starshipId/expeditions/:expeditionId', authMiddleware, async (req: Request, res: Response) => {
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
      data: expeditionResponse
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to update expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'EXPEDITION_CANNOT_MODIFY' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to update expedition',
      code: error.code
    });
  }
});

/**
 * DELETE /api/starships/:starshipId/expeditions/:expeditionId
 * Delete expedition
 */
router.delete('/starships/:starshipId/expeditions/:expeditionId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Deleting expedition: ${expeditionId}`);

    await expeditionService.deleteExpedition(expeditionId, userId);

    res.json({
      success: true,
      message: 'Expedition deleted successfully'
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to delete expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'EXPEDITION_CANNOT_DELETE' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to delete expedition',
      code: error.code
    });
  }
});

// ============================================================================
// EXPEDITION CONTROL ENDPOINTS
// ============================================================================

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/start
 * Start expedition execution
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Starting expedition: ${expeditionId}`);

    const expeditionResponse = await expeditionService.startExpedition(expeditionId, userId);

    res.json({
      success: true,
      data: expeditionResponse,
      message: 'Expedition started successfully'
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to start expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'INVALID_STATUS_TRANSITION' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to start expedition',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/pause
 * Pause expedition execution
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/pause', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Pausing expedition: ${expeditionId}`);

    const expeditionResponse = await expeditionService.pauseExpedition(expeditionId, userId);

    res.json({
      success: true,
      data: expeditionResponse,
      message: 'Expedition paused successfully'
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to pause expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'INVALID_STATUS_TRANSITION' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to pause expedition',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/resume
 * Resume expedition execution
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/resume', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Resuming expedition: ${expeditionId}`);

    const expeditionResponse = await expeditionService.resumeExpedition(expeditionId, userId);

    res.json({
      success: true,
      data: expeditionResponse,
      message: 'Expedition resumed successfully'
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to resume expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'INVALID_STATUS_TRANSITION' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to resume expedition',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/cancel
 * Cancel expedition execution
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/cancel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Cancelling expedition: ${expeditionId}`);

    await expeditionService.cancelExpedition(expeditionId, userId);

    res.json({
      success: true,
      message: 'Expedition cancelled successfully'
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to cancel expedition:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : error.code === 'INVALID_STATUS_TRANSITION' ? 400
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to cancel expedition',
      code: error.code
    });
  }
});

// ============================================================================
// TASK MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/tasks
 * Get all tasks for an expedition
 */
router.get('/starships/:starshipId/expeditions/:expeditionId/tasks', authMiddleware, async (req: Request, res: Response) => {
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
      data: { tasks }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get tasks:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get tasks',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/tasks
 * Create a new task for an expedition
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;
    const createTaskRequest: CreateTaskRequest = {
      expeditionId,
      ...req.body
    };

    console.log(`[EXPEDITION-API] Creating task for expedition: ${expeditionId}`);

    // Validate expedition access first
    await expeditionService.getExpedition(expeditionId, userId);

    // Create task
    const { RepositoryFactory } = await import('@starships/models');
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.create({
      expeditionId,
      title: createTaskRequest.title,
      description: createTaskRequest.description,
      requiredSkills: createTaskRequest.requiredSkills,
      status: 'pending',
      priority: createTaskRequest.priority || 'medium',
      dependencies: createTaskRequest.dependencies || [],
      deliverable: createTaskRequest.deliverable,
      estimatedEffort: createTaskRequest.estimatedEffort,
      dueDate: createTaskRequest.dueDate,
      updatedAt: new Date().toISOString()
    });

    res.status(201).json({
      success: true,
      data: { task }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to create task:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to create task',
      code: error.code
    });
  }
});

/**
 * PUT /api/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId
 * Update a task
 */
router.put('/starships/:starshipId/expeditions/:expeditionId/tasks/:taskId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
      updatedAt: new Date().toISOString()
    });

    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Task not found',
        code: 'TASK_NOT_FOUND'
      });
      return;
    }

    res.json({
      success: true,
      data: { task }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to update task:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to update task',
      code: error.code
    });
  }
});

// ============================================================================
// MESSAGING ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages
 * Get all messages for an expedition
 */
router.get('/starships/:starshipId/expeditions/:expeditionId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Getting messages for expedition: ${expeditionId}`);

    // Validate expedition access first
    await expeditionService.getExpedition(expeditionId, userId);

    // Get messages from repository
    const { RepositoryFactory } = await import('@starships/models');
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const messages = await messageRepo.findByExpedition(expeditionId);

    res.json({
      success: true,
      data: { messages }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get messages:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get messages',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/messages
 * Send a message to an expedition
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/messages', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId } = req.params;
    const userId = req.user!.id;
    const sendMessageRequest: SendMessageRequest = {
      expeditionId,
      ...req.body
    };

    console.log(`[EXPEDITION-API] Sending message to expedition: ${expeditionId}`);

    // Handle user message through First Officer Service
    const response = await firstOfficerService.handleUserMessage(
      expeditionId,
      userId,
      sendMessageRequest.content
    );

    res.json({
      success: true,
      data: { response }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to send message:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to send message',
      code: error.code
    });
  }
});

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/messages/:messageId/thread
 * Get message thread
 */
router.get('/starships/:starshipId/expeditions/:expeditionId/messages/:messageId/thread', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { expeditionId, messageId } = req.params;
    const userId = req.user!.id;

    console.log(`[EXPEDITION-API] Getting message thread: ${messageId} in expedition: ${expeditionId}`);

    // Validate expedition access first
    await expeditionService.getExpedition(expeditionId, userId);

    // Get message thread from repository
    const { RepositoryFactory } = await import('@starships/models');
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    const thread = await messageRepo.findByThread(messageId);

    res.json({
      success: true,
      data: { thread }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get message thread:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get message thread',
      code: error.code
    });
  }
});

// ============================================================================
// RESULTS ENDPOINTS
// ============================================================================

/**
 * GET /api/starships/:starshipId/expeditions/:expeditionId/results
 * Get all results for an expedition
 */
router.get('/starships/:starshipId/expeditions/:expeditionId/results', authMiddleware, async (req: Request, res: Response) => {
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
      data: { results }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to get results:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404 
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403 
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to get results',
      code: error.code
    });
  }
});

/**
 * POST /api/starships/:starshipId/expeditions/:expeditionId/results/:resultId/validate
 * Validate expedition result
 */
router.post('/starships/:starshipId/expeditions/:expeditionId/results/:resultId/validate', authMiddleware, async (req: Request, res: Response): Promise<void> => {
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
        code: 'RESULT_NOT_FOUND'
      });
      return;
    }

    // Placeholder validation logic
    const validation = {
      isValid: true,
      score: 85,
      issues: [],
      suggestions: []
    };

    res.json({
      success: true,
      data: { validation }
    });
  } catch (error: any) {
    console.error('[EXPEDITION-API] Failed to validate result:', error);
    const statusCode = error.code === 'EXPEDITION_NOT_FOUND' ? 404
                     : error.code === 'EXPEDITION_ACCESS_DENIED' ? 403
                     : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to validate result',
      code: error.code
    });
  }
});

export default router;