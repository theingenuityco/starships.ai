/**
 * Mission management routes (OpenAPI pattern)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { MissionOrchestratorService } from '../services/MissionOrchestratorService';
import { MissionService } from '../services/MissionService';
import { WorkflowService } from '../services/WorkflowService';
import { AgentService } from '../services/AgentService';
import type {
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort,
  SendMissionMessageRequest
} from '@starships/protocol';
import {
  ValidationError,
  NotFoundError,
} from '@starships/models';
import { authMiddleware } from '../middleware/auth';
import type { StandardErrorCode } from '@starships/protocol';
import {
  sendSuccess,
  sendError,
  handleCommonError,
  validateUUID,
  validatePagination,
  createPaginationMeta,
} from '../utils/responseHelpers';

const router: Router = Router();

// Apply authentication to all mission routes
router.use(authMiddleware);

/**
 * Safely extract error message from unknown error
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

// GET /missions - Get all missions with optional filters and sorting (OpenAPI pattern)
router.get('/missions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, error: paginationError } = validatePagination(
      req.query.page as string,
      req.query.limit as string
    );

    if (paginationError) {
      sendError(res, paginationError.code, paginationError.message, 400);
      return;
    }

    // Parse query parameters
    const filters: MissionFilters = {};
    const sort: MissionSort = {
      field: 'createdAt',
      direction: 'desc'
    };

    // Apply filters with validation
    if (req.query.status) {
      const statusParam = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      filters.status = statusParam.map(s => String(s)) as any;
    }

    if (req.query.starshipId) {
      const { isValid, error } = validateUUID(String(req.query.starshipId), 'starshipId');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }
      filters.starshipId = String(req.query.starshipId);
    }

    if (req.query.createdBy) {
      const { isValid, error } = validateUUID(String(req.query.createdBy), 'createdBy');
      if (!isValid && error) {
        sendError(res, error.code, error.message, 400, error.details);
        return;
      }
      filters.createdBy = String(req.query.createdBy);
    }

    // Apply sorting
    if (req.query.sortField) {
      const validSortFields = ['createdAt', 'updatedAt', 'status', 'name'];
      const sortField = String(req.query.sortField);
      if (validSortFields.includes(sortField)) {
        sort.field = sortField as any;
      }
    }

    if (req.query.sortDirection) {
      const sortDirection = String(req.query.sortDirection).toLowerCase();
      if (sortDirection === 'asc' || sortDirection === 'desc') {
        sort.direction = sortDirection;
      }
    }

    const result = await MissionService.getAllMissions(filters, sort);
    
    // Handle result structure - might be array or object with missions array
    let missions: any[];
    let total: number;
    
    if (Array.isArray(result)) {
      missions = result;
      total = result.length;
    } else {
      missions = result.missions || [];
      total = result.total || missions.length;
    }
    
    // Apply pagination to missions
    const offset = (page - 1) * limit;
    const paginatedMissions = missions.slice(offset, offset + limit);

    sendSuccess(res, paginatedMissions, 200, createPaginationMeta(page, limit, total));

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching missions')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch missions');
    }
  }
});

// GET /missions/:id - Get a specific mission by ID (OpenAPI pattern)
router.get('/missions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const mission = await MissionService.getMissionById(id);
    sendSuccess(res, mission);

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching mission')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch mission');
    }
  }
});

// POST /missions - Create a new mission (OpenAPI pattern)
router.post('/missions', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    const createRequest: CreateMissionRequest = req.body;

    // Validate required fields
    if (!createRequest.starshipId) {
      sendError(res, 'MISSING_REQUIRED_FIELD' as StandardErrorCode, 'starshipId is required', 400, {
        field: 'starshipId',
      });
      return;
    }
    
    if (!createRequest.name) {
      sendError(res, 'MISSING_REQUIRED_FIELD' as StandardErrorCode, 'name is required', 400, {
        field: 'name',
      });
      return;
    }
    
    if (!createRequest.description) {
      sendError(res, 'MISSING_REQUIRED_FIELD' as StandardErrorCode, 'description is required', 400, {
        field: 'description',
      });
      return;
    }

    if (!createRequest.agentIds || !Array.isArray(createRequest.agentIds)) {
      sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, 'agentIds must be an array', 400, {
        field: 'agentIds',
        provided: typeof createRequest.agentIds,
      });
      return;
    }

    if (createRequest.agentIds.length === 0) {
      sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, 'At least one agent must be assigned to the mission', 400, {
        field: 'agentIds',
        constraint: 'min_length_1',
      });
      return;
    }

    // Validate starshipId format
    const { isValid: starshipValid, error: starshipError } = validateUUID(createRequest.starshipId, 'starshipId');
    if (!starshipValid && starshipError) {
      sendError(res, starshipError.code, starshipError.message, 400, starshipError.details);
      return;
    }

    // Validate each agent ID
    for (let i = 0; i < createRequest.agentIds.length; i++) {
      const agentId = createRequest.agentIds[i];
      if (typeof agentId !== 'string') {
        sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, `agentIds[${i}] must be a string`, 400, {
          field: `agentIds[${i}]`,
          provided: typeof agentId,
        });
        return;
      }
      
      const { isValid: agentValid, error: agentError } = validateUUID(agentId, `agentIds[${i}]`);
      if (!agentValid && agentError) {
        sendError(res, agentError.code, agentError.message, 400, agentError.details);
        return;
      }
    }

    const mission = await MissionService.createMission(createRequest, userId);
    sendSuccess(res, mission, 201);

  } catch (error) {
    if (!handleCommonError(error, res, 'creating mission')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to create mission');
    }
  }
});

// PUT /missions/:id - Update an existing mission (OpenAPI pattern)
router.put('/missions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates: UpdateMissionRequest = req.body;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    // Ensure at least one field is being updated
    if (!updates || Object.keys(updates).length === 0) {
      sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, 'At least one field must be provided for update', 400, {
        field: 'updates',
        message: 'Request body must contain at least one field to update',
      });
      return;
    }

    const mission = await MissionService.updateMission(id, updates);
    sendSuccess(res, mission);

  } catch (error) {
    if (!handleCommonError(error, res, 'updating mission')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to update mission');
    }
  }
});

// DELETE /missions/:id - Delete a mission (OpenAPI pattern)
router.delete('/missions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    await MissionService.deleteMission(id);
    res.status(204).send();

  } catch (error) {
    if (!handleCommonError(error, res, 'deleting mission')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to delete mission');
    }
  }
});

// POST /missions/:id/messages - Send message to mission orchestrator (OpenAPI pattern)
router.post('/missions/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body as SendMissionMessageRequest;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    if (!content || typeof content !== 'string') {
      sendError(res, 'MISSING_REQUIRED_FIELD' as StandardErrorCode, 'Message content is required', 400, {
        field: 'content',
      });
      return;
    }

    const missionOrchestratorService = MissionOrchestratorService.getInstance();
    const response = await missionOrchestratorService.handleUserMessage(id, userId, content);

    sendSuccess(res, response, 201);

  } catch (error) {
    console.error('Error sending mission message:', error);

    // Handle mission orchestrator specific errors
    if (error instanceof Error && 'code' in error) {
      const errorCode = (error as any).code;
      let statusCode = 500;
      let mappedErrorCode: StandardErrorCode = 'INTERNAL_SERVER_ERROR';
      
      // Map error codes to appropriate HTTP status codes
      if (errorCode === 'MISSION_MESSAGE_INVALID') {
        statusCode = 400;
        mappedErrorCode = 'VALIDATION_ERROR';
      } else if (errorCode === 'MISSION_ORCHESTRATOR_NOT_FOUND') {
        statusCode = 404;
        mappedErrorCode = 'RESOURCE_NOT_FOUND';
      } else if (errorCode === 'MISSION_MESSAGE_SEND_FAILED' || errorCode === 'MISSION_CHAT_FAILED') {
        statusCode = 500;
        mappedErrorCode = 'INTERNAL_SERVER_ERROR';
      }

      sendError(res, mappedErrorCode, error.message || 'Failed to send message', statusCode, {
        originalErrorCode: errorCode,
      });
      return;
    }
    
    if (!handleCommonError(error, res, 'sending mission message')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to send message');
    }
  }
});

// GET /missions/:id/messages - Get message history for a mission with pagination (OpenAPI pattern)
router.get('/missions/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const { isValid, error } = validateUUID(id, 'id');
    if (!isValid && error) {
      sendError(res, error.code, error.message, 400, error.details);
      return;
    }

    const { page, limit: pageSize, error: paginationError } = validatePagination(
      req.query.page as string,
      req.query.pageSize as string || req.query.limit as string
    );

    if (paginationError) {
      sendError(res, paginationError.code, paginationError.message, 400);
      return;
    }

    const missionOrchestratorService = MissionOrchestratorService.getInstance();
    const result = await missionOrchestratorService.getMessageHistory(id, page, pageSize);

    sendSuccess(res, result);

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching message history')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch message history');
    }
  }
});

// GET /missions/:id/clarity - Get mission clarity assessment (OpenAPI pattern)
router.get('/missions/:id/clarity', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    validateUUID(id, 'id');

    const clarity = await MissionService.getMissionClarity(id);

    sendSuccess(res, clarity);

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching mission clarity')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch mission clarity');
    }
  }
});

// GET /missions/:id/workflow - Get mission workflow details (OpenAPI pattern)
router.get('/missions/:id/workflow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    validateUUID(id, 'id');

    const workflow = await MissionService.getWorkflowByMissionId(id);

    // Extract agent IDs from workflow nodes and fetch agent details
    const agents: Record<string, any> = {};
    if (workflow && workflow.nodes) {
      const agentIds = workflow.nodes
        .filter((node: any) => node.type === 'agent' && node.parameters?.agentId)
        .map((node: any) => node.parameters.agentId)
        .filter((id: any): id is string => typeof id === 'string') // Type guard to ensure string
        .filter((id: string, index: number, array: string[]) => array.indexOf(id) === index); // Remove duplicates

      // Fetch agent details for all unique agent IDs
      for (const agentId of agentIds) {
        try {
          const agent = await AgentService.getAgent(agentId);
          if (agent) {
            agents[agentId] = agent;
          }
        } catch (agentError) {
          console.warn(`Failed to fetch agent ${agentId}:`, agentError);
          // Continue processing other agents even if one fails
        }
      }
    }

    // Return null workflow when not found instead of 404 error
    // This allows the UI to display "No workflow data available" gracefully
    sendSuccess(res, { workflow, agents });

  } catch (error) {
    if (!handleCommonError(error, res, 'fetching mission workflow')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to fetch mission workflow');
    }
  }
});

// PUT /missions/:id/workflow/approval - Approve or reject mission workflow (OpenAPI pattern)
router.put('/missions/:id/workflow/approval', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { approvalStatus, rejectionReason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }
    
    validateUUID(id, 'id');
    
    if (approvalStatus !== 'approved' && approvalStatus !== 'rejected') {
      sendError(res, 'VALIDATION_ERROR' as StandardErrorCode, 'approvalStatus must be either "approved" or "rejected"', 400, {
        field: 'approvalStatus',
        allowed_values: ['approved', 'rejected'],
        provided: approvalStatus,
      });
      return;
    }

    // Update workflow approval using service
    await MissionService.updateWorkflowApproval(id, { approvalStatus, rejectionReason });

    // Let orchestrator handle state transition (not manual database update)
    const orchestrator = MissionOrchestratorService.getInstance();
    const message = approvalStatus === 'approved'
      ? 'I approve this execution workflow. Please proceed.'
      : `I need changes to this workflow. ${rejectionReason || 'Please revise and present an updated version.'}`;
    
    // This will trigger the workflow state transition
    await orchestrator.handleUserMessage(id, userId, message);

    sendSuccess(res, {
      approvalStatus,
      message: approvalStatus === 'approved'
        ? 'Workflow approved, transitioning to execution phase'
        : 'Workflow rejected, generating revised workflow'
    });

  } catch (error) {
    if (!handleCommonError(error, res, 'approving mission workflow')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to approve mission workflow');
    }
  }
});

// POST /missions/:id/regenerate-workflow - Regenerate mission workflow (OpenAPI pattern)
router.post('/missions/:id/regenerate-workflow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    validateUUID(id, 'id');

    // Delete existing workflow
    await WorkflowService.deleteWorkflow(id);

    // Let orchestrator handle regeneration (not manual phase update)
    const orchestrator = MissionOrchestratorService.getInstance();
    await orchestrator.handleUserMessage(id, userId, 'Please generate a new execution workflow for this mission.');

    sendSuccess(res, { message: 'Workflow regeneration initiated' });

  } catch (error) {
    if (!handleCommonError(error, res, 'regenerating mission workflow')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to regenerate mission workflow');
    }
  }
});

// GET /missions/:id/execution-status - Get mission execution status (OpenAPI pattern)
router.get('/missions/:id/execution-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      sendError(res, 'AUTHENTICATION_REQUIRED' as StandardErrorCode, 'User not authenticated', 401);
      return;
    }

    validateUUID(id, 'id');

    const mission = await MissionService.getMissionById(id);
    
    sendSuccess(res, {
      executionState: null, // Execution state now managed by autopilot workflow system
      phase: mission.phase
    });

  } catch (error) {
    if (!handleCommonError(error, res, 'getting mission execution status')) {
      sendError(res, 'INTERNAL_SERVER_ERROR' as StandardErrorCode, 'Failed to get mission execution status');
    }
  }
});

export default router;