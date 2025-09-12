import { WebSocket, WebSocketServer } from 'ws';

interface ConversationResponse {
  source: 'agent';
  content: string;
  agentId: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// Streaming chunk interface
export interface StreamingChunk {
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
  };
}

export interface StreamingError {
  streamId: string;
  errorCode: string;
  message: string;
  timestamp: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

/**
 * WebSocket Service for real-time streaming
 * Manages WebSocket connections for streaming communication
 */
export class WebSocketService {
  private connections = new Map<string, WebSocket>();
  private wss: WebSocketServer | null = null;

  constructor() {
    // Public constructor following service pattern
  }

  /**
   * Initialize WebSocket server
   */
  initialize(port: number = 8080): void {
    if (this.wss) {
      console.log('[WebSocketService] Server already initialized');
      return;
    }

    this.wss = new WebSocketServer({ port });
    console.log(`[WebSocketService] Server initialized on port ${port}`);

    this.wss.on('connection', (ws, req) => {
      const streamId = this.extractStreamIdFromUrl(req.url || '');
      if (streamId) {
        this.connections.set(streamId, ws);
        console.log(`[WebSocketService] Client connected to stream: ${streamId}`);

        ws.on('close', () => {
          this.connections.delete(streamId);
          console.log(`[WebSocketService] Client disconnected from stream: ${streamId}`);
        });

        ws.on('error', (error) => {
          console.error(`[WebSocketService] Connection error for stream ${streamId}:`, error);
          this.connections.delete(streamId);
        });

        // Send connection confirmation
        this.sendToStream(streamId, {
          type: 'connection',
          data: { streamId, status: 'connected' },
        });
      } else {
        console.warn('[WebSocketService] Connection rejected - invalid stream ID');
        ws.close();
      }
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocketService] Server error:', error);
    });
  }

  /**
   * Broadcast chunk to specific stream
   */
  async broadcastChunk(streamId: string, chunk: StreamingChunk): Promise<void> {
    this.sendToStream(streamId, {
      type: 'chunk',
      data: chunk,
    });
  }

  /**
   * Broadcast completion to specific stream
   */
  async broadcastComplete(streamId: string, finalResponse: ConversationResponse): Promise<void> {
    this.sendToStream(streamId, {
      type: 'complete',
      data: finalResponse,
    });

    // Close connection after completion
    setTimeout(() => this.closeStream(streamId), 1000);
  }

  /**
   * Broadcast error to specific stream
   */
  async broadcastError(streamId: string, error: StreamingError): Promise<void> {
    this.sendToStream(streamId, {
      type: 'error',
      data: error,
    });

    // Close connection after error
    setTimeout(() => this.closeStream(streamId), 1000);
  }

  /**
   * Send message to specific stream
   */
  private sendToStream(streamId: string, message: any): void {
    const ws = this.connections.get(streamId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`[WebSocketService] Failed to send message to stream ${streamId}:`, error);
        this.connections.delete(streamId);
      }
    }
  }

  /**
   * Close specific stream
   */
  private closeStream(streamId: string): void {
    const ws = this.connections.get(streamId);
    if (ws) {
      ws.close();
      this.connections.delete(streamId);
    }
  }

  /**
   * Extract stream ID from WebSocket URL
   */
  private extractStreamIdFromUrl(url: string): string | null {
    // Expected format: /ws/streams/stream_123456_abc
    const match = url.match(/\/ws\/streams\/([^?]+)/);
    return match ? match[1] : null;
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
    const ws = this.connections.get(streamId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }

  /**
   * Cleanup inactive connections
   */
  cleanup(): void {
    const inactiveStreams: string[] = [];

    this.connections.forEach((ws, streamId) => {
      if (ws.readyState !== WebSocket.OPEN) {
        inactiveStreams.push(streamId);
      }
    });

    inactiveStreams.forEach((streamId) => {
      this.connections.delete(streamId);
    });

    if (inactiveStreams.length > 0) {
      console.log(`[WebSocketService] Cleaned up ${inactiveStreams.length} inactive connections`);
    }
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.wss) {
      // Close all active connections
      this.connections.forEach((ws, streamId) => {
        ws.close();
      });
      this.connections.clear();

      // Close server
      this.wss.close();
      this.wss = null;
      console.log('[WebSocketService] Server shutdown');
    }
  }
}
