import type { ConversationResponse, StreamingChunk, StreamingError } from '@starships/protocol';
import type { Response } from 'express';

/**
 * Streaming Service using Server-Sent Events (SSE)
 * Manages SSE streaming connections for real-time communication
 * Uses singleton pattern to share connections across requests
 */
export class StreamingService {
  private static instance: StreamingService;
  private connections = new Map<string, Response>();
  private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

  constructor() {
    // Public constructor following service pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): StreamingService {
    if (!StreamingService.instance) {
      StreamingService.instance = new StreamingService();
    }
    return StreamingService.instance;
  }

  /**
   * Add new streaming connection
   */
  addConnection(streamId: string, res: Response): void {
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
      'X-Accel-Buffering': 'no', // Disable nginx buffering for real-time streaming
    });

    // Send connection confirmation
    this.sendEvent(res, 'connection', { streamId, status: 'connected' });

    // Store connection
    this.connections.set(streamId, res);
    console.log(`[StreamingService] Client connected to stream: ${streamId}`);

    // Handle connection close
    res.on('close', () => {
      this.removeConnection(streamId);
    });

    res.on('error', (error) => {
      console.error(`[StreamingService] Stream error for ${streamId}:`, error);
      this.removeConnection(streamId);
    });

    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeat = setInterval(() => {
      if (this.connections.has(streamId)) {
        this.sendEvent(res, 'heartbeat', { timestamp: new Date().toISOString() });
      } else {
        clearInterval(heartbeat);
      }
    }, 30000);

    this.heartbeatIntervals.set(streamId, heartbeat);
  }

  /**
   * Remove connection and cleanup
   */
  private removeConnection(streamId: string): void {
    this.connections.delete(streamId);

    const heartbeat = this.heartbeatIntervals.get(streamId);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.heartbeatIntervals.delete(streamId);
    }

    console.log(`[StreamingService] Client disconnected from stream: ${streamId}`);
  }

  /**
   * Broadcast chunk to specific stream
   */
  async broadcastChunk(streamId: string, chunk: StreamingChunk): Promise<void> {
    const res = this.connections.get(streamId);
    if (res && !res.destroyed) {
      this.sendEvent(res, 'chunk', chunk);
    }
  }

  /**
   * Broadcast completion to specific stream
   */
  async broadcastComplete(streamId: string, finalResponse: ConversationResponse): Promise<void> {
    const res = this.connections.get(streamId);
    if (res && !res.destroyed) {
      this.sendEvent(res, 'complete', finalResponse);

      // Close connection gracefully after completion
      setTimeout(() => {
        this.closeStream(streamId);
      }, 1000);
    }
  }

  /**
   * Broadcast error to specific stream
   */
  async broadcastError(streamId: string, error: StreamingError): Promise<void> {
    const res = this.connections.get(streamId);
    if (res && !res.destroyed) {
      this.sendEvent(res, 'error', error);

      // Close connection after error
      setTimeout(() => {
        this.closeStream(streamId);
      }, 1000);
    }
  }

  /**
   * Send Server-Sent Event
   */
  private sendEvent(res: Response, event: string, data: any): void {
    try {
      if (res.destroyed || res.writableEnded) {
        return;
      }

      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('[StreamingService] Failed to send event:', error);
    }
  }

  /**
   * Close specific stream
   */
  closeStream(streamId: string): void {
    const res = this.connections.get(streamId);
    if (res && !res.destroyed) {
      try {
        res.end();
      } catch (error) {
        // Ignore errors when closing
      }
    }
    this.removeConnection(streamId);
  }

  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.connections.size;
  }

  /**
   * Get active stream IDs
   */
  getActiveStreamIds(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Check if stream is active
   */
  isStreamActive(streamId: string): boolean {
    const res = this.connections.get(streamId);
    return res !== undefined && !res.destroyed && !res.writableEnded;
  }

  /**
   * Cleanup inactive connections
   */
  cleanup(): void {
    const inactiveStreams: string[] = [];

    this.connections.forEach((res, streamId) => {
      if (res.destroyed || res.writableEnded) {
        inactiveStreams.push(streamId);
      }
    });

    inactiveStreams.forEach((streamId) => {
      this.removeConnection(streamId);
    });

    if (inactiveStreams.length > 0) {
      console.log(`[StreamingService] Cleaned up ${inactiveStreams.length} inactive connections`);
    }
  }

  /**
   * Shutdown all connections
   */
  shutdown(): void {
    this.connections.forEach((res, streamId) => {
      this.closeStream(streamId);
    });
    this.connections.clear();
    this.heartbeatIntervals.clear();
    console.log('[StreamingService] All connections closed');
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
