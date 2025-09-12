/**
 * Autopilot Stream Service
 *
 * Server-side implementation of the EngineEmitter interface.
 * Converts autopilot ExecutionEvents directly to Message format for streaming.
 */

import type { ExecutionEvent, EngineEmitter } from '@starships/autopilot';
import type { StreamingChunk } from '@starships/protocol';
import type { StreamingService } from './StreamingService';

/**
 * Autopilot streaming service that converts ExecutionEvents directly to Message format
 */
export class AutopilotStreamService implements EngineEmitter {
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
      // Most events become messages, only content_chunk becomes chunk
      if (event.type === 'content_chunk') {
        // Handle content streaming - convert to chunk
        const serverChunk = this.convertEventToServerChunk(event);
        await this.streamingService.broadcastChunk(serverChunk);
      } else if (event.type === 'workflow_failed' || event.type === 'node_failed') {
        // Handle errors with special error broadcast
        await this.streamingService.broadcastError({
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
        // All other events become messages
        const messageData = this.convertEventToMessage(event);
        await this.streamingService.broadcastMessage(messageData);
      }
    } catch (error) {
      console.error('[AutopilotStreamService] Failed to emit event:', error);
    }
  }

  /**
   * Convert autopilot ExecutionEvent to server streaming chunk (only for content_chunk)
   */
  private convertEventToServerChunk(event: ExecutionEvent): StreamingChunk {
    const baseChunk: StreamingChunk = {
      id: this.generateChunkId(),
      streamId: this.streamId,
      conversationId: this.conversationId,
      agentId: this.agentId,
      type: 'content',
      content: '',
      timestamp: event.timestamp,
      metadata: {
        eventType: event.type,
      },
    };

    // Only handle content_chunk events here
    if (event.type === 'content_chunk') {
      return {
        ...baseChunk,
        type: 'content',
        content: event.content || '',
        metadata: {
          ...baseChunk.metadata,
          nodeRef: event.contentMetadata?.nodeRef,
          model: event.contentMetadata?.model,
          accumulated: event.contentMetadata?.accumulated,
          isComplete: false,
        },
      };
    }

    // Fallback for unexpected events
    return {
      ...baseChunk,
      content: `Unexpected chunk event: ${event.type}`,
    };
  }

  /**
   * Convert autopilot ExecutionEvent to message data
   */
  private convertEventToMessage(event: ExecutionEvent): any {
    const baseMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      conversationId: this.conversationId,
      agentId: this.agentId,
      timestamp: event.timestamp,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      version: '1.0.0',
      threadDepth: 0,
      hasAttachments: false,
      streaming: true,
    };

    switch (event.type) {
      case 'workflow_started':
        return {
          ...baseMessage,
          role: 'system',
          content: '🚀 Agent workflow started',
          messageType: 'system_message',
          importance: 'low',
          processingStatus: 'completed',
          contentLength: 27,
          metadata: {
            event: 'workflow_started',
            timestamp: event.timestamp,
          },
        };

      case 'node_started':
        return {
          ...baseMessage,
          role: 'system',
          content: `⏳ Starting node: ${event.execution.currentNodeRef}`,
          messageType: 'system_message',
          importance: 'low',
          processingStatus: 'completed',
          contentLength: `⏳ Starting node: ${event.execution.currentNodeRef}`.length,
          metadata: {
            event: 'node_started',
            nodeRef: event.execution.currentNodeRef,
            timestamp: event.timestamp,
          },
        };

      case 'node_completed': {
        // Check if this is an LLM node with response content
        const nodeResult = event.execution.executionResults.get(event.execution.currentNodeRef || '');
        if (nodeResult && !nodeResult.error && nodeResult.data) {
          const llmData = nodeResult.data as any;
          const llmResponseContent = llmData.llmResponse;

          if (llmResponseContent && typeof llmResponseContent === 'string' && llmResponseContent.trim()) {
            // Return assistant message with LLM response
            return {
              ...baseMessage,
              role: 'assistant',
              content: llmResponseContent.trim(),
              messageType: 'agent_response',
              importance: 'high',
              processingStatus: 'completed',
              contentLength: llmResponseContent.trim().length,
              metadata: {
                event: 'llm_response',
                nodeRef: event.execution.currentNodeRef,
                model: llmData.model,
                timestamp: event.timestamp,
              },
            };
          }
        }

        // Fallback to system completion message
        return {
          ...baseMessage,
          role: 'system',
          content: `✅ Completed node: ${event.execution.currentNodeRef}`,
          messageType: 'system_message',
          importance: 'low',
          processingStatus: 'completed',
          contentLength: `✅ Completed node: ${event.execution.currentNodeRef}`.length,
          metadata: {
            event: 'node_completed',
            nodeRef: event.execution.currentNodeRef,
            timestamp: event.timestamp,
          },
        };
      }
      case 'workflow_completed':
        return {
          ...baseMessage,
          role: 'system',
          content: '🎉 Agent workflow completed successfully',
          messageType: 'system_message',
          importance: 'medium',
          processingStatus: 'completed',
          contentLength: 40,
          metadata: {
            event: 'workflow_completed',
            timestamp: event.timestamp,
            executionResults: Array.from(event.execution.executionResults.keys()),
          },
        };

      case 'content_complete':
        return {
          ...baseMessage,
          role: 'assistant',
          content: event.content || '',
          messageType: 'agent_response',
          importance: 'high',
          processingStatus: 'completed',
          contentLength: (event.content || '').length,
          metadata: {
            event: 'content_complete',
            nodeRef: event.contentMetadata?.nodeRef,
            model: event.contentMetadata?.model,
            accumulated: event.contentMetadata?.accumulated,
            isComplete: true,
            timestamp: event.timestamp,
          },
        };

      case 'workflow_paused':
        return {
          ...baseMessage,
          role: 'system',
          content: '⏸️ Workflow execution paused',
          messageType: 'system_message',
          importance: 'medium',
          processingStatus: 'completed',
          contentLength: 29,
          metadata: {
            event: 'workflow_paused',
            status: 'paused',
            timestamp: event.timestamp,
          },
        };

      case 'workflow_resumed':
        return {
          ...baseMessage,
          role: 'system',
          content: '▶️ Workflow execution resumed',
          messageType: 'system_message',
          importance: 'medium',
          processingStatus: 'completed',
          contentLength: 30,
          metadata: {
            event: 'workflow_resumed',
            status: 'running',
            timestamp: event.timestamp,
          },
        };

      default:
        return {
          ...baseMessage,
          role: 'system',
          content: `Unknown event: ${event.type}`,
          messageType: 'system_message',
          importance: 'low',
          processingStatus: 'completed',
          contentLength: `Unknown event: ${event.type}`.length,
          metadata: {
            event: event.type,
            timestamp: event.timestamp,
          },
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
   * Create system messages directly without using ServerEvent
   */
  async emitSystemMessage(content: string, messageType: string = 'system_message', importance: string = 'low'): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const timestamp = new Date().toISOString();
      const messageData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        conversationId: this.conversationId,
        agentId: this.agentId,
        timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: '1.0.0',
        threadDepth: 0,
        hasAttachments: false,
        streaming: true,
        role: 'system' as const,
        content,
        messageType,
        importance,
        processingStatus: 'completed' as const,
        contentLength: content.length,
        metadata: {
          serverGenerated: true,
          timestamp,
        },
      };

      await this.streamingService.broadcastMessage(messageData);
    } catch (error) {
      console.error('[AutopilotStreamService] Failed to emit system message:', error);
    }
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
