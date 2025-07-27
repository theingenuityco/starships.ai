/**
 * Chat Coordination System
 * 
 * Integrates First Officer workflow with existing chat system for
 * hybrid coordination and user interaction during expeditions.
 */

import { WorkflowPhase, ChatRequest, ChatResponse, MessageType } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { chat } from '../index';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import {
  CoordinationMessage,
  CoordinationMessageType,
  FirstOfficerState,
  ExpeditionProgress
} from './types';

export class ChatCoordinator {
  private memoryStore: LangChainMemoryStore;
  private expeditionId: string;
  private userId: string;
  private starshipId: string;
  private messageHistory: CoordinationMessage[] = [];
  private messageEmitCallback?: (message: any) => Promise<void>;

  constructor(
    memoryStore: LangChainMemoryStore,
    expeditionId: string,
    userId: string,
    starshipId: string,
    messageEmitCallback?: (message: any) => Promise<void>
  ) {
    this.memoryStore = memoryStore;
    this.expeditionId = expeditionId;
    this.userId = userId;
    this.starshipId = starshipId;
    this.messageEmitCallback = messageEmitCallback;
  }

  /**
   * Send coordination message to expedition chat
   */
  async sendCoordinationMessage(
    type: CoordinationMessageType,
    phase: WorkflowPhase,
    content: string,
    data?: any
  ): Promise<void> {
    console.log(`📢 [CHAT-COORDINATOR] Sending ${type} message for phase: ${phase}`);
    console.log(`🐛 [CHAT-COORDINATOR] DEBUG: Modified ChatCoordinator is being used`);
    console.log(`🐛 [CHAT-COORDINATOR] DEBUG: messageEmitCallback exists: ${!!this.messageEmitCallback}`);

    const message: CoordinationMessage = {
      type,
      phase,
      content,
      data,
      timestamp: new Date().toISOString(),
      requiresResponse: type === 'user-question'
    };

    // Store message in history
    this.messageHistory.push(message);

    // Send to expedition message repository
    console.log(`💾 [CHAT-COORDINATOR] About to create message in database for expedition: ${this.expeditionId}`);
    const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
    let createdMessage;
    try {
      createdMessage = await messageRepo.create({
        expeditionId: this.expeditionId,
        role: 'first-officer',
        content: this.formatCoordinationMessage(message),
        messageType: this.mapToMessageType(type),
        timestamp: message.timestamp,
        metadata: {
          coordinationType: type,
          workflowPhase: phase,
          data
        }
      });
      console.log(`✅ [CHAT-COORDINATOR] Message created successfully in database with ID: ${createdMessage?.id}`);
    } catch (error) {
      console.error(`❌ [CHAT-COORDINATOR] Failed to create message in database:`, error);
      throw error;
    }

    // Emit WebSocket event if callback is provided
    if (this.messageEmitCallback && createdMessage) {
      try {
        console.log(`🚀 [CHAT-COORDINATOR] Calling WebSocket emission callback for message type: ${type}`);
        console.log(`🚀 [CHAT-COORDINATOR] Created message:`, JSON.stringify(createdMessage, null, 2));
        await this.messageEmitCallback(createdMessage);
        console.log(`📡 [CHAT-COORDINATOR] WebSocket event emitted successfully for message: ${type}`);
      } catch (error) {
        console.error(`❌ [CHAT-COORDINATOR] Failed to emit WebSocket event:`, error);
      }
    } else {
      if (!this.messageEmitCallback) {
        console.warn(`⚠️ [CHAT-COORDINATOR] No WebSocket emission callback provided for message: ${type}`);
      }
      if (!createdMessage) {
        console.warn(`⚠️ [CHAT-COORDINATOR] No created message to emit for message: ${type}`);
      }
    }

    console.log(`✅ [CHAT-COORDINATOR] Message sent: ${type}`);
  }

  /**
   * Handle user response to coordination message
   */
  async handleUserResponse(userMessage: string): Promise<ChatResponse> {
    console.log(`👤 [CHAT-COORDINATOR] Received user response: ${userMessage.substring(0, 100)}...`);

    // Find the last message that requires response
    const pendingMessage = this.messageHistory
      .reverse()
      .find(msg => msg.requiresResponse);

    if (!pendingMessage) {
      return {
        reply: "I don't have any pending questions. How can I assist with the expedition?",
        usage: undefined
      };
    }

    // Process user response based on message type
    return await this.processUserResponse(pendingMessage, userMessage);
  }

