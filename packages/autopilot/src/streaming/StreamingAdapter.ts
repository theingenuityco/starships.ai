/**
 * Streaming Adapter
 *
 * Bridges autopilot streaming events with server's StreamingService.
 * Converts autopilot stream chunks to server-compatible format.
 */

import type { AutopilotStreamChunk, StreamingCallback, StreamingError, StreamingOptions } from '@/types/streaming';

/**
 * Server StreamingChunk interface (from packages/server)
 * This matches the interface from packages/server/src/services/StreamingService.ts
 */
export interface ServerStreamChunk {
  id: string;
  streamId: string;
  conversationId: string;
  agentId: string;
  type: 'content' | 'thinking' | 'node_start' | 'node_complete' | 'error' | 'complete';
  content: string;
  timestamp: string;
  metadata?: {
    nodeRef?: string;
    tokenCount?: number;
    model?: string;
    processingTimeMs?: number;
    [key: string]: unknown;
  };
}

/**
 * Server StreamingService interface (simplified)
 */
export interface IStreamingService {
  broadcastChunk(streamId: string, chunk: ServerStreamChunk): Promise<void>;
  broadcastError(streamId: string, error: any): Promise<void>;
  broadcastComplete(streamId: string, finalResponse: any): Promise<void>;
}

/**
 * Streaming adapter configuration
 */
export interface StreamingAdapterConfig {
  streamingService?: IStreamingService;
  defaultStreamId?: string;
  defaultConversationId?: string;
  defaultAgentId?: string;
  enabledByDefault?: boolean;
}

/**
 * Streaming adapter that bridges autopilot events with server StreamingService
 */
export class StreamingAdapter {
  private streamingService?: IStreamingService;
  private config: StreamingAdapterConfig;
  private callbacks: StreamingCallback[] = [];
  private isEnabled: boolean = false;
  private currentStreamId?: string;
  private conversationId?: string;
  private agentId?: string;

  constructor(config: StreamingAdapterConfig = {}) {
    this.config = config;
    this.streamingService = config.streamingService;
    this.isEnabled = config.enabledByDefault ?? false;
    this.currentStreamId = config.defaultStreamId;
    this.conversationId = config.defaultConversationId;
    this.agentId = config.defaultAgentId;
  }

  /**
   * Configure streaming for execution
   */
  configure(options: StreamingOptions): void {
    this.isEnabled = options.enabled;
    this.currentStreamId = options.streamId || this.config.defaultStreamId;
    this.conversationId = options.conversationId || this.config.defaultConversationId;
    this.agentId = options.agentId || this.config.defaultAgentId;
  }

  /**
   * Set streaming service (allows runtime injection)
   */
  setStreamingService(service: IStreamingService): void {
    this.streamingService = service;
  }

  /**
   * Add streaming callback
   */
  onChunk(callback: StreamingCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove streaming callback
   */
  offChunk(callback: StreamingCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Check if streaming is enabled and configured
   */
  isStreamingEnabled(): boolean {
    return this.isEnabled && (!!this.streamingService || this.callbacks.length > 0);
  }

  /**
   * Emit a streaming chunk
   */
  async emitChunk(chunk: AutopilotStreamChunk): Promise<void> {
    if (!this.isStreamingEnabled()) {
      return;
    }

    // Call local callbacks first
    await Promise.all(
      this.callbacks.map(async (callback) => {
        try {
          await callback(chunk);
        } catch (error) {
          console.error('[StreamingAdapter] Callback error:', error);
        }
      })
    );

    // Send to server StreamingService if available
    if (this.streamingService && this.currentStreamId) {
      const serverChunk = this.convertToServerChunk(chunk);
      await this.streamingService.broadcastChunk(this.currentStreamId, serverChunk);
    }
  }

  /**
   * Emit streaming error
   */
  async emitError(error: StreamingError): Promise<void> {
    if (!this.isStreamingEnabled()) {
      return;
    }

    // Emit as error chunk to callbacks
    const errorChunk: AutopilotStreamChunk = {
      type: 'error',
      content: error.message,
      metadata: { error: error.code, recoverable: error.recoverable, ...error.context },
    };

    await this.emitChunk(errorChunk);

    // Send to server StreamingService if available
    if (this.streamingService && this.currentStreamId) {
      const serverError = {
        streamId: this.currentStreamId,
        errorCode: error.code,
        message: error.message,
        timestamp: new Date().toISOString(),
        recoverable: error.recoverable,
        context: error.context,
      };
      await this.streamingService.broadcastError(this.currentStreamId, serverError);
    }
  }

  /**
   * Emit completion
   */
  async emitComplete(finalData?: any): Promise<void> {
    if (!this.isStreamingEnabled()) {
      return;
    }

    // Emit complete chunk to callbacks
    const completeChunk: AutopilotStreamChunk = {
      type: 'complete',
      content: 'Execution completed',
      metadata: { finalData },
    };

    await this.emitChunk(completeChunk);

    // Send to server StreamingService if available
    if (this.streamingService && this.currentStreamId) {
      await this.streamingService.broadcastComplete(this.currentStreamId, finalData || {});
    }
  }

  /**
   * Convert autopilot chunk to server chunk format
   */
  private convertToServerChunk(chunk: AutopilotStreamChunk): ServerStreamChunk {
    return {
      id: this.generateChunkId(),
      streamId: this.currentStreamId!,
      conversationId: this.conversationId || 'unknown',
      agentId: this.agentId || 'unknown',
      type: chunk.type as any,
      content: chunk.content,
      timestamp: new Date().toISOString(),
      metadata: chunk.metadata,
    };
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Get current streaming status
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      streamId: this.currentStreamId,
      conversationId: this.conversationId,
      agentId: this.agentId,
      hasStreamingService: !!this.streamingService,
      callbackCount: this.callbacks.length,
    };
  }

  /**
   * Reset streaming state
   */
  reset(): void {
    this.isEnabled = false;
    this.currentStreamId = undefined;
    this.conversationId = undefined;
    this.agentId = undefined;
    this.callbacks = [];
  }
}

/**
 * Global streaming adapter instance
 * Can be configured and used across autopilot components
 */
export const streamingAdapter = new StreamingAdapter();
