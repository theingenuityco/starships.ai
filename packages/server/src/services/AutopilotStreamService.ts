/**
 * Unified Stream Service
 *
 * Server-side implementation of the StreamingEmitter interface.
 * Converts both autopilot ExecutionEvents and server events to unified streaming format.
 */

import type { ExecutionEvent, StreamingEmitter } from '@starships/autopilot';
import type { StreamingChunk } from '@starships/protocol';
import type { StreamingService } from './StreamingService';

/**
 * Server event types for unified streaming
 */
export interface ServerEvent {
  type: 'server_message' | 'server_error' | 'server_instant_response';
  timestamp: string;
  conversationId?: string;
  agentId?: string;
  starshipId?: string;
  messageData?: {
    role: 'system' | 'assistant' | 'user';
    content: string;
    messageType?: string;
    importance?: string;
    processingStatus?: string;
    metadata?: Record<string, unknown>;
  };
  error?: {
    code?: string;
    message: string;
    recoverable?: boolean;
  };
}

/**
 * Unified streaming service that converts both autopilot and server events to streaming format
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
      // Most events become messages, only content_chunk becomes chunk
      if (event.type === 'content_chunk') {
        // Handle content streaming - convert to chunk
        const serverChunk = this.convertEventToServerChunk(event);
        await this.streamingService.broadcastChunk(this.streamId, serverChunk);
      } else if (event.type === 'workflow_failed' || event.type === 'node_failed') {
        // Handle errors with special error broadcast
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
        // All other events become messages
        const messageData = this.convertEventToMessage(event);
        await this.streamingService.broadcastMessage(this.streamId, messageData);
      }
    } catch (error) {
      console.error('[AutopilotStreamService] Failed to emit event:', error);
    }
  }

  /**
   * Handle server-generated events (unified with autopilot events)
   */
  async emitServerEvent(event: ServerEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      // Handle server errors differently
      if (event.type === 'server_error') {
        await this.streamingService.broadcastError(this.streamId, {
          streamId: this.streamId,
          errorCode: event.error?.code || 'SERVER_ERROR',
          message: event.error?.message || 'Server error',
          timestamp: event.timestamp,
          recoverable: event.error?.recoverable ?? false,
          context: {
            eventType: event.type,
            agentId: event.agentId,
            conversationId: event.conversationId,
          },
        });
      } else {
        // Server events become messages (like autopilot events)
        const messageData = this.convertServerEventToMessage(event);
        await this.streamingService.broadcastMessage(this.streamId, messageData);
      }
    } catch (error) {
      console.error('[AutopilotStreamService] Failed to emit server event:', error);
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

      case 'node_completed':
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
   * Convert server event to message data
   */
  private convertServerEventToMessage(event: ServerEvent): any {
    const baseMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      conversationId: event.conversationId || this.conversationId,
      agentId: event.agentId || this.agentId,
      timestamp: event.timestamp,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
      version: '1.0.0',
      threadDepth: 0,
      hasAttachments: false,
      streaming: true,
    };

    switch (event.type) {
      case 'server_message':
        if (event.messageData) {
          return {
            ...baseMessage,
            role: event.messageData.role,
            content: event.messageData.content,
            messageType: event.messageData.messageType || 'system_message',
            importance: event.messageData.importance || 'medium',
            processingStatus: event.messageData.processingStatus || 'completed',
            contentLength: event.messageData.content.length,
            metadata: event.messageData.metadata || {
              serverEvent: event.type,
              timestamp: event.timestamp,
            },
          };
        }
        break;

      case 'server_instant_response':
        return {
          ...baseMessage,
          role: 'assistant',
          content: event.messageData?.content || '',
          messageType: 'agent_response',
          importance: 'medium',
          processingStatus: 'processing',
          contentLength: (event.messageData?.content || '').length,
          metadata: {
            serverEvent: event.type,
            instantResponse: true,
            timestamp: event.timestamp,
          },
        };

      default:
        return {
          ...baseMessage,
          role: 'system',
          content: `Unknown server event: ${event.type}`,
          messageType: 'system_message',
          importance: 'low',
          processingStatus: 'completed',
          contentLength: `Unknown server event: ${event.type}`.length,
          metadata: {
            serverEvent: event.type,
            timestamp: event.timestamp,
          },
        };
    }

    return baseMessage;
  }

  /**
   * Convert server event to streaming chunk (unified with autopilot events)
   */
  private convertServerEventToChunk(event: ServerEvent): StreamingChunk {
    const baseChunk: StreamingChunk = {
      id: this.generateChunkId(),
      streamId: this.streamId,
      conversationId: event.conversationId || this.conversationId,
      agentId: event.agentId || this.agentId,
      type: 'content', // default
      content: '',
      timestamp: event.timestamp,
      metadata: {
        eventType: event.type,
      },
    };

    switch (event.type) {
      case 'server_message':
        // Convert server message data to appropriate chunk type
        if (event.messageData) {
          const chunkType =
            event.messageData.role === 'assistant'
              ? 'content'
              : event.messageData.messageType === 'system_message'
                ? 'thinking'
                : 'content';

          return {
            ...baseChunk,
            type: chunkType,
            content: event.messageData.content,
            metadata: {
              ...baseChunk.metadata,
              role: event.messageData.role,
              messageType: event.messageData.messageType,
              importance: event.messageData.importance,
              processingStatus: event.messageData.processingStatus,
              serverMetadata: event.messageData.metadata,
            },
          };
        }
        break;

      case 'server_instant_response':
        // For instant empty responses
        return {
          ...baseChunk,
          type: 'content',
          content: event.messageData?.content || '',
          metadata: {
            ...baseChunk.metadata,
            role: 'assistant',
            processingStatus: 'processing',
            instantResponse: true,
          },
        };

      case 'server_error':
        return {
          ...baseChunk,
          type: 'error',
          content: `Server error: ${event.error?.message || 'Unknown server error'}`,
          metadata: {
            ...baseChunk.metadata,
            errorCode: event.error?.code,
          },
        };

      default:
        return {
          ...baseChunk,
          content: `Unknown server event: ${event.type}`,
        };
    }

    return baseChunk;
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Create server event for instant assistant response (replaces old broadcastMessage for empty responses)
   */
  async emitInstantAssistantResponse(content: string = ''): Promise<void> {
    const serverEvent: ServerEvent = {
      type: 'server_instant_response',
      timestamp: new Date().toISOString(),
      conversationId: this.conversationId,
      agentId: this.agentId,
      messageData: {
        role: 'assistant',
        content,
        messageType: 'agent_response',
        importance: 'medium',
        processingStatus: 'processing',
      },
    };

    await this.emitServerEvent(serverEvent);
  }

  /**
   * Create server event for system messages (replaces old broadcastMessage for system messages)
   */
  async emitSystemMessage(content: string, messageType: string = 'system_message', importance: string = 'low'): Promise<void> {
    const serverEvent: ServerEvent = {
      type: 'server_message',
      timestamp: new Date().toISOString(),
      conversationId: this.conversationId,
      agentId: this.agentId,
      messageData: {
        role: 'system',
        content,
        messageType,
        importance,
        processingStatus: 'completed',
      },
    };

    await this.emitServerEvent(serverEvent);
  }

  /**
   * Create server event for existing message objects (replaces old broadcastMessage)
   */
  async emitExistingMessage(messageObject: any): Promise<void> {
    const serverEvent: ServerEvent = {
      type: 'server_message',
      timestamp: new Date().toISOString(),
      conversationId: this.conversationId,
      agentId: this.agentId,
      messageData: {
        role: messageObject.role || 'system',
        content: messageObject.content || '',
        messageType: messageObject.messageType || 'system_message',
        importance: messageObject.importance || 'medium',
        processingStatus: messageObject.processingStatus || 'completed',
        metadata: messageObject,
      },
    };

    await this.emitServerEvent(serverEvent);
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
