import type { StreamingError } from '@starships/protocol';
import type { Response } from 'express';
import type { Operation } from 'fast-json-patch';

interface ConversationResponse {
  source: 'agent';
  content: string;
  agentId: string;
  scope?: 'turn' | 'workflow';
  conversationId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

interface ConnectionInfo {
  res: Response;
  heartbeatInterval: ReturnType<typeof setInterval>;
  connectedAt: Date;

  // Per-connection synchronization context
  baseLength: number; // client-declared baseline messages length at connect time
  runningAdds: number; // number of server-emitted message appends after connect
  // Support multiple overlapping placeholders (stack-like behavior)
  placeholderStack: number[]; // top is the most recent placeholder index
}

/**
 * Streaming Service using Server-Sent Events (SSE)
 * Handles multiple concurrent streaming connections for real-time communication
 * Implemented as a singleton to ensure consistent state across the application
 */
export class StreamingService {
  private static instance: StreamingService | null = null;
  private connections: Map<string, ConnectionInfo> = new Map();

  /**
   * Constructor that enforces singleton pattern
   * Always returns the same instance when called with 'new'
   */
  constructor() {
    if (StreamingService.instance) {
      return StreamingService.instance;
    }

    StreamingService.instance = this;
    return this;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    if (StreamingService.instance) {
      StreamingService.instance.closeAllConnections();
      StreamingService.instance = null;
    }
  }

  /**
   * Add new streaming connection (supports multiple concurrent connections)
   */
  addConnection(streamId: string, res: Response, opts?: { baseLength?: number }): void {
    // Close any existing connection for this streamId
    this.closeConnection(streamId);

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Immediately flush headers and send a comment prelude to stabilize SSE across proxies
    try {
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }
    } catch {
      // ignore
    }
    // SSE prelude/comment to ensure the connection is established before first event
    try {
      res.write(':ok\n\n');
    } catch {
      // ignore
    }

    // Send connection confirmation
    this.sendEventToStream(streamId, res, 'connection', { streamId, status: 'connected' });

    // Create heartbeat interval for this connection
    const heartbeatInterval = setInterval(() => {
      if (this.connections.has(streamId)) {
        this.sendEventToStream(streamId, res, 'heartbeat', { timestamp: new Date().toISOString() });
      }
    }, 30000);

    // Store connection info with sync baseline
    this.connections.set(streamId, {
      res,
      heartbeatInterval,
      connectedAt: new Date(),
      baseLength: typeof opts?.baseLength === 'number' && opts.baseLength >= 0 ? opts.baseLength : 0,
      runningAdds: 0,
      placeholderStack: [],
    });

    // Handle connection close
    res.on('close', () => {
      console.log(`[StreamingService] <<CLOSED BY CLOSE EVENT>> streamId=${streamId}`);
      this.cleanupConnection(streamId);
    });

    res.on('error', (error) => {
      console.error(`[StreamingService] Streaming errored ${streamId}`, error);
      this.cleanupConnection(streamId);
    });

    console.log(`[StreamingService] New connection added: ${streamId}`);
  }

