/**
 * Autopilot Stream Service
 *
 * Server-side implementation of the StreamingEmitter interface.
 * Converts autopilot ExecutionEvents to server streaming format and broadcasts them.
 */

import type { ExecutionEvent, StreamingEmitter } from '@starships/autopilot';
import type { StreamingChunk } from '@starships/protocol';
import type { StreamingService } from './StreamingService';

/**
 * Server-side streaming service that converts autopilot events to streaming format
 */
export class AutopilotStreamService implements StreamingEmitter {
  private streamingService: StreamingService;
  private streamId: string;
  private conversationId: string;
  private agentId: string;
  private enabled: boolean = true;

  constructor(streamingService: StreamingService, streamId: string, conversationId: string, agentId: string) {
    this.streamingService = streamingService;
    this.streamId = streamId;
    this.conversationId = conversationId;
    this.agentId = agentId;
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Disable streaming
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Handle execution event from autopilot engine
   */
  async emitExecutionEvent(event: ExecutionEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const serverChunk = this.convertEventToServerChunk(event);

      // Handle errors differently
      if (event.type === 'workflow_failed' || event.type === 'node_failed') {
        await this.streamingService.broadcastError(this.streamId, {
          streamId: this.streamId,
          errorCode: event.execution.error?.code || 'EXECUTION_FAILED',
          message: event.execution.error?.message || 'Execution failed',
          timestamp: event.timestamp,
          recoverable: event.execution.error?.recoverable ?? false,
          context: {
            eventType: event.type,
            nodeRef: event.execution.currentNodeRef,
          },
        });
      } else {
        await this.streamingService.broadcastChunk(this.streamId, serverChunk);
      }
    } catch (error) {
      console.error('[AutopilotStreamService] Failed to emit event:', error);
    }
  }

  /**
   * Convert autopilot ExecutionEvent to server streaming chunk
   */
  private convertEventToServerChunk(event: ExecutionEvent): StreamingChunk {
    const baseChunk: StreamingChunk = {
      id: this.generateChunkId(),
      streamId: this.streamId,
      conversationId: this.conversationId,
      agentId: this.agentId,
      type: 'content', // default
      content: '',
      timestamp: event.timestamp,
      metadata: {
        eventType: event.type,
      },
    };

    switch (event.type) {
      case 'workflow_started':
        return {
          ...baseChunk,
          type: 'node_start',
          content: 'Workflow execution started',
          metadata: {
            ...baseChunk.metadata,
          },
        };

      case 'node_started':
        return {
          ...baseChunk,
          type: 'node_start',
          content: `Starting node: ${event.execution.currentNodeRef}`,
          metadata: {
            ...baseChunk.metadata,
            nodeRef: event.execution.currentNodeRef,
          },
        };

      case 'node_completed':
        return {
          ...baseChunk,
          type: 'node_complete',
          content: `Completed node: ${event.execution.currentNodeRef}`,
          metadata: {
            ...baseChunk.metadata,
            nodeRef: event.execution.currentNodeRef,
          },
        };

      case 'node_failed':
        return {
          ...baseChunk,
          type: 'error',
          content: `Node failed: ${event.execution.error?.message || 'Unknown error'}`,
          metadata: {
            ...baseChunk.metadata,
            nodeRef: event.execution.currentNodeRef,
            errorCode: event.execution.error?.code,
          },
        };

      case 'workflow_completed':
        return {
          ...baseChunk,
          type: 'complete',
          content: 'Workflow execution completed',
          metadata: {
            ...baseChunk.metadata,
            status: event.execution.status,
          },
        };

      case 'workflow_failed':
        return {
          ...baseChunk,
          type: 'error',
          content: `Workflow failed: ${event.execution.error?.message || 'Unknown error'}`,
          metadata: {
            ...baseChunk.metadata,
            errorCode: event.execution.error?.code,
            nodeRef: event.execution.currentNodeRef,
          },
        };

      case 'workflow_paused':
        return {
          ...baseChunk,
          type: 'thinking',
          content: 'Workflow execution paused',
          metadata: {
            ...baseChunk.metadata,
            status: 'paused',
          },
        };

      case 'workflow_resumed':
        return {
          ...baseChunk,
          type: 'thinking',
          content: 'Workflow execution resumed',
          metadata: {
            ...baseChunk.metadata,
            status: 'running',
          },
        };

      default:
        return {
          ...baseChunk,
          content: `Unknown event: ${event.type}`,
        };
    }
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get current streaming configuration
   */
  getConfig() {
    return {
      streamId: this.streamId,
      conversationId: this.conversationId,
      agentId: this.agentId,
      enabled: this.enabled,
    };
  }
}
