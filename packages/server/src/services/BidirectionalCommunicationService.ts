import { getLogger, Logger } from '../utils/logger';
import { RepositoryFactory } from '@starships/models';
import {
  AgentToOfficerMessage,
  OfficerToAgentMessage,
  AgentToOfficerMessageType,
  OfficerToAgentMessageType,
  BidirectionalCommunicationHandler,
  ClarificationRequest,
  ClarificationResponse,
  BlockerReport,
  GuidanceMessage,
  ProgressUpdate,
  AssistanceRequest,
  AgentFirstOfficerContext,
  MessageType,
  ExpeditionMessage
} from '@starships/protocol';
import { VirtualFirstOfficer } from './VirtualFirstOfficer';
import { FirstOfficerService } from './FirstOfficerService';
import { MessageService } from './MessageService';
import { SocketIOService } from './SocketIOService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Service to handle bidirectional communication between agents and First Officer
 * Enables agents to ask questions, report blockers, and receive guidance
 */
export class BidirectionalCommunicationService implements BidirectionalCommunicationHandler {
  private logger: Logger;
  private firstOfficerService: FirstOfficerService;
  private messageService: MessageService;
  private socketService: SocketIOService | null = null;
  
  // Track active conversations
  private activeConversations: Map<string, {
    expeditionId: string;
    agentId: string;
    lastMessageTime: Date;
    pendingRequests: Map<string, AgentToOfficerMessage>;
  }> = new Map();

  constructor() {
    this.logger = getLogger({ service: 'BidirectionalCommunicationService' });
    this.firstOfficerService = FirstOfficerService.getInstance();
    this.messageService = MessageService.getInstance();
    // Note: SocketIOService will be accessed lazily when needed
  }

  /**
   * Get SocketIOService instance lazily
   */
  private getSocketService(): SocketIOService | null {
    if (!this.socketService) {
      try {
        this.socketService = SocketIOService.getInstance();
        this.logger.info('SocketIOService successfully connected');
      } catch (error) {
        this.logger.warn('SocketIOService not available', undefined, { error: error instanceof Error ? error.message : String(error) });
        return null;
      }
    }
    return this.socketService;
  }