  /**
   * Broadcast delta operation to a specific stream
   * Normalizes paths to concrete numeric indexes using per-connection sync context.
   */
  async broadcastDelta(streamId: string, delta: Operation): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      const normalized = this.normalizeDelta(streamId, delta);
      this.sendEventToStream(streamId, connection.res, 'delta', normalized);
    }
  }

  /**
   * Broadcast delta operation to all active streams
   */
  async broadcastDeltaToAll(delta: Operation): Promise<void> {
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
   * Broadcast UI action payload to a specific stream
   */
  async broadcastUIAction(streamId: string, payload: any): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'ui_action', payload);
    }
  }

  /**
   * Broadcast UI action payload to all active streams
   */
  async broadcastUIActionToAll(payload: any): Promise<void> {
    const broadcastPromises = Array.from(this.connections.keys()).map((streamId) => this.broadcastUIAction(streamId, payload));
    await Promise.all(broadcastPromises);
  }

  /**
   * Normalize a JSON-Patch operation to use concrete numeric indexes for the messages array
   * based on per-connection synchronization context.
   */
  private normalizeDelta(streamId: string, delta: Operation): Operation {
    const connection = this.connections.get(streamId);
    if (!connection) return delta;

    const raw = delta as any;
    const op: string = raw.op;
    let path: string = typeof raw.path === 'string' ? raw.path : '';

    // Helper: current placeholder index (top of stack)
    const topPlaceholder = (): number | undefined =>
      connection.placeholderStack.length > 0 ? connection.placeholderStack[connection.placeholderStack.length - 1] : undefined;

    // 1) Array append: '/messages/-' -> '/messages/{baseLength + runningAdds}'
    if (op === 'add' && path === '/messages/-') {
      const index = connection.baseLength + connection.runningAdds;

      // If this is the assistant streaming shell, push its index to placeholder stack
      const isAssistantPlaceholder =
        raw?.value &&
        typeof raw.value === 'object' &&
        raw.value.role === 'assistant' &&
        (raw.value.streaming === true || (typeof raw.value.content === 'string' && raw.value.content.length === 0));

      if (isAssistantPlaceholder) {
        connection.placeholderStack.push(index);
      }

      // Increment running adds
      connection.runningAdds += 1;

      return { ...raw, path: `/messages/${index}` } as Operation;
    }

    // 2) '-1' refers to the current streaming placeholder message for this connection
    if (/^\/messages\/-1(\/|$)/.test(path)) {
      const fallbackLast = Math.max(connection.baseLength + connection.runningAdds - 1, 0);
      const targetIndex = typeof topPlaceholder() === 'number' ? (topPlaceholder() as number) : fallbackLast;

      const newPath = path.replace(/^\/messages\/-1/, `/messages/${targetIndex}`);
      const normalized = { ...raw, path: newPath } as Operation;

      // Pop placeholder on completion events:
      // - replace '/streaming' -> false
      // - replace whole message '/messages/{idx}'
      const isReplace = normalized.op === 'replace';
      const streamingFalse =
        isReplace && typeof normalized.path === 'string' && /\/streaming$/.test(normalized.path) && raw?.value === false;
      const replaceWhole = isReplace && typeof normalized.path === 'string' && /^\/messages\/\d+$/.test(normalized.path);

      if ((streamingFalse || replaceWhole) && connection.placeholderStack.length > 0) {
        const tokens = String(normalized.path).split('/');
        const idxInPath = tokens.length >= 3 ? Number(tokens[2]) : NaN;
        if (!Number.isNaN(idxInPath) && idxInPath === topPlaceholder()) {
          connection.placeholderStack.pop();
        }
      }

      return normalized;
    }

    // 3) Already concrete/other paths - pass through
    return raw as Operation;
  }

  /**
   * Broadcast completion to a specific stream
   * Note: Do NOT auto-close here. Let the client decide when to close,
   * and allow additional messages in the same SSE session if needed.
   */
  async broadcastComplete(streamId: string, finalResponse: ConversationResponse): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'complete', finalResponse);
    }
  }

  /**
   * Broadcast error to a specific stream
   * Note: Keep the connection open. Client may decide to retry or continue.
   */
  async broadcastError(streamId: string, error: StreamingError): Promise<void> {
    const connection = this.connections.get(streamId);
    if (connection && !connection.res.destroyed) {
      this.sendEventToStream(streamId, connection.res, 'error', error);
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

      // Ensure headers are sent before first chunk (prevents proxy buffering)
      try {
        if (!res.headersSent && typeof (res as any).flushHeaders === 'function') {
          (res as any).flushHeaders();
        }
      } catch (flushError) {
        console.debug(`[StreamingService] flushHeaders failed for ${streamId}:`, flushError);
      }

      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      // Best-effort body flush for environments with compression middleware
      try {
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (flushError) {
        console.debug(`[StreamingService] flush failed for ${streamId}:`, flushError);
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