  /**
   * Send phase update message
   */
  async sendPhaseUpdate(
    currentPhase: WorkflowPhase,
    nextPhase: WorkflowPhase,
    progress: ExpeditionProgress
  ): Promise<void> {
    const content = this.buildPhaseUpdateMessage(currentPhase, nextPhase, progress);
    await this.sendCoordinationMessage('phase-update', nextPhase, content, {
      currentPhase,
      nextPhase,
      progress
    });
  }

  /**
   * Send task assignment notification
   */
  async sendTaskAssignment(
    agentName: string,
    taskTitle: string,
    taskDescription: string
  ): Promise<void> {
    const content = `🎯 **Task Assigned**\n\n` +
      `**Agent:** ${agentName}\n` +
      `**Task:** ${taskTitle}\n` +
      `**Description:** ${taskDescription}\n\n` +
      `The agent will begin working on this task shortly.`;

    await this.sendCoordinationMessage('task-assignment', 'coordinating', content, {
      agentName,
      taskTitle,
      taskDescription
    });
  }

  /**
   * Send progress report
   */
  async sendProgressReport(progress: ExpeditionProgress): Promise<void> {
    const content = this.buildProgressReportMessage(progress);
    await this.sendCoordinationMessage('progress-report', progress.currentPhase, content, progress);
  }

  /**
   * Send quality review notification
   */
  async sendQualityReview(
    taskTitle: string,
    qualityScore: number,
    approved: boolean,
    issues: string[]
  ): Promise<void> {
    const status = approved ? '✅ Approved' : '⚠️ Needs Improvement';
    const content = `🔍 **Quality Review Complete**\n\n` +
      `**Task:** ${taskTitle}\n` +
      `**Status:** ${status}\n` +
      `**Quality Score:** ${qualityScore}/100\n\n` +
      (issues.length > 0 ? `**Issues Found:**\n${issues.map(issue => `• ${issue}`).join('\n')}\n\n` : '') +
      (approved ? 'Task meets quality standards and is approved.' : 'Task requires revision before approval.');

    await this.sendCoordinationMessage('quality-review', 'synthesizing', content, {
      taskTitle,
      qualityScore,
      approved,
      issues
    });
  }

  /**
   * Ask user question and wait for response
   */
  async askUserQuestion(
    question: string,
    context?: any
  ): Promise<string> {
    console.log(`❓ [CHAT-COORDINATOR] Asking user question: ${question}`);

    await this.sendCoordinationMessage('user-question', 'coordinating', question, context);

    // In a real implementation, this would wait for user response through WebSocket or polling
    // For now, we'll return a placeholder that indicates user input is needed
    return 'USER_INPUT_REQUIRED';
  }

  /**
   * Send error report
   */
  async sendErrorReport(
    error: string,
    phase: WorkflowPhase,
    recoveryAction?: string
  ): Promise<void> {
    const content = `❌ **Error Encountered**\n\n` +
      `**Phase:** ${phase}\n` +
      `**Error:** ${error}\n\n` +
      (recoveryAction ? `**Recovery Action:** ${recoveryAction}` : 'Manual intervention may be required.');

    await this.sendCoordinationMessage('error-report', phase, content, {
      error,
      phase,
      recoveryAction
    });
  }

  /**
   * Send expedition completion summary
   */
  async sendCompletionSummary(
    result: string,
    stats: {
      totalTasks: number;
      completedTasks: number;
      duration: number;
      qualityScore: number;
    }
  ): Promise<void> {
    const content = this.buildCompletionSummaryMessage(result, stats);
    await this.sendCoordinationMessage('completion-summary', 'completed', content, stats);
  }

  /**
   * Format coordination message for display
   */
  private formatCoordinationMessage(message: CoordinationMessage): string {
    // Remove timestamp formatting to make it look like a regular chat message
    // The timestamp will be handled by the UI component
    const phaseEmoji = this.getPhaseEmoji(message.phase);
    
    return `${phaseEmoji} ${message.content}`;
  }

  /**
   * Map coordination message type to expedition message type
   */
  private mapToMessageType(type: CoordinationMessageType): MessageType {
    const mapping: Record<CoordinationMessageType, MessageType> = {
      'phase-update': 'coordination',
      'task-assignment': 'coordination',
      'progress-report': 'status-update',
      'quality-review': 'coordination',
      'user-question': 'question',
      'error-report': 'notification',
      'completion-summary': 'result'
    };
    
    return mapping[type] || 'coordination';
  }

