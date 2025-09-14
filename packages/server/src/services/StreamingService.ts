import type { StreamingDeltaChunk, StreamingError } from '@starships/protocol';
import type { Response } from 'express';

interface ConversationResponse {
  source: 'agent';
  content: string;
  agentId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface ConnectionInfo {
  res: Response;
  heartbeatInterval: ReturnType<typeof setInterval>;
  connectedAt: Date;
}

/**
 * Streaming Service using Server-Sent Events (SSE)
 * Handles multiple concurrent streaming connections for real-time communication
 */
export class StreamingService {
  private connections: Map<string, ConnectionInfo> = new Map();

  /**
   * Add new streaming connection (supports multiple concurrent connections)
   */
  addConnection(streamId: string, res: Response): void {
    // Close any existing connection for this streamId
    this.closeConnection(streamId);

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send connection confirmation
    this.sendEventToStream(streamId, res, 'connection', { streamId, status: 'connected' });

    // Create heartbeat interval for this connection
    const heartbeatInterval = setInterval(() => {
      if (this.connections.has(streamId)) {
        this.sendEventToStream(streamId, res, 'heartbeat', { timestamp: new Date().toISOString() });
      }
    }, 30000);

    // Store connection info
    this.connections.set(streamId, {
      res,
      heartbeatInterval,
      connectedAt: new Date(),
    });

    // Handle connection close
    res.on('close', () => {
      console.log(`[StreamingService] Streaming disconnected ${streamId}`);
      this.cleanupConnection(streamId);
    });

    res.on('error', (error) => {
      console.error(`[StreamingService] Streaming errored ${streamId}`, error);
      this.cleanupConnection(streamId);
    });

    console.log(`[StreamingService] New connection added: ${streamId}`);
  }

  /**
   * Broadcast delta chunk to a specific stream
   */
  async broadcastDelta(streamId: string, delta: StreamingDeltaChunk): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'delta', delta);
    }
  }

  /**
   * Broadcast delta chunk to all active streams
   */
  async broadcastDeltaToAll(delta: StreamingDeltaChunk): Promise<void> {
    const broadcastPromises = Array.from(this.connections.keys()).map((streamId) => this.broadcastDelta(streamId, delta));
    await Promise.all(broadcastPromises);
  }

  /**
   * Broadcast complete message object to a specific stream
   */
  async broadcastMessage(streamId: string, message: any): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'message', message);
    }
  }

  /**
   * Broadcast complete message object to all active streams
   */
  async broadcastMessageToAll(message: any): Promise<void> {
    const broadcastPromises = Array.from(this.connections.keys()).map((streamId) => this.broadcastMessage(streamId, message));
    await Promise.all(broadcastPromises);
  }

  /**
   * Broadcast completion to a specific stream
   */
  async broadcastComplete(streamId: string, finalResponse: ConversationResponse): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'complete', finalResponse);

      // Close connection gracefully after completion
      setTimeout(() => {
        this.closeConnection(streamId);
      }, 1000);
    }
  }

  /**
   * Broadcast error to a specific stream
   */
  async broadcastError(streamId: string, error: StreamingError): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'error', error);

      // Close connection after error
      setTimeout(() => {
        this.closeConnection(streamId);
      }, 1000);
    }
  }

  /**
   * Send Server-Sent Event to a specific stream
   */
  private sendEventToStream(streamId: string, res: Response, event: string, data: any): void {
    try {
      if (res.destroyed || res.writableEnded) {
        return;
      }

      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      // Force flush to prevent buffering and ensure real-time streaming
      try {
        if (!res.headersSent) {
          res.flushHeaders();
        }
      } catch (flushError) {
        // Ignore flush errors to prevent breaking the stream
        console.debug(`[StreamingService] Flush failed for ${streamId}:`, flushError);
      }
    } catch (error) {
      console.error(`[StreamingService] Failed to send event to ${streamId}:`, error);
    }
  }

  /**
   * Close a specific connection or all connections
   */
  closeConnection(streamId?: string): void {
    if (streamId) {
      // Close specific connection
      const connection = this.connections.get(streamId);
      if (connection && !connection.res.destroyed) {
        try {
          connection.res.end();
        } catch (error) {
          // Ignore errors when closing
        }
      }
      this.cleanupConnection(streamId);
    } else {
      // Close all connections
      this.closeAllConnections();
    }
  }

  /**
   * Close all connections
   */
  closeAllConnections(): void {
    for (const streamId of this.connections.keys()) {
      this.closeConnection(streamId);
    }
  }

  /**
   * Cleanup specific connection state
   */
  private cleanupConnection(streamId: string): void {
    const connection = this.connections.get(streamId);

    if (connection) {
      if (connection.heartbeatInterval) {
        clearInterval(connection.heartbeatInterval);
      }

      this.connections.delete(streamId);
      console.log(`[StreamingService] Cleaned up connection: ${streamId}`);
    }
  }

  /**
   * Check if there's an active connection for a specific stream
   */
  isActive(streamId?: string): boolean {
    if (streamId) {
      const connection = this.connections.get(streamId);
      return connection !== undefined && !connection.res.destroyed && !connection.res.writableEnded;
    }

    // Check if any connection is active
    return Array.from(this.connections.values()).some((connection) => !connection.res.destroyed && !connection.res.writableEnded);
  }

  /**
   * Get all active stream IDs
   */
  getActiveStreamIds(): string[] {
    return Array.from(this.connections.keys()).filter((streamId) => this.isActive(streamId));
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get connection info for a specific stream
   */
  getConnectionInfo(streamId: string): { connectedAt: Date; active: boolean } | null {
    const connection = this.connections.get(streamId);
    if (!connection) {
      return null;
    }

    return {
      connectedAt: connection.connectedAt,
      active: !connection.res.destroyed && !connection.res.writableEnded,
    };
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
