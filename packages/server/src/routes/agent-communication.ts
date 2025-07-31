import { Router, Request, Response } from 'express';
import { getBidirectionalCommunicationService } from '../services/BidirectionalCommunicationService';
import { 
  AgentToOfficerMessage,
  ClarificationRequest,
  BlockerReport,
  ProgressUpdate,
  AssistanceRequest,
  AgentFirstOfficerContext
} from '@starships/protocol';
import { authMiddleware as authenticated } from '../middleware/auth';
// TODO: Create expedition access middleware
const validateExpeditionAccess = authenticated; // For now, use auth middleware
import { v4 as uuidv4 } from 'uuid';

const router: Router = Router();
const communicationService = getBidirectionalCommunicationService();

/**
 * Get agent's First Officer context
 * GET /api/agent-communication/:expeditionId/:agentId/context
 */
router.get(
  '/:expeditionId/:agentId/context',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      
      const context = await communicationService.createAgentFirstOfficerContext(
        expeditionId,
        agentId
      );
      
      res.json(context);
    } catch (error) {
      console.error('[AGENT-COMM] Failed to get First Officer context:', error);
      res.status(500).json({ 
        error: 'Failed to get First Officer context',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Send message from agent to First Officer
 * POST /api/agent-communication/:expeditionId/:agentId/message
 */
router.post(
  '/:expeditionId/:agentId/message',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      const { 
        messageType, 
        content, 
        priority = 'medium',
        taskId,
        taskTitle,
        requiresResponse = true,
        metadata = {}
      } = req.body;

      // Get agent details
      const agentName = req.body.agentName || 'Agent';

      const message: AgentToOfficerMessage = {
        id: uuidv4(),
        expeditionId,
        agentId,
        agentName,
        messageType,
        taskId,
        taskTitle,
        content,
        priority,
        timestamp: new Date().toISOString(),
        metadata,
        requiresResponse
      };

      await communicationService.sendToFirstOfficer(message);

      res.json({ 
        success: true,
        messageId: message.id,
        message: 'Message sent to First Officer'
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to send message to First Officer:', error);
      res.status(500).json({ 
        error: 'Failed to send message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Request clarification from First Officer
 * POST /api/agent-communication/:expeditionId/:agentId/clarification
 */
router.post(
  '/:expeditionId/:agentId/clarification',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      const {
        agentName,
        taskId,
        taskTitle,
        aspect,
        specificQuestion,
        currentUnderstanding,
        proposedApproach
      } = req.body;

      const clarificationRequest: ClarificationRequest = {
        id: uuidv4(),
        expeditionId,
        agentId,
        agentName: agentName || 'Agent',
        messageType: 'clarification-request',
        taskId,
        taskTitle,
        content: specificQuestion,
        priority: 'high',
        timestamp: new Date().toISOString(),
        requiresResponse: true,
        clarificationNeeded: {
          aspect,
          specificQuestion,
          currentUnderstanding,
          proposedApproach
        }
      };

      await communicationService.sendToFirstOfficer(clarificationRequest);

      res.json({ 
        success: true,
        requestId: clarificationRequest.id,
        message: 'Clarification request sent to First Officer'
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to request clarification:', error);
      res.status(500).json({ 
        error: 'Failed to request clarification',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Report a blocker to First Officer
 * POST /api/agent-communication/:expeditionId/:agentId/blocker
 */
router.post(
  '/:expeditionId/:agentId/blocker',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      const {
        agentName,
        taskId,
        taskTitle,
        type,
        description,
        impact,
        attemptedSolutions,
        suggestedResolution
      } = req.body;

      const blockerReport: BlockerReport = {
        id: uuidv4(),
        expeditionId,
        agentId,
        agentName: agentName || 'Agent',
        messageType: 'blocker-report',
        taskId,
        taskTitle,
        content: description,
        priority: impact === 'critical' ? 'urgent' : 'high',
        timestamp: new Date().toISOString(),
        requiresResponse: true,
        blocker: {
          type,
          description,
          impact,
          attemptedSolutions: attemptedSolutions || [],
          suggestedResolution,
          blockedSince: new Date().toISOString()
        }
      };

      await communicationService.sendToFirstOfficer(blockerReport);

      res.json({ 
        success: true,
        reportId: blockerReport.id,
        message: 'Blocker reported to First Officer'
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to report blocker:', error);
      res.status(500).json({ 
        error: 'Failed to report blocker',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Send progress update to First Officer
 * POST /api/agent-communication/:expeditionId/:agentId/progress
 */
router.post(
  '/:expeditionId/:agentId/progress',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      const {
        agentName,
        taskId,
        taskTitle,
        percentComplete,
        milestonesCompleted,
        currentActivity,
        estimatedTimeRemaining,
        confidence,
        insights
      } = req.body;

      const progressUpdate: ProgressUpdate = {
        id: uuidv4(),
        expeditionId,
        agentId,
        agentName: agentName || 'Agent',
        messageType: 'progress-update',
        taskId,
        taskTitle,
        content: `Progress: ${percentComplete}% - ${currentActivity}`,
        priority: 'low',
        timestamp: new Date().toISOString(),
        requiresResponse: false,
        progress: {
          percentComplete,
          milestonesCompleted: milestonesCompleted || [],
          currentActivity,
          estimatedTimeRemaining,
          confidence: confidence || 'medium',
          insights
        }
      };

      await communicationService.sendToFirstOfficer(progressUpdate);

      res.json({ 
        success: true,
        updateId: progressUpdate.id,
        message: 'Progress update sent to First Officer'
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to send progress update:', error);
      res.status(500).json({ 
        error: 'Failed to send progress update',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Request assistance from another agent
 * POST /api/agent-communication/:expeditionId/:agentId/assistance
 */
router.post(
  '/:expeditionId/:agentId/assistance',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      const {
        agentName,
        taskId,
        taskTitle,
        type,
        skillsNeeded,
        estimatedDuration,
        description,
        preferredAgent
      } = req.body;

      const assistanceRequest: AssistanceRequest = {
        id: uuidv4(),
        expeditionId,
        agentId,
        agentName: agentName || 'Agent',
        messageType: 'assistance-request',
        taskId,
        taskTitle,
        content: description,
        priority: 'medium',
        timestamp: new Date().toISOString(),
        requiresResponse: true,
        assistance: {
          type,
          skillsNeeded: skillsNeeded || [],
          estimatedDuration,
          description,
          preferredAgent
        }
      };

      await communicationService.sendToFirstOfficer(assistanceRequest);

      res.json({ 
        success: true,
        requestId: assistanceRequest.id,
        message: 'Assistance request sent to First Officer'
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to request assistance:', error);
      res.status(500).json({ 
        error: 'Failed to request assistance',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

/**
 * Get conversation history between agent and First Officer
 * GET /api/agent-communication/:expeditionId/:agentId/history
 */
router.get(
  '/:expeditionId/:agentId/history',
  authenticated,
  validateExpeditionAccess,
  async (req: Request, res: Response) => {
    try {
      const { expeditionId, agentId } = req.params;
      
      const history = await communicationService.getConversationHistory(
        expeditionId,
        agentId
      );
      
      res.json({
        expeditionId,
        agentId,
        messages: history,
        count: history.length
      });
    } catch (error) {
      console.error('[AGENT-COMM] Failed to get conversation history:', error);
      res.status(500).json({ 
        error: 'Failed to get conversation history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
);

export default router;