  /**
   * Process user response to coordination message
   */
  private async processUserResponse(
    pendingMessage: CoordinationMessage,
    userResponse: string
  ): Promise<ChatResponse> {
    switch (pendingMessage.type) {
      case 'user-question':
        return {
          reply: `Thank you for your response. I'll incorporate your feedback: "${userResponse}" into the expedition workflow.`,
          usage: undefined
        };
      
      default:
        return {
          reply: `I've noted your response: "${userResponse}". The expedition will continue accordingly.`,
          usage: undefined
        };
    }
  }

  /**
   * Build phase update message
   */
  private buildPhaseUpdateMessage(
    currentPhase: WorkflowPhase,
    nextPhase: WorkflowPhase,
    progress: ExpeditionProgress
  ): string {
    const phaseNames: Record<WorkflowPhase, string> = {
      'initializing': 'Initialization',
      'analyzing': 'Objective Analysis',
      'decomposing': 'Task Planning',
      'plan_tasks': 'Task Planning',
      'assigning': 'Agent Selection',
      'coordinating': 'Task Execution',
      'synthesizing': 'Result Synthesis',
      'waiting_for_approval': 'Waiting for Approval',
      'completed': 'Expedition Complete',
      'failed': 'Expedition Failed'
    };

    return `🔄 **Phase Transition**\n\n` +
      `**From:** ${phaseNames[currentPhase]}\n` +
      `**To:** ${phaseNames[nextPhase]}\n` +
      `**Overall Progress:** ${progress.overallProgress}%\n` +
      `**Tasks Completed:** ${progress.tasksCompleted}/${progress.tasksTotal}\n\n` +
      `Moving to the next phase of the expedition.`;
  }

  /**
   * Build progress report message
   */
  private buildProgressReportMessage(progress: ExpeditionProgress): string {
    const progressBar = this.createProgressBar(progress.overallProgress);
    
    return `📊 **Progress Report**\n\n` +
      `${progressBar} ${progress.overallProgress}%\n\n` +
      `**Current Phase:** ${progress.currentPhase}\n` +
      `**Tasks Completed:** ${progress.tasksCompleted}/${progress.tasksTotal}\n` +
      `**Quality Score:** ${progress.qualityScore}/100\n` +
      `**Estimated Time Remaining:** ${progress.estimatedTimeRemaining} minutes\n\n` +
      (progress.issues.length > 0 ? 
        `**Current Issues:**\n${progress.issues.map(issue => `• ${issue}`).join('\n')}` : 
        'No issues detected. Expedition proceeding smoothly.');
  }

  /**
   * Build completion summary message
   */
  private buildCompletionSummaryMessage(
    result: string,
    stats: {
      totalTasks: number;
      completedTasks: number;
      duration: number;
      qualityScore: number;
    }
  ): string {
    const successRate = Math.round((stats.completedTasks / stats.totalTasks) * 100);
    
    return `🎉 **Expedition Complete**\n\n` +
      `**Final Result:**\n${result}\n\n` +
      `**Expedition Statistics:**\n` +
      `• Tasks Completed: ${stats.completedTasks}/${stats.totalTasks} (${successRate}%)\n` +
      `• Duration: ${stats.duration} minutes\n` +
      `• Average Quality Score: ${stats.qualityScore}/100\n\n` +
      `The expedition has been successfully completed. All deliverables are ready for review.`;
  }

  /**
   * Create progress bar visualization
   */
  private createProgressBar(progress: number): string {
    const barLength = 20;
    const filledLength = Math.round((progress / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    return '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  }

  /**
   * Get emoji for workflow phase
   */
  private getPhaseEmoji(phase: WorkflowPhase): string {
    const emojis: Record<WorkflowPhase, string> = {
      'initializing': '🚀',
      'analyzing': '🔍',
      'decomposing': '📋',
      'plan_tasks': '📋',
      'assigning': '👥',
      'coordinating': '⚡',
      'synthesizing': '🔧',
      'waiting_for_approval': '⏳',
      'completed': '✅',
      'failed': '❌'
    };
    
    return emojis[phase] || '🔄';
  }

  /**
   * Get message history
   */
  getMessageHistory(): CoordinationMessage[] {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }
}