  /**
   * Create agent's awareness context for their First Officer
   */
  async createAgentFirstOfficerContext(expeditionId: string, agentId: string): Promise<AgentFirstOfficerContext> {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();

    const expedition = await expeditionRepo.findById(expeditionId);
    const agent = await agentRepo.findById(agentId);
    
    if (!expedition || !agent) {
      throw new Error('Expedition or agent not found');
    }

    // Get agent's assigned tasks
    const agentTasks = await taskRepo.findByAgent(agentId);
    const expeditionTasks = agentTasks.filter(task => task.expeditionId === expeditionId);

    return {
      expeditionId: expedition.id,
      expeditionTitle: expedition.name,
      firstOfficerId: `vfo-${expeditionId}`, // Virtual First Officer ID
      firstOfficerName: 'First Officer',
      communicationProtocol: 'bidirectional',
      assignedTasks: expeditionTasks.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority
      })),
      canRequestClarification: true,
      canReportBlockers: true,
      canRequestAssistance: true
    };
  }

  /**
   * Agent sends a message to First Officer
   */
  async sendToFirstOfficer(message: AgentToOfficerMessage): Promise<void> {
    try {
      this.logger.info('Agent sending message to First Officer', {
        service: 'BidirectionalCommunicationService',
        operation: 'sendToFirstOfficer'
      }, {
        expeditionId: message.expeditionId,
        agentId: message.agentId,
        messageType: message.messageType,
        requiresResponse: message.requiresResponse
      });

      // Track the conversation
      this.trackConversation(message);

      // Store message in database
      await this.persistAgentMessage(message);

      // Process based on message type
      switch (message.messageType) {
        case 'clarification-request':
          await this.handleClarificationRequest(message as ClarificationRequest);
          break;
        case 'blocker-report':
          await this.handleBlockerReport(message as BlockerReport);
          break;
        case 'progress-update':
          await this.handleProgressUpdate(message as ProgressUpdate);
          break;
        case 'assistance-request':
          await this.handleAssistanceRequest(message as AssistanceRequest);
          break;
        default:
          await this.handleGenericAgentMessage(message);
      }

    } catch (error) {
      this.logger.error('Failed to send message to First Officer', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'sendToFirstOfficer'
      });
      throw error;
    }
  }

  /**
   * First Officer handles message from agent
   */
  async handleAgentMessage(message: AgentToOfficerMessage): Promise<void> {
    // This is called when First Officer receives a message
    // The actual handling is done in sendToFirstOfficer
    this.logger.debug('First Officer received agent message', {
      service: 'BidirectionalCommunicationService',
      operation: 'handleAgentMessage'
    }, {
      messageType: message.messageType,
      agentName: message.agentName
    });
  }

  /**
   * First Officer sends a message to an agent
   */
  async sendToAgent(agentId: string, message: OfficerToAgentMessage): Promise<void> {
    try {
      this.logger.info('First Officer sending message to agent', {
        service: 'BidirectionalCommunicationService',
        operation: 'sendToAgent'
      }, {
        expeditionId: message.expeditionId,
        agentId: message.agentId,
        messageType: message.messageType
      });

      // Store message in database
      await this.persistOfficerMessage(message);

      // Send through message service for real-time delivery
      await this.messageService.sendMessageToAgent(
        message.expeditionId,
        agentId,
        message.content,
        {
          messageType: message.messageType,
          taskId: message.taskId,
          inResponseTo: message.inResponseTo,
          actionRequired: message.actionRequired
        }
      );

      // Update conversation tracking
      const conversationKey = `${message.expeditionId}-${agentId}`;
      const conversation = this.activeConversations.get(conversationKey);
      if (conversation && message.inResponseTo) {
        conversation.pendingRequests.delete(message.inResponseTo);
      }

    } catch (error) {
      this.logger.error('Failed to send message to agent', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'sendToAgent'
      });
      throw error;
    }
  }

  /**
   * Agent handles message from First Officer
   */
  async handleOfficerMessage(message: OfficerToAgentMessage): Promise<void> {
    // This would be implemented on the agent side
    // For now, log the receipt
    this.logger.debug('Agent received First Officer message', {
      service: 'BidirectionalCommunicationService',
      operation: 'handleOfficerMessage'
    }, {
      messageType: message.messageType,
      actionRequired: message.actionRequired
    });
  }

  /**
   * Get conversation history between agent and First Officer
   */
  async getConversationHistory(
    expeditionId: string, 
    agentId: string
  ): Promise<Array<AgentToOfficerMessage | OfficerToAgentMessage>> {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    
    // Fetch messages involving this agent
    const messages = await messageRepo.findByExpedition(expeditionId);
    
    // Filter for bidirectional communication messages
    const bidirectionalMessages = messages.filter(msg => {
      return (msg.agentId === agentId || msg.metadata?.targetAgentId === agentId) &&
             (msg.metadata?.communicationType === 'bidirectional' ||
              msg.metadata?.messageCategory === 'agent-officer-communication');
    });

    // Map to our communication types
    return bidirectionalMessages.map(msg => {
      if (msg.role === 'agent') {
        return {
          id: msg.id,
          expeditionId: msg.expeditionId,
          agentId: msg.agentId!,
          agentName: msg.metadata?.agentName || 'Agent',
          messageType: msg.metadata?.messageType as AgentToOfficerMessageType || 'progress-update',
          content: msg.content,
          priority: msg.metadata?.priority || 'medium',
          timestamp: msg.timestamp,
          requiresResponse: msg.metadata?.requiresResponse || false,
          metadata: msg.metadata
        } as AgentToOfficerMessage;
      } else {
        return {
          id: msg.id,
          expeditionId: msg.expeditionId,
          agentId: msg.metadata?.targetAgentId || agentId,
          agentName: msg.metadata?.targetAgentName || 'Agent',
          messageType: msg.metadata?.messageType as OfficerToAgentMessageType || 'guidance',
          content: msg.content,
          timestamp: msg.timestamp,
          actionRequired: msg.metadata?.actionRequired || false,
          metadata: msg.metadata
        } as OfficerToAgentMessage;
      }
    });
  }

  /**
   * Subscribe to real-time messages (WebSocket implementation)
   */
  subscribeToMessages(expeditionId: string, callback: (message: any) => void): void {
    // This would connect to WebSocket for real-time updates
    this.logger.debug('Subscribing to messages', {
      service: 'BidirectionalCommunicationService',
      operation: 'subscribeToMessages'
    }, { expeditionId });
  }

  /**
   * Unsubscribe from real-time messages
   */
  unsubscribeFromMessages(expeditionId: string): void {
    // This would disconnect from WebSocket
    this.logger.debug('Unsubscribing from messages', {
      service: 'BidirectionalCommunicationService',
      operation: 'unsubscribeFromMessages'
    }, { expeditionId });
  }

  // ============================================================================
  // PRIVATE HANDLER METHODS
  // ============================================================================

  /**
   * Handle clarification request from agent
   */
  private async handleClarificationRequest(request: ClarificationRequest): Promise<void> {
    try {
      // Get Virtual First Officer for this expedition
      const vfo = await this.getVirtualFirstOfficer(request.expeditionId);
      
      // Prepare context for the VFO
      const clarificationPrompt = `
An agent named "${request.agentName}" working on task "${request.taskTitle || 'unspecified'}" needs clarification.

Their specific question: ${request.clarificationNeeded.specificQuestion}

Aspect needing clarification: ${request.clarificationNeeded.aspect}
Their current understanding: ${request.clarificationNeeded.currentUnderstanding}
${request.clarificationNeeded.proposedApproach ? `Their proposed approach: ${request.clarificationNeeded.proposedApproach}` : ''}

Please provide a clear, helpful clarification that addresses their specific question.
`;

      // Get response from VFO
      const response = await vfo.processMessage(clarificationPrompt, 'system');

      // Send clarification response
      const clarificationResponse: ClarificationResponse = {
        id: uuidv4(),
        expeditionId: request.expeditionId,
        agentId: request.agentId,
        agentName: request.agentName,
        messageType: 'clarification-response',
        content: response,
        timestamp: new Date().toISOString(),
        inResponseTo: request.id,
        actionRequired: true,
        clarification: {
          answer: response,
          additionalContext: 'Feel free to ask follow-up questions if needed.'
        }
      };

      await this.sendToAgent(request.agentId, clarificationResponse);

    } catch (error) {
      this.logger.error('Failed to handle clarification request', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'handleClarificationRequest'
      });
    }
  }

  /**
   * Handle blocker report from agent
   */
  private async handleBlockerReport(report: BlockerReport): Promise<void> {
    try {
      const vfo = await this.getVirtualFirstOfficer(report.expeditionId);
      
      const blockerPrompt = `
Agent "${report.agentName}" is blocked and needs help.

Blocker Type: ${report.blocker.type}
Impact: ${report.blocker.impact}
Description: ${report.blocker.description}
Blocked Since: ${report.blocker.blockedSince}

Attempted Solutions:
${report.blocker.attemptedSolutions.map(s => `- ${s}`).join('\n')}

${report.blocker.suggestedResolution ? `Agent's suggested resolution: ${report.blocker.suggestedResolution}` : ''}

Please provide guidance to help unblock the agent. Consider workarounds, alternative approaches, or resource allocation.
`;

      const response = await vfo.processMessage(blockerPrompt, 'system');

      // Send guidance
      const guidanceMessage: GuidanceMessage = {
        id: uuidv4(),
        expeditionId: report.expeditionId,
        agentId: report.agentId,
        agentName: report.agentName,
        messageType: 'guidance',
        content: response,
        timestamp: new Date().toISOString(),
        inResponseTo: report.id,
        actionRequired: true,
        guidance: {
          type: 'solution',
          steps: response.split('\n').filter(line => line.trim()),
          rationale: 'Based on your blocker report, here\'s how to proceed.'
        }
      };

      await this.sendToAgent(report.agentId, guidanceMessage);

      // If critical blocker, notify through expedition messages
      if (report.blocker.impact === 'critical') {
        await this.notifyCriticalBlocker(report);
      }

    } catch (error) {
      this.logger.error('Failed to handle blocker report', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'handleBlockerReport'
      });
    }
  }

  /**
   * Handle progress update from agent
   */
  private async handleProgressUpdate(update: ProgressUpdate): Promise<void> {
    try {
      // Log the progress
      this.logger.info('Agent progress update received', {
        service: 'BidirectionalCommunicationService',
        operation: 'handleProgressUpdate'
      }, {
        agentName: update.agentName,
        taskId: update.taskId,
        percentComplete: update.progress.percentComplete,
        currentActivity: update.progress.currentActivity
      });

      // Update task progress if task ID is provided
      if (update.taskId) {
        const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
        // Store progress in result field as JSON
        await taskRepo.updateResult(update.taskId, JSON.stringify({
          progressUpdate: update.progress,
          lastUpdateTime: update.timestamp
        }));
      }

      // If low confidence or insights, provide encouragement or guidance
      if (update.progress.confidence === 'low' || update.progress.insights) {
        const vfo = await this.getVirtualFirstOfficer(update.expeditionId);
        
        const progressPrompt = `
Agent "${update.agentName}" provided a progress update:
- ${update.progress.percentComplete}% complete
- Current activity: ${update.progress.currentActivity}
- Confidence level: ${update.progress.confidence}
${update.progress.insights ? `- Insights: ${update.progress.insights.join(', ')}` : ''}

${update.progress.confidence === 'low' ? 'The agent has low confidence. Please provide encouragement or guidance.' : 
  'Please acknowledge the progress and provide any relevant guidance based on their insights.'}
`;

        const response = await vfo.processMessage(progressPrompt, 'system');

        await this.sendToAgent(update.agentId, {
          id: uuidv4(),
          expeditionId: update.expeditionId,
          agentId: update.agentId,
          agentName: update.agentName,
          messageType: update.progress.confidence === 'low' ? 'guidance' : 'encouragement',
          content: response,
          timestamp: new Date().toISOString(),
          inResponseTo: update.id,
          actionRequired: false
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle progress update', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'handleProgressUpdate'
      });
    }
  }

  /**
   * Handle assistance request from agent
   */
  private async handleAssistanceRequest(request: AssistanceRequest): Promise<void> {
    try {
      const vfo = await this.getVirtualFirstOfficer(request.expeditionId);
      
      // Check available agents
      const agentRepo = RepositoryFactory.getAgentRepository();
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(request.expeditionId);
      
      if (!expedition) return;

      const availableAgents = [];
      for (const agentId of expedition.assignedAgents) {
        if (agentId !== request.agentId) {
          const agent = await agentRepo.findById(agentId);
          if (agent && request.assistance.skillsNeeded.some(skill => agent.tags.includes(skill))) {
            availableAgents.push(agent);
          }
        }
      }

      const assistancePrompt = `
Agent "${request.agentName}" is requesting assistance:
- Type: ${request.assistance.type}
- Skills needed: ${request.assistance.skillsNeeded.join(', ')}
- Duration: ${request.assistance.estimatedDuration} minutes
- Description: ${request.assistance.description}
${request.assistance.preferredAgent ? `- Preferred agent: ${request.assistance.preferredAgent}` : ''}

Available agents with matching skills:
${availableAgents.map(a => `- ${a.name} (${a.category})`).join('\n') || 'No matching agents available'}

Please decide whether to approve this assistance request and coordinate accordingly.
`;

      const response = await vfo.processMessage(assistancePrompt, 'system');

      // Send assistance approval or alternative suggestion
      await this.sendToAgent(request.agentId, {
        id: uuidv4(),
        expeditionId: request.expeditionId,
        agentId: request.agentId,
        agentName: request.agentName,
        messageType: 'assistance-approval',
        content: response,
        timestamp: new Date().toISOString(),
        inResponseTo: request.id,
        actionRequired: true,
        metadata: {
          availableAgents: availableAgents.map(a => ({ id: a.id, name: a.name }))
        }
      });

    } catch (error) {
      this.logger.error('Failed to handle assistance request', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'handleAssistanceRequest'
      });
    }
  }

  /**
   * Handle generic agent message
   */
  private async handleGenericAgentMessage(message: AgentToOfficerMessage): Promise<void> {
    try {
      const vfo = await this.getVirtualFirstOfficer(message.expeditionId);
      const response = await vfo.processMessage(
        `Agent "${message.agentName}" says: ${message.content}`,
        'system'
      );

      if (message.requiresResponse) {
        await this.sendToAgent(message.agentId, {
          id: uuidv4(),
          expeditionId: message.expeditionId,
          agentId: message.agentId,
          agentName: message.agentName,
          messageType: 'guidance',
          content: response,
          timestamp: new Date().toISOString(),
          inResponseTo: message.id,
          actionRequired: false
        });
      }

    } catch (error) {
      this.logger.error('Failed to handle generic agent message', error instanceof Error ? error : new Error(String(error)), {
        service: 'BidirectionalCommunicationService',
        operation: 'handleGenericAgentMessage'
      });
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get Virtual First Officer for expedition
   */
  private async getVirtualFirstOfficer(expeditionId: string): Promise<VirtualFirstOfficer> {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);
    
    if (!expedition) {
      throw new Error(`Expedition ${expeditionId} not found`);
    }

    return this.firstOfficerService.getOrCreateVirtualFirstOfficerForExpedition(
      expeditionId,
      expedition.starshipId,
      expedition
    );
  }

  /**
   * Track active conversation
   */
  private trackConversation(message: AgentToOfficerMessage): void {
    const conversationKey = `${message.expeditionId}-${message.agentId}`;
    let conversation = this.activeConversations.get(conversationKey);

    if (!conversation) {
      conversation = {
        expeditionId: message.expeditionId,
        agentId: message.agentId,
        lastMessageTime: new Date(),
        pendingRequests: new Map()
      };
      this.activeConversations.set(conversationKey, conversation);
    }

    conversation.lastMessageTime = new Date();
    if (message.requiresResponse) {
      conversation.pendingRequests.set(message.id, message);
    }
  }

  /**
   * Persist agent message to database
   */
  private async persistAgentMessage(message: AgentToOfficerMessage): Promise<void> {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    
    const createdMessage = await messageRepo.create({
      expeditionId: message.expeditionId,
      role: 'agent',
      agentId: message.agentId,
      content: message.content,
      messageType: 'task-work',
      timestamp: message.timestamp,
      metadata: {
        communicationType: 'bidirectional',
        messageCategory: 'agent-officer-communication',
        agentName: message.agentName,
        messageType: message.messageType,
        taskId: message.taskId,
        taskTitle: message.taskTitle,
        priority: message.priority,
        requiresResponse: message.requiresResponse,
        ...message.metadata
      }
    });

    // Emit WebSocket event for real-time updates
    const socketService = this.getSocketService();
    if (socketService && createdMessage) {
      const expeditionRoom = `expedition:${message.expeditionId}`;
      socketService.getIO().to(expeditionRoom).emit('message:sent' as any, {
        expeditionId: message.expeditionId,
        message: createdMessage,
        timestamp: new Date().toISOString()
      });
      console.log(`[BIDIRECTIONAL-COMM] Emitted agent message via WebSocket for expedition ${message.expeditionId}`);
      
    }
  }

  /**
   * Persist First Officer message to database
   */
  private async persistOfficerMessage(message: OfficerToAgentMessage): Promise<void> {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    
    const createdMessage = await messageRepo.create({
      expeditionId: message.expeditionId,
      role: 'first-officer',
      content: message.content,
      messageType: 'coordination',
      timestamp: message.timestamp,
      metadata: {
        communicationType: 'bidirectional',
        messageCategory: 'agent-officer-communication',
        targetAgentId: message.agentId,
        targetAgentName: message.agentName,
        messageType: message.messageType,
        taskId: message.taskId,
        inResponseTo: message.inResponseTo,
        actionRequired: message.actionRequired,
        ...message.metadata
      }
    });

    // Emit WebSocket event for real-time updates
    const socketService = this.getSocketService();
    if (socketService && createdMessage) {
      const expeditionRoom = `expedition:${message.expeditionId}`;
      socketService.getIO().to(expeditionRoom).emit('message:sent' as any, {
        expeditionId: message.expeditionId,
        message: createdMessage,
        timestamp: new Date().toISOString()
      });
      console.log(`[BIDIRECTIONAL-COMM] Emitted First Officer message via WebSocket for expedition ${message.expeditionId}`);
    }
  }

  /**
   * Notify about critical blockers
   */
  private async notifyCriticalBlocker(report: BlockerReport): Promise<void> {
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    
    const createdMessage = await messageRepo.create({
      expeditionId: report.expeditionId,
      role: 'system',
      content: `⚠️ CRITICAL BLOCKER: Agent "${report.agentName}" is blocked on ${report.blocker.type} issue: ${report.blocker.description}`,
      messageType: 'notification',
      timestamp: new Date().toISOString(),
      metadata: {
        severity: 'critical',
        blockerReport: report.blocker,
        agentId: report.agentId,
        agentName: report.agentName
      }
    });

    // Emit WebSocket event for real-time updates
    const socketService = this.getSocketService();
    if (socketService && createdMessage) {
      const expeditionRoom = `expedition:${report.expeditionId}`;
      socketService.getIO().to(expeditionRoom).emit('message:sent' as any, {
        expeditionId: report.expeditionId,
        message: createdMessage,
        timestamp: new Date().toISOString()
      });
      console.log(`[BIDIRECTIONAL-COMM] Emitted critical blocker notification via WebSocket for expedition ${report.expeditionId}`);
    }
  }
}

// Export singleton instance
let instance: BidirectionalCommunicationService | null = null;

export function getBidirectionalCommunicationService(): BidirectionalCommunicationService {
  if (!instance) {
    instance = new BidirectionalCommunicationService();
  }
  return instance;
}