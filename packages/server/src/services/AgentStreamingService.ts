/**
 * Autopilot Stream Service with Delta Encoding
 *
 * Server-side implementation of the EngineEmitter interface.
 * Uses RFC6902 JSON Patch to build complete message responses incrementally.
 */

import type { ExecutionEvent, EngineEmitter } from '@starships/autopilot';
import type { StreamingService } from './StreamingService';
import { ArrayDeltaEncoder } from '../utils/DeltaEncoder';
import type { MessageModel, StreamingDeltaChunk } from '@starships/protocol';

/**
 * Autopilot streaming service that uses delta encoding for incremental message updates
 */
export class AgentStreamingService implements EngineEmitter {
  private streamingService: StreamingService;
  private streamId: string;
  private conversationId: string;
  private agentId: string;
  private enabled: boolean = true;
  private deltaEncoder: ArrayDeltaEncoder<MessageModel>;
  private activeMessageIndex: number = -1; // Index of current streaming message

  constructor(streamingService: StreamingService, streamId: string, conversationId: string, agentId: string) {
    this.streamingService = streamingService;
    this.streamId = streamId;
    this.conversationId = conversationId;
    this.agentId = agentId;
    this.deltaEncoder = new ArrayDeltaEncoder<MessageModel>([]);
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
      if (event.type === 'content_chunk') {
        // Handle content streaming with patches
        await this.handleContentChunk(event);
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
        // All other events become messages using delta encoding
        await this.handleEventAsMessage(event);
      }
    } catch (error) {
      console.error('[AgentStreamingService] Failed to emit event:', error);
    }
  }

  /**
   * Handle content chunk by appending to existing message or creating new one
   */
  private async handleContentChunk(event: ExecutionEvent): Promise<void> {
    const content = event.content || '';

    // If we don't have an active message for streaming, create one
    if (this.activeMessageIndex === -1) {
      const streamingMessage: MessageModel = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: '',
        messageType: 'agent_response',
        createdAt: event.timestamp,
        updatedAt: event.timestamp,
      };

      const result = this.deltaEncoder.append(streamingMessage);
      this.activeMessageIndex = result.state.length - 1;

      await this.broadcastDeltas(result.patch);
    }

    // Append content to the active message
    const currentState = this.deltaEncoder.getCurrentState();
    const currentMessage = currentState[this.activeMessageIndex];
    const newContent = (currentMessage.content || '') + content;

    const patchResult = this.deltaEncoder.applyOperations([
      {
        op: 'replace',
        path: `/${this.activeMessageIndex}/content`,
        value: newContent,
      },
      {
        op: 'replace',
        path: `/${this.activeMessageIndex}/updatedAt`,
        value: event.timestamp,
      },
    ]);

    await this.broadcastDeltas(patchResult.patch);
  }

  /**
   * Handle regular events as messages using delta encoding
   */
  private async handleEventAsMessage(event: ExecutionEvent): Promise<void> {
    const messageData = this.convertEventToMessage(event);

    // Special handling for content_complete - update the active streaming message
    if (event.type === 'content_complete' && this.activeMessageIndex !== -1) {
      const patchResult = this.deltaEncoder.applyOperations([
        {
          op: 'replace',
          path: `/${this.activeMessageIndex}/content`,
          value: event.content || '',
        },
        {
          op: 'replace',
          path: `/${this.activeMessageIndex}/updatedAt`,
          value: event.timestamp,
        },
      ]);

      this.activeMessageIndex = -1; // Reset active message
      await this.broadcastDeltas(patchResult.patch);
      return;
    }

    // For all other events, append as new message
    const result = this.deltaEncoder.append(messageData);
    await this.broadcastDeltas(result.patch);
  }

  /**
   * Broadcast delta chunks via streaming service
   */
  private async broadcastDeltas(deltas: StreamingDeltaChunk[]): Promise<void> {
    // Send each JSON patch operation as a pure DeltaChunk
    for (const delta of deltas) {
      await this.streamingService.broadcastDelta(this.streamId, {
        op: delta.op,
        path: delta.path,
        value: delta.value,
        from: delta.from,
      });
    }
  }

  /**
   * Convert autopilot ExecutionEvent to message data
   */
  private convertEventToMessage(event: ExecutionEvent): MessageModel {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    switch (event.type) {
      case 'workflow_started':
        return {
          id: messageId,
          role: 'system',
          content: '🚀 Agent workflow started',
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      case 'node_started':
        return {
          id: messageId,
          role: 'system',
          content: `⏳ Starting node: ${event.execution.currentNodeRef}`,
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      case 'node_completed': {
        // Check if this is an LLM node with response content
        const nodeResult = event.execution.results.get(event.execution.currentNodeRef || '');
        if (nodeResult && !nodeResult.error && nodeResult.data) {
          const llmData = nodeResult.data as any;
          const llmResponseContent = llmData.llmResponse;

          if (llmResponseContent && typeof llmResponseContent === 'string' && llmResponseContent.trim()) {
            // Return assistant message with LLM response
            return {
              id: messageId,
              role: 'assistant',
              content: llmResponseContent.trim(),
              messageType: 'agent_response',
              createdAt: event.timestamp,
              updatedAt: event.timestamp,
            };
          }
        }

        // Fallback to system completion message
        return {
          id: messageId,
          role: 'system',
          content: `✅ Completed node: ${event.execution.currentNodeRef}`,
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
      }

      case 'workflow_completed':
        return {
          id: messageId,
          role: 'system',
          content: '🎉 Agent workflow completed successfully',
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      case 'content_complete':
        return {
          id: messageId,
          role: 'assistant',
          content: event.content || '',
          messageType: 'agent_response',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      case 'workflow_paused':
        return {
          id: messageId,
          role: 'system',
          content: '⏸️ Workflow execution paused',
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      case 'workflow_resumed':
        return {
          id: messageId,
          role: 'system',
          content: '▶️ Workflow execution resumed',
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };

      default:
        return {
          id: messageId,
          role: 'system',
          content: `Unknown event: ${event.type}`,
          messageType: 'system_notification',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
    }
  }

  /**
   * Get current messages state
   */
  getCurrentMessages(): MessageModel[] {
    return this.deltaEncoder.getCurrentState();
  }

  /**
   * Get current version
   */
  getCurrentVersion(): number {
    return this.deltaEncoder.getCurrentVersion();
  }

  /**
   * Reset the delta encoder (useful for new conversations)
   */
  reset(): void {
    this.deltaEncoder = new ArrayDeltaEncoder<MessageModel>([]);
    this.activeMessageIndex = -1;
  }

  /**
   * Generate unique patch ID
   */
  private generatePatchId(): string {
    return `patch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}
