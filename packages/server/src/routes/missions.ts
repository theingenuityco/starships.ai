/**
 * Mission management routes
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

const router: Router = Router();

// Apply authentication to all mission routes
router.use(authMiddleware);

/**
 * Input validation helpers
 */
const validateUUID = (id: string, fieldName: string): void => {
  if (!id || typeof id !== 'string') {
    throw new ValidationError(
      `${fieldName} is required and must be a string`,
      fieldName
    );
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new ValidationError(
      `${fieldName} must be a valid UUID format`,
      fieldName
    );
  }
};

/**
 * Safely extract error message from unknown error
 */
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * GET /missions
 * Get all missions with optional filters and sorting
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {

    // Parse query parameters
    const filters: MissionFilters = {};
    const sort: MissionSort = {
      field: 'createdAt',
      direction: 'desc'
    };

    // Apply filters
    if (req.query.status) {
      const statusParam = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      filters.status = statusParam.map(s => String(s)) as any;
    }

    if (req.query.starshipId) {
      validateUUID(String(req.query.starshipId), 'starshipId');
      filters.starshipId = String(req.query.starshipId);
    }

    if (req.query.createdBy) {
      validateUUID(String(req.query.createdBy), 'createdBy');
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
    res.json(result);

  } catch (error) {
    console.error('Error fetching missions:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /missions/:id
 * Get a specific mission by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    validateUUID(id, 'id');

    const mission = await MissionService.getMissionById(id);
    res.json({ mission });

  } catch (error) {
    console.error('Error fetching mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /missions/starship/:starshipId
 * Get all missions for a specific starship
 */
router.get('/starship/:starshipId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { starshipId } = req.params;

    validateUUID(starshipId, 'starshipId');

    // Parse query parameters
    const filters: MissionFilters = {};
    const sort: MissionSort = {
      field: 'createdAt',
      direction: 'desc'
    };

    // Apply filters
    if (req.query.status) {
      const statusParam = Array.isArray(req.query.status) ? req.query.status : [req.query.status];
      filters.status = statusParam.map(s => String(s)) as any;
    }

    if (req.query.createdBy) {
      validateUUID(String(req.query.createdBy), 'createdBy');
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

    const result = await MissionService.getMissionsByStarshipId(starshipId, filters, sort);
    res.json(result);

  } catch (error) {
    console.error('Error fetching starship missions:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /missions
 * Create a new mission
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const createRequest: CreateMissionRequest = req.body;

    // Basic validation
    if (!createRequest.starshipId) {
      throw new ValidationError(
        'starshipId is required',
        'starshipId'
      );
    }
    
    if (!createRequest.name) {
      throw new ValidationError(
        'name is required',
        'name'
      );
    }
    
    if (!createRequest.description) {
      throw new ValidationError(
        'description is required',
        'description'
      );
    }

    if (!createRequest.agentIds || !Array.isArray(createRequest.agentIds)) {
      throw new ValidationError(
        'agentIds is required and must be an array',
        'agentIds'
      );
    }

    if (createRequest.agentIds.length === 0) {
      throw new ValidationError(
        'At least one agent must be assigned to the mission',
        'agentIds'
      );
    }

    validateUUID(createRequest.starshipId, 'starshipId');

    // Validate each agent ID is a valid UUID
    createRequest.agentIds.forEach((agentId, index) => {
      if (typeof agentId !== 'string') {
        throw new ValidationError(
          `agentIds[${index}] must be a string`,
          'agentIds'
        );
      }
      validateUUID(agentId, `agentIds[${index}]`);
    });

    const mission = await MissionService.createMission(createRequest, userId);
    res.status(201).json({ mission });

  } catch (error) {
    console.error('Error creating mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /missions/:id
 * Update an existing mission
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates: UpdateMissionRequest = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    validateUUID(id, 'id');

    // Ensure at least one field is being updated
    if (!updates || Object.keys(updates).length === 0) {
      throw new ValidationError(
        'At least one field must be provided for update',
        'updates'
      );
    }

    const mission = await MissionService.updateMission(id, updates);
    res.json({ mission });

  } catch (error) {
    console.error('Error updating mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /missions/:id
 * Delete a mission
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    validateUUID(id, 'id');

    await MissionService.deleteMission(id);
    res.status(204).send();

  } catch (error) {
    console.error('Error deleting mission:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({ error: getErrorMessage(error) });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: getErrorMessage(error) });
      return;
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /missions/:id/messages
 * Send message to mission orchestrator and get AI response
 */
router.post('/:id/messages', 
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { content } = req.body as SendMissionMessageRequest;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ 
          success: false, 
          error: 'User not authenticated' 
        });
        return;
      }

      validateUUID(id, 'id');

      const missionOrchestratorService = MissionOrchestratorService.getInstance();
      const response = await missionOrchestratorService.handleUserMessage(id, userId, content);

      res.json({ 
        success: true, 
        data: response 
      });

    } catch (error) {
      console.error('Error sending mission message:', error);
      
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: getErrorMessage(error),
          code: 'VALIDATION_ERROR'
        });
        return;
      }
      
      if (error instanceof NotFoundError) {
        res.status(404).json({
          success: false,
          error: getErrorMessage(error),
          code: 'MISSION_NOT_FOUND'
        });
        return;
      }

      // Handle mission orchestrator specific errors
      if (error instanceof Error && 'code' in error) {
        const errorCode = (error as any).code;
        let statusCode = 500;
        
        // Map error codes to appropriate HTTP status codes
        if (errorCode === 'MISSION_MESSAGE_INVALID') statusCode = 400;
        else if (errorCode === 'MISSION_ORCHESTRATOR_NOT_FOUND') statusCode = 404;
        else if (errorCode === 'MISSION_MESSAGE_SEND_FAILED') statusCode = 500;
        else if (errorCode === 'MISSION_CHAT_FAILED') statusCode = 500;

        res.status(statusCode).json({
          success: false,
          error: error.message || 'Failed to send message',
          code: errorCode
        });
        return;
      }
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
);

/**
 * GET /missions/:id/messages
 * Get message history for a mission with pagination
 */
router.get('/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const page = req.query.page ? parseInt(String(req.query.page)) : 1;
    const pageSize = req.query.pageSize ? parseInt(String(req.query.pageSize)) : 50;

    validateUUID(id, 'id');

    // Validate pagination parameters
    if (page < 1) {
      res.status(400).json({ 
        success: false, 
        error: 'Page must be >= 1',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    if (pageSize < 1 || pageSize > 200) {
      res.status(400).json({ 
        success: false, 
        error: 'Page size must be between 1 and 200',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    const missionOrchestratorService = MissionOrchestratorService.getInstance();
    const result = await missionOrchestratorService.getMessageHistory(id, page, pageSize);

    res.json({ 
      success: true, 
      data: result 
    });

  } catch (error) {
    console.error('Error fetching message history:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'MISSION_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * GET /missions/:id/clarity
 * Get mission clarity assessment
 */
router.get('/:id/clarity', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    validateUUID(id, 'id');

    const clarity = await MissionService.getMissionClarity(id);

    res.json({ 
      success: true, 
      data: clarity 
    });

  } catch (error) {
    console.error('Error fetching mission clarity:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'MISSION_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * GET /missions/:id/workflow
 * Get mission workflow details
 */
router.get('/:id/workflow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    validateUUID(id, 'id');

    const workflow = await WorkflowService.getWorkflowByMissionId(id);

    // Extract agent IDs from workflow nodes and fetch agent details
    const agents: Record<string, any> = {};
    if (workflow && workflow.nodes) {
      const agentIds = workflow.nodes
        .filter(node => node.type === 'agent' && node.parameters?.agentId)
        .map(node => node.parameters.agentId)
        .filter((id): id is string => typeof id === 'string') // Type guard to ensure string
        .filter((id, index, array) => array.indexOf(id) === index); // Remove duplicates

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
    res.json({ 
      success: true, 
      data: { workflow, agents } 
    });

  } catch (error) {
    console.error('Error fetching mission workflow:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'WORKFLOW_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * PUT /missions/:id/workflow/approval
 * Approve or reject mission workflow - triggers state transition via orchestrator
 */
router.put('/:id/workflow/approval', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { approvalStatus, rejectionReason } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ 
        success: false, 
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }
    
    validateUUID(id, 'id');
    
    if (approvalStatus !== 'approved' && approvalStatus !== 'rejected') {
      res.status(400).json({
        success: false,
        error: 'approvalStatus must be either "approved" or "rejected"',
        code: 'VALIDATION_ERROR'
      });
      return;
    }

    // Update workflow approval using service
    await WorkflowService.updateWorkflowApproval(id, { approvalStatus, rejectionReason });

    // Let orchestrator handle state transition (not manual database update)
    const orchestrator = MissionOrchestratorService.getInstance();
    const message = approvalStatus === 'approved'
      ? 'I approve this execution workflow. Please proceed.'
      : `I need changes to this workflow. ${rejectionReason || 'Please revise and present an updated version.'}`;
    
    // This will trigger the workflow state transition
    await orchestrator.handleUserMessage(id, userId, message);

    res.json({ 
      success: true,
      data: {
        approvalStatus,
        message: approvalStatus === 'approved'
          ? 'Workflow approved, transitioning to execution phase' 
          : 'Workflow rejected, generating revised workflow'
      }
    });

  } catch (error) {
    console.error('Error approving mission workflow:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'WORKFLOW_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * POST /missions/:id/regenerate-workflow
 * Regenerate mission workflow - uses orchestrator for state management
 */
router.post('/:id/regenerate-workflow', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ 
        success: false, 
        error: 'User not authenticated',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    validateUUID(id, 'id');

    // Delete existing workflow
    await WorkflowService.deleteWorkflow(id);

    // Let orchestrator handle regeneration (not manual phase update)
    const orchestrator = MissionOrchestratorService.getInstance();
    await orchestrator.handleUserMessage(id, userId, 'Please generate a new execution workflow for this mission.');

    res.json({ 
      success: true,
      data: { message: 'Workflow regeneration initiated' }
    });

  } catch (error) {
    console.error('Error regenerating mission workflow:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error),
        code: 'VALIDATION_ERROR'
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: getErrorMessage(error),
        code: 'WORKFLOW_NOT_FOUND'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * GET /missions/:id/execution-status
 * Get mission execution status
 */
router.get('/:id/execution-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ 
        success: false,
        error: 'User not authenticated' 
      });
      return;
    }

    validateUUID(id, 'id');

    const mission = await MissionService.getMissionById(id);
    
    res.json({
      success: true,
      data: {
        executionState: null, // Execution state now managed by autopilot workflow system
        phase: mission.phase
      }
    });

  } catch (error) {
    console.error('Error getting execution status:', error);
    
    if (error instanceof ValidationError) {
      res.status(400).json({
        success: false,
        error: getErrorMessage(error)
      });
      return;
    }
    
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        error: 'Mission not found'
      });
      return;
    }
    
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

export default router;