/**
 * Workflow API Routes
 *
 * REST API endpoints for workflow DSL management including CRUD operations,
 * approval workflow, execution monitoring, and user prompt handling.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import {
  WorkflowGenerationService,
  WorkflowEventService,
  ServiceFactory,
} from '../services';
import { RepositoryFactory } from '@starships/models';
import {
  WorkflowDSL,
  WorkflowGenerationRequest,
  WorkflowApprovalStatus,
  WorkflowRuntimeState,
  CreateExpeditionRequest,
} from '@starships/protocol';

const router: Router = Router();

// Get service instances
const workflowGenerationService = new WorkflowGenerationService();
const workflowEventService = WorkflowEventService.getInstance();

// ============================================================================
// WORKFLOW MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * GET /expeditions/:expeditionId/workflow
 * Get workflow DSL for an expedition
 */
router.get('/:expeditionId/workflow', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    
    const workflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!workflows || workflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    // Return the most recent workflow (first in array due to ORDER BY createdAt DESC)
    const workflow = workflows[0];

    res.json({
      success: true,
      data: workflow
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error getting workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/workflow/approve
 * Approve a workflow DSL
 */
router.post('/:expeditionId/workflow/approve', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const { userId } = req.body;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    
    const workflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!workflows || workflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    const workflow = workflows[0];

    // Update approval status
    const success = await workflowRepo.updateApprovalStatus(
      workflow.id,
      'approved',
      new Date().toISOString()
    );

    if (!success) {
      res.status(500).json({
        error: 'Failed to approve workflow',
        message: 'Database update failed'
      });
      return;
    }

    // Get updated workflow
    const updatedWorkflow = await workflowRepo.findById(workflow.id);

    // Emit workflow approved event
    await workflowEventService.emitWorkflowDSLApproved({
      expeditionId,
      workflowId: workflow.id,
      approvalStatus: 'approved',
      approvedBy: userId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: updatedWorkflow,
      message: 'Workflow approved successfully'
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error approving workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/workflow/reject
 * Reject a workflow DSL
 */
router.post('/:expeditionId/workflow/reject', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const { userId, reason } = req.body;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    
    const workflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!workflows || workflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    const workflow = workflows[0];

    // Update approval status
    const success = await workflowRepo.updateApprovalStatus(
      workflow.id,
      'rejected',
      new Date().toISOString()
    );

    if (!success) {
      res.status(500).json({
        error: 'Failed to reject workflow',
        message: 'Database update failed'
      });
      return;
    }

    // Get updated workflow
    const updatedWorkflow = await workflowRepo.findById(workflow.id);

    // Emit workflow rejected event
    await workflowEventService.emitWorkflowDSLRejected({
      expeditionId,
      workflowId: workflow.id,
      approvalStatus: 'rejected',
      rejectedBy: userId,
      rejectionReason: reason,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      data: updatedWorkflow,
      message: reason ? `Workflow rejected: ${reason}` : 'Workflow rejected'
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error rejecting workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /expeditions/:expeditionId/workflow
 * Update a workflow DSL
 */
router.put('/:expeditionId/workflow', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const { workflow: workflowData } = req.body;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    
    const existingWorkflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!existingWorkflows || existingWorkflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    const existingWorkflow = existingWorkflows[0];

    // Update workflow
    const updatedWorkflow = await workflowRepo.update(existingWorkflow.id, workflowData);

    res.json({
      success: true,
      data: updatedWorkflow,
      message: 'Workflow updated successfully'
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error updating workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/workflow/visualize
 * Generate ASCII visualization of workflow
 */
router.post('/:expeditionId/workflow/visualize', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    
    const workflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!workflows || workflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    const workflow = workflows[0];

    // Return existing visualization or generate new one if needed
    let visualization = workflow.visualization;
    if (!visualization || visualization.trim() === '') {
      // Generate new visualization using WorkflowGenerationService
      visualization = workflowGenerationService.generateVisualization(workflow);
      
      // Optionally update the stored workflow with new visualization
      await workflowRepo.update(workflow.id, {
        ...workflow,
        visualization
      });
    }

    res.json({
      success: true,
      data: {
        visualization,
        workflowId: workflow.id,
        nodeCount: workflow.nodes.length,
        edgeCount: workflow.edges.length
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error visualizing workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// EXECUTION MONITORING ENDPOINTS
// ============================================================================

/**
 * GET /expeditions/:expeditionId/workflow/execution-status
 * Get workflow execution status
 */
router.get('/:expeditionId/workflow/execution-status', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    const workflowRepo = await RepositoryFactory.getWorkflowRepository();
    const runtimeStateRepo = await RepositoryFactory.getWorkflowRuntimeStateRepository();
    
    const workflows = await workflowRepo.findByExpeditionId(expeditionId);
    if (!workflows || workflows.length === 0) {
      res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found for expedition ${expeditionId}`
      });
      return;
    }

    const workflow = workflows[0];

    // Get runtime state
    const runtimeState = await runtimeStateRepo.findByWorkflowId(workflow.id);
    
    res.json({
      success: true,
      data: {
        workflowId: workflow.id,
        expeditionId,
        currentStatus: runtimeState?.status || 'not_started',
        currentNodeId: runtimeState?.currentNodeId || null,
        startTime: runtimeState?.startTime || null,
        endTime: runtimeState?.endTime || null,
        totalNodes: workflow.nodes.length,
        completedNodes: 0 // TODO: Calculate from actual node execution results
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error getting execution status:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/workflow/pause
 * Pause workflow execution
 */
router.post('/:expeditionId/workflow/pause', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    
    // TODO: Implement actual pause logic with LangGraph
    // For now, return success with stub implementation
    
    res.json({
      success: true,
      message: 'Workflow pause requested',
      data: {
        expeditionId,
        action: 'pause',
        timestamp: new Date().toISOString(),
        note: 'Pause functionality will be implemented in execution engine phase'
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error pausing workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/workflow/resume
 * Resume workflow execution
 */
router.post('/:expeditionId/workflow/resume', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    
    // TODO: Implement actual resume logic with LangGraph
    // For now, return success with stub implementation
    
    res.json({
      success: true,
      message: 'Workflow resume requested',
      data: {
        expeditionId,
        action: 'resume',
        timestamp: new Date().toISOString(),
        note: 'Resume functionality will be implemented in execution engine phase'
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error resuming workflow:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// USER PROMPT ENDPOINTS
// ============================================================================

/**
 * GET /expeditions/:expeditionId/user-prompts/pending
 * Get pending user prompts for workflow
 */
router.get('/:expeditionId/user-prompts/pending', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId } = req.params;
    
    // TODO: Implement user prompt retrieval
    // For now, return empty array with stub implementation
    
    res.json({
      success: true,
      data: {
        expeditionId,
        pendingPrompts: [],
        count: 0,
        note: 'User prompt functionality will be implemented in execution engine phase'
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error getting pending prompts:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /expeditions/:expeditionId/user-prompt/:promptId/respond
 * Respond to a user prompt
 */
router.post('/:expeditionId/user-prompt/:promptId/respond', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { expeditionId, promptId } = req.params;
    const { response, userId } = req.body;
    
    // TODO: Implement user prompt response handling
    // For now, return success with stub implementation
    
    res.json({
      success: true,
      message: 'User prompt response recorded',
      data: {
        expeditionId,
        promptId,
        response,
        userId,
        timestamp: new Date().toISOString(),
        note: 'User prompt response functionality will be implemented in execution engine phase'
      }
    });
  } catch (error) {
    console.error('[WORKFLOW-API] Error responding to prompt:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;