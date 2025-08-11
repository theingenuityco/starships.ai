/**
 * Workflow Event Service
 * 
 * Handles emission of workflow-related WebSocket events to connected clients.
 * Integrates with the existing SocketIOService to emit workflow DSL events.
 */

import { WorkflowDSL, WorkflowApprovalStatus, WorkflowRuntimeState } from '@starships/protocol';
import { emitExpeditionEvent } from '../types/socket-types';

/**
 * Workflow event data interfaces
 */
export interface WorkflowDSLGeneratedEventData {
  expeditionId: string;
  workflowId: string;
  workflow: WorkflowDSL;
  nodeCount: number;
  estimatedDuration: number;
  complexity: string;
  timestamp: string;
}

export interface WorkflowDSLApprovalEventData {
  expeditionId: string;
  workflowId: string;
  approvalStatus: WorkflowApprovalStatus;
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  timestamp: string;
}

export interface WorkflowExecutionEventData {
  expeditionId: string;
  workflowId: string;
  status: 'started' | 'paused' | 'resumed' | 'completed' | 'failed';
  currentNodeId?: string;
  timestamp: string;
}

export interface WorkflowNodeEventData {
  expeditionId: string;
  workflowId: string;
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: 'executing' | 'completed' | 'failed';
  startTime?: string;
  endTime?: string;
  duration?: number;
  result?: any;
  error?: string;
  timestamp: string;
}

export interface WorkflowUserPromptEventData {
  expeditionId: string;
  workflowId: string;
  promptId: string;
  promptText: string;
  choices?: Array<{ id: string; text: string; value: string }>;
  timeout?: number;
  timestamp: string;
}

export class WorkflowEventService {
  private static instance: WorkflowEventService;
  private socketIOService: any = null;

  private constructor() {
    this.initializeSocketService();
  }

  static getInstance(): WorkflowEventService {
    if (!WorkflowEventService.instance) {
      WorkflowEventService.instance = new WorkflowEventService();
    }
    return WorkflowEventService.instance;
  }

  private async initializeSocketService() {
    try {
      // Lazy load SocketIOService to avoid circular dependencies
      const { SocketIOService } = await import('./SocketIOService');
      this.socketIOService = SocketIOService.getInstance();
      console.log('[WORKFLOW-EVENTS] Successfully connected to SocketIOService');
    } catch (error) {
      console.warn('[WORKFLOW-EVENTS] SocketIOService not available, events will be logged only');
    }
  }

  /**
   * Emit workflow DSL generated event
   */
  async emitWorkflowDSLGenerated(data: WorkflowDSLGeneratedEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow DSL generated for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-dsl-generated', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-dsl-generated to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow DSL approved event
   */
  async emitWorkflowDSLApproved(data: WorkflowDSLApprovalEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow DSL approved for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-dsl-approved', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-dsl-approved to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow DSL rejected event
   */
  async emitWorkflowDSLRejected(data: WorkflowDSLApprovalEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow DSL rejected for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-dsl-rejected', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-dsl-rejected to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow DSL modified event
   */
  async emitWorkflowDSLModified(data: WorkflowDSLGeneratedEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow DSL modified for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-dsl-modified', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-dsl-modified to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow execution started event
   */
  async emitWorkflowExecutionStarted(data: WorkflowExecutionEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow execution started for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-execution-started', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-execution-started to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow node executing event
   */
  async emitWorkflowNodeExecuting(data: WorkflowNodeEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow node ${data.nodeId} executing for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-node-executing', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-node-executing to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow node completed event
   */
  async emitWorkflowNodeCompleted(data: WorkflowNodeEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow node ${data.nodeId} completed for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-node-completed', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-node-completed to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow user prompt required event
   */
  async emitWorkflowUserPromptRequired(data: WorkflowUserPromptEventData): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow user prompt required for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-user-prompt-required', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-user-prompt-required to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Emit workflow user prompt responded event
   */
  async emitWorkflowUserPromptResponded(data: {
    expeditionId: string;
    workflowId: string;
    promptId: string;
    response: any;
    respondedBy: string;
    timestamp: string;
  }): Promise<void> {
    console.log(`[WORKFLOW-EVENTS] Workflow user prompt responded for expedition ${data.expeditionId}`);
    
    if (this.socketIOService) {
      const roomId = `expedition:${data.expeditionId}`;
      this.socketIOService.getIO().to(roomId).emit('expedition:workflow-user-prompt-responded', data);
      console.log(`[WORKFLOW-EVENTS] Emitted workflow-user-prompt-responded to room ${roomId}`);
    } else {
      console.log('[WORKFLOW-EVENTS] SocketIO not available, event logged only');
    }
  }

  /**
   * Health check to verify service is working
   */
  getHealthStatus(): { available: boolean; socketIOConnected: boolean } {
    return {
      available: true,
      socketIOConnected: !!this.socketIOService
    };
  }
}

export default WorkflowEventService;