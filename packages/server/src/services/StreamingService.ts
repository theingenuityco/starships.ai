import type { ConversationResponse, StreamingChunk, StreamingError } from '@starships/protocol';
import type { Response } from 'express';

/**
 * Streaming Service using Server-Sent Events (SSE)
 * Handles a single streaming connection for real-time communication
 */
export class StreamingService {
  private streamId?: string;
  private res?: Response;
  private heartbeatInterval?: NodeJS.Timeout;

  /**
   * Add new streaming connection (replaces any existing connection)
   */
  addConnection(streamId: string, res: Response): void {
    // Close any existing connection first
    this.closeConnection();

    this.streamId = streamId;
    this.res = res;

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send connection confirmation
    this.sendEvent('connection', { streamId, status: 'connected' });

    // Handle connection close
    res.on('close', () => {
      console.log(`[StreamingService] Streaming disconnected ${streamId}`);
      this.cleanup();
    });

    res.on('error', (error) => {
      console.error(`[StreamingService] Streaming errored ${streamId}`, error);
      this.cleanup();
    });

    // Send heartbeat every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      this.sendEvent('heartbeat', { timestamp: new Date().toISOString() });
    }, 30000);
  }

  /**
   * Broadcast chunk to the current stream
   */
  async broadcastChunk(chunk: StreamingChunk): Promise<void> {
    if (this.res && !this.res.destroyed) {
      this.sendEvent('chunk', chunk);
    }
  }

  /**
   * Broadcast complete message object to the current stream
   */
  async broadcastMessage(message: any): Promise<void> {
    if (this.res && !this.res.destroyed) {
      this.sendEvent('message', message);
    }
  }

  /**
   * Broadcast completion to the current stream
   */
  async broadcastComplete(finalResponse: ConversationResponse): Promise<void> {
    if (this.res && !this.res.destroyed) {
      this.sendEvent('complete', finalResponse);

      // Close connection gracefully after completion
      setTimeout(() => {
        this.closeConnection();
      }, 1000);
    }
  }

  /**
   * Broadcast error to the current stream
   */
  async broadcastError(error: StreamingError): Promise<void> {
    if (this.res && !this.res.destroyed) {
      this.sendEvent('error', error);

      // Close connection after error
      setTimeout(() => {
        this.closeConnection();
      }, 1000);
    }
  }

  /**
   * Send Server-Sent Event
   */
  private sendEvent(event: string, data: any): void {
    if (!this.res) {
      return;
    }

    try {
      if (this.res.destroyed || this.res.writableEnded) {
        return;
      }

      this.res.write(`event: ${event}\n`);
      this.res.write(`data: ${JSON.stringify(data)}\n\n`);

      // Force flush to prevent buffering and ensure real-time streaming
      try {
        if (!this.res.headersSent) {
          this.res.flushHeaders();
        }
      } catch (flushError) {
        // Ignore flush errors to prevent breaking the stream
        console.debug('[StreamingService] Flush failed:', flushError);
      }
    } catch (error) {
      console.error('[StreamingService] Failed to send event:', error);
    }
  }

  /**
   * Close the current connection
   */
  closeConnection(): void {
    if (this.res && !this.res.destroyed) {
      try {
        this.res.end();
      } catch (error) {
        // Ignore errors when closing
      }
    }
    this.cleanup();
  }

  /**
   * Cleanup connection state
   */
  private cleanup(): void {
    const streamId = this.streamId;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    this.streamId = undefined;
    this.res = undefined;

    if (streamId) {
      console.log(`[StreamingService] Cleaned up stream: ${streamId}`);
    }
  }

  /**
   * Check if there's an active connection
   */
  isActive(): boolean {
    return this.res !== undefined && !this.res.destroyed && !this.res.writableEnded;
  }

  /**
   * Get current stream ID
   */
  getCurrentStreamId(): string | undefined {
    return this.streamId;
  }

  /**
   * Generate unique stream ID
   */
  static generateStreamId(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique chunk ID
   */
  static generateChunkId(): string {
    return `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
}
