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
  // Allow multiple concurrent connections per stream (e.g., chat view and builder overlay)
  private connections: Map<string, Set<ConnectionInfo>> = new Map();

  // Resume ring buffer: store recent logical events per conversation (no per-event IDs)
  private eventBuffers: Map<
    string,
    Array<{ type: 'message' | 'delta' | 'complete' | 'error' | 'ui_action' | 'turn_started' | 'turn_completed'; payload: any }>
  > = new Map();
  private readonly bufferLimit: number = 300; // retain recent events per conversation
  private suppressBuffering: boolean = false; // used during replay to avoid re-buffering

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
    // Do not close existing connections; support multiple listeners per stream

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Immediately flush headers and send a comment prelude to stabilize SSE across proxies
    try {
      const maybe = res as unknown as { flushHeaders?: () => void };
      if (typeof maybe.flushHeaders === 'function') {
        maybe.flushHeaders();
      }
    } catch (e: unknown) {
      // Non-fatal: some environments do not expose flushHeaders

      console.debug(`[StreamingService] flushHeaders failed for ${streamId}:`, e);
    }
    // SSE prelude/comment to ensure the connection is established before first event
    try {
      res.write(':ok\n\n');
    } catch (e: unknown) {
      console.debug(`[StreamingService] prelude write failed for ${streamId}:`, e);
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
    const info: ConnectionInfo = {
      res,
      heartbeatInterval,
      connectedAt: new Date(),
      baseLength: typeof opts?.baseLength === 'number' && opts.baseLength >= 0 ? opts.baseLength : 0,
      runningAdds: 0,
      placeholderStack: [],
    };
    const existing = this.connections.get(streamId);
    if (existing) {
      existing.add(info);
    } else {
      this.connections.set(streamId, new Set([info]));
    }

    // Handle connection close
    res.on('close', () => {
      console.log(`[StreamingService] <<CLOSED BY CLOSE EVENT>> streamId=${streamId}`);
      this.cleanupConnection(streamId, info);
    });

    res.on('error', (error) => {
      console.error(`[StreamingService] Streaming errored ${streamId}`, error);
      this.cleanupConnection(streamId, info);
    });

    console.log(`[StreamingService] New connection added: ${streamId}`);
  }

  /**
   * Broadcast delta operation to a specific stream
   * Normalizes paths to concrete numeric indexes using per-connection sync context.
   */
  async broadcastDelta(streamId: string, delta: Operation): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;

    // Buffer logical (pre-normalization) delta once per stream
    this.bufferLogicalEvent(streamId, 'delta', delta);

    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          const normalized = this.normalizeDelta(streamId, delta, connection);
          this.sendEventToStream(streamId, connection.res, 'delta', normalized);
        }
      })
    );
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
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    this.bufferLogicalEvent(streamId, 'message', message);
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'message', message);
        }
      })
    );
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
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    this.bufferLogicalEvent(streamId, 'ui_action', payload);
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'ui_action', payload);
        }
      })
    );
  }

  /**
   * Broadcast UI action payload to all active streams
   */
  async broadcastUIActionToAll(payload: any): Promise<void> {
    const broadcastPromises = Array.from(this.connections.keys()).map((streamId) => this.broadcastUIAction(streamId, payload));
    await Promise.all(broadcastPromises);
  }

  /**
   * Broadcast initial turn state to current connections (not buffered)
   */
  async broadcastTurnState(streamId: string, payload: any): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'turn_state', payload);
        }
      })
    );
  }

  /**
   * Broadcast turn_started and buffer it for replay
   */
  async broadcastTurnStarted(streamId: string, payload: any): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    this.bufferLogicalEvent(streamId, 'turn_started', payload);
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'turn_started', payload);
        }
      })
    );
  }

  /**
   * Broadcast turn_completed and buffer it for replay
   */
  async broadcastTurnCompleted(streamId: string, payload: any): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    this.bufferLogicalEvent(streamId, 'turn_completed', payload);
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'turn_completed', payload);
        }
      })
    );
  }

  /**
   * Normalize a JSON-Patch operation to use concrete numeric indexes for the messages array
   * based on per-connection synchronization context.
   */
  private normalizeDelta(streamId: string, delta: Operation, connection?: ConnectionInfo): Operation {
    // When broadcasting to multiple connections, a specific connection must be provided
    if (!connection) return delta as any;

    const raw = delta as any;
    const op: string = raw.op;
    let path: string = typeof raw.path === 'string' ? raw.path : '';

    // Helper: current placeholder index (top of stack)
    const topPlaceholder = (): number | undefined =>
      connection.placeholderStack && connection.placeholderStack.length > 0
        ? connection.placeholderStack[connection.placeholderStack.length - 1]
        : undefined;

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
        if (!connection.placeholderStack) connection.placeholderStack = [];
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

      if ((streamingFalse || replaceWhole) && connection.placeholderStack && connection.placeholderStack.length > 0) {
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
    // Always buffer the logical 'complete' event even if no active connections are present.
    // This ensures that on reconnection, any previously buffered deltas from the current turn
    // are correctly bounded and not replayed, preventing duplicated/garbled content.
    this.bufferLogicalEvent(streamId, 'complete', finalResponse);

    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;

    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'complete', finalResponse);
        }
      })
    );
  }

  /**
   * Broadcast error to a specific stream
   * Note: Keep the connection open. Client may decide to retry or continue.
   */
  async broadcastError(streamId: string, error: StreamingError): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    this.bufferLogicalEvent(streamId, 'error', error);
    await Promise.all(
      Array.from(conns).map(async (connection) => {
        if (connection && !connection.res.destroyed) {
          this.sendEventToStream(streamId, connection.res, 'error', error);
        }
      })
    );
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
        if (!res.headersSent) {
          const maybe = res as unknown as { flushHeaders?: () => void };
          if (typeof maybe.flushHeaders === 'function') maybe.flushHeaders();
        }
      } catch (flushError: unknown) {
        console.debug(`[StreamingService] flushHeaders failed for ${streamId}:`, flushError);
      }

      const json = JSON.stringify(data);

      // Lightweight debug logging to understand SSE payload volume without dumping full data
      // Avoid logging the entire payload to keep logs readable.
      let debugMeta: Record<string, unknown> = {};
      if (event === 'message' && data && typeof data === 'object') {
        debugMeta = {
          messageId: (data as { id?: unknown }).id,
          role: (data as { role?: unknown }).role,
          messageType: (data as { messageType?: unknown }).messageType,
        };
      }
      console.debug('[StreamingService] SSE send', {
        streamId,
        event,
        sizeBytes: Buffer.byteLength(json, 'utf8'),
        ...debugMeta,
      });

      res.write(`event: ${event}\n`);
      res.write(`data: ${json}\n\n`);

      // Best-effort body flush for environments with compression middleware
      try {
        const maybe = res as unknown as { flush?: () => void };
        if (typeof maybe.flush === 'function') maybe.flush();
      } catch (flushError: unknown) {
        console.debug(`[StreamingService] flush failed for ${streamId}:`, flushError);
      }
    } catch (error) {
      console.error(`[StreamingService] Failed to send event to ${streamId}:`, error);
    }
  }

  /** Emit a resume_token event */
  sendResumeToken(streamId: string, token: string): void {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;
    // Do not buffer tokens; they are ephemeral hints
    for (const connection of conns) {
      if (!connection.res.destroyed) {
        this.sendEventToStream(streamId, connection.res, 'resume_token', token);
      }
    }
  }

  /**
   * Replay buffered logical events to the current active connection for the stream,
   * starting AFTER a given Last-Event-ID (exclusive). If fromId is 0 or missing,
   * replays the entire buffer.
   */
  async replayBufferedEvents(streamId: string, filter?: (evt: { type: string; payload: any }) => boolean): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;

    const buffer = this.eventBuffers.get(streamId) || [];
    if (buffer.length === 0) return;

    // Suppress buffering while replaying to avoid duplicating into the buffer
    this.suppressBuffering = true;
    try {
      for (const connection of conns) {
        if (connection.res.destroyed) continue;
        for (const evt of buffer) {
          if (filter && !filter(evt)) continue;
          switch (evt.type) {
            case 'delta': {
              const normalized = this.normalizeDelta(streamId, evt.payload as Operation, connection);
              this.sendEventToStream(streamId, connection.res, 'delta', normalized);
              break;
            }
            case 'message': {
              this.sendEventToStream(streamId, connection.res, 'message', evt.payload);
              break;
            }
            case 'complete': {
              this.sendEventToStream(streamId, connection.res, 'complete', evt.payload);
              break;
            }
            case 'error': {
              this.sendEventToStream(streamId, connection.res, 'error', evt.payload);
              break;
            }
            case 'ui_action': {
              this.sendEventToStream(streamId, connection.res, 'ui_action', evt.payload);
              break;
            }
            case 'turn_started': {
              this.sendEventToStream(streamId, connection.res, 'turn_started', evt.payload);
              break;
            }
            case 'turn_completed': {
              this.sendEventToStream(streamId, connection.res, 'turn_completed', evt.payload);
              break;
            }
          }
        }
      }
    } finally {
      this.suppressBuffering = false;
    }
  }

  /** Buffer a logical event for potential replay */
  private bufferLogicalEvent(
    streamId: string,
    type: 'message' | 'delta' | 'complete' | 'error' | 'ui_action' | 'turn_started' | 'turn_completed',
    payload: any
  ): void {
    if (this.suppressBuffering) return;
    let buf = this.eventBuffers.get(streamId);
    if (!buf) {
      buf = [];
      this.eventBuffers.set(streamId, buf);
    }
    buf.push({ type, payload });
    if (buf.length > this.bufferLimit) {
      buf.splice(0, buf.length - this.bufferLimit);
    }
  }

  /**
   * Close a specific connection or all connections
   */
  closeConnection(streamId?: string): void {
    if (streamId) {
      const conns = this.connections.get(streamId);
      if (conns && conns.size > 0) {
        for (const connection of conns) {
          if (!connection.res.destroyed) {
            try {
              connection.res.end();
            } catch {
              // ignore
            }
          }
          this.cleanupConnection(streamId, connection);
        }
      }
    } else {
      // Close all connections
      this.closeAllConnections();
    }
  }

  /**
   * Close all connections
   */
  closeAllConnections(): void {
    for (const [streamId, conns] of this.connections.entries()) {
      for (const connection of conns) {
        if (!connection.res.destroyed) {
          try {
            connection.res.end();
          } catch {
            // ignore
          }
        }
        this.cleanupConnection(streamId, connection);
      }
    }
  }

  /**
   * Cleanup specific connection state
   */
  private cleanupConnection(streamId: string, connection?: ConnectionInfo): void {
    const set = this.connections.get(streamId);
    if (!set) return;

    if (connection) {
      if (connection.heartbeatInterval) {
        clearInterval(connection.heartbeatInterval);
      }
      set.delete(connection);
      if (set.size === 0) {
        this.connections.delete(streamId);
      }
    } else {
      // Cleanup all for this stream
      for (const conn of set) {
        if (conn.heartbeatInterval) clearInterval(conn.heartbeatInterval);
      }
      this.connections.delete(streamId);
    }
    console.log(`[StreamingService] Cleaned up connection for stream: ${streamId}. Remaining=${this.connections.get(streamId)?.size ?? 0}`);
  }

  /**
   * Check if there's an active connection for a specific stream
   */
  isActive(streamId?: string): boolean {
    if (streamId) {
      const set = this.connections.get(streamId);
      if (!set) return false;
      for (const c of set) {
        if (!c.res.destroyed && !c.res.writableEnded) return true;
      }
      return false;
    }

    // Check if any connection is active
    for (const set of this.connections.values()) {
      for (const c of set) {
        if (!c.res.destroyed && !c.res.writableEnded) return true;
      }
    }
    return false;
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
    let count = 0;
    for (const set of this.connections.values()) count += set.size;
    return count;
  }

  /**
   * Get connection info for a specific stream
   */
  getConnectionInfo(streamId: string): { connectedAt: Date; active: boolean } | null {
    const set = this.connections.get(streamId);
    if (!set || set.size === 0) return null;
    // Return info for the first connection
    const connection = Array.from(set)[0];
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

  /**
   * Inspect buffered events to determine the latest known turn state for a stream.
   * Returns true if the buffer indicates an active turn, false if it indicates completion,
   * or undefined if no turn events have been buffered yet.
   */
  getBufferedTurnActive(streamId: string): boolean | undefined {
    const buffer = this.eventBuffers.get(streamId);
    if (!buffer || buffer.length === 0) return undefined;

    // Check buffer for turn lifecycle events (turn_state is not buffered, only sent directly)
    for (let i = buffer.length - 1; i >= 0; i--) {
      const evt = buffer[i];
      if (!evt) continue;
      if (evt.type === 'turn_completed') {
        return false;
      }
      if (evt.type === 'turn_started') {
        return true;
      }
    }

    return undefined;
  }

  /**
   * Replay buffered events for the current turn only (events that occurred after the last 'complete').
   * Skips 'message' events to avoid duplicating persisted baseline messages.
   */
  async replayCurrentTurn(
    streamId: string,
    opts?: {
      minContentPosition?: number;
      skipAssistantShell?: boolean;
      turnIsActive?: boolean;
    }
  ): Promise<void> {
    const conns = this.connections.get(streamId);
    if (!conns || conns.size === 0) return;

    const buffer = this.eventBuffers.get(streamId) || [];
    if (buffer.length === 0) return;

    // Prefer replaying from the most recent turn_started so that turn lifecycle events
    // (including turn_completed) are always delivered on resume.
    let from = 0;
    let turnStartedIdx = -1;
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].type === 'turn_started') {
        turnStartedIdx = i;
        break;
      }
    }
    if (turnStartedIdx >= 0) {
      from = turnStartedIdx;
    } else {
      // Fallback: start after the last 'complete' event to avoid replaying past turns indefinitely.
      let lastComplete = -1;
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].type === 'complete') {
          lastComplete = i;
          break;
        }
      }
      from = Math.max(lastComplete + 1, 0);
      if (from >= buffer.length) return;
    }

    // Check if turn_completed exists in the buffer
    let hasTurnCompleted = false;
    for (let i = from; i < buffer.length; i++) {
      if (buffer[i].type === 'turn_completed') {
        hasTurnCompleted = true;
        break;
      }
    }

    this.suppressBuffering = true;
    try {
      const lastEvt = buffer[buffer.length - 1];
      let replayedAny = false;
      for (const connection of conns) {
        if (connection.res.destroyed) continue;
        for (let i = from; i < buffer.length; i++) {
          const evt = buffer[i];
          if (evt.type === 'message') continue; // avoid duplicating persisted history

          // If turn is inactive, skip turn_started events to prevent client from thinking turn is active
          if (evt.type === 'turn_started' && opts?.turnIsActive === false) {
            continue;
          }

          const skip = evt.type === 'delta' ? this.shouldSkipDelta(evt.payload as Operation, opts) : false;
          if (skip) continue;
          replayedAny = true;
          switch (evt.type) {
            case 'delta': {
              const normalized = this.normalizeDelta(streamId, evt.payload as Operation, connection);
              this.sendEventToStream(streamId, connection.res, 'delta', normalized);
              break;
            }
            case 'complete': {
              this.sendEventToStream(streamId, connection.res, 'complete', evt.payload);
              break;
            }
            case 'error': {
              this.sendEventToStream(streamId, connection.res, 'error', evt.payload);
              break;
            }
            case 'ui_action': {
              this.sendEventToStream(streamId, connection.res, 'ui_action', evt.payload);
              break;
            }
            case 'turn_started': {
              this.sendEventToStream(streamId, connection.res, 'turn_started', evt.payload);
              break;
            }
            case 'turn_completed': {
              this.sendEventToStream(streamId, connection.res, 'turn_completed', evt.payload);
              break;
            }
          }
        }

        // If turn is inactive but we didn't replay turn_completed, send a synthetic one
        // to ensure client knows the turn is done
        if (opts?.turnIsActive === false && !hasTurnCompleted) {
          this.sendEventToStream(streamId, connection.res, 'turn_completed', {
            conversationId: streamId,
            at: new Date().toISOString(),
          });
          replayedAny = true;
        }

        // If nothing to replay after last 'complete', emit that 'complete' so clients can finalize state
        if (!replayedAny && lastEvt && lastEvt.type === 'complete') {
          this.sendEventToStream(streamId, connection.res, 'complete', lastEvt.payload);
        }
      }
    } finally {
      this.suppressBuffering = false;
    }
  }

  private shouldSkipDelta(
    delta: Operation,
    opts?: {
      minContentPosition?: number;
      skipAssistantShell?: boolean;
    }
  ): boolean {
    if (!delta || typeof delta !== 'object') return false;
    const path = typeof delta.path === 'string' ? delta.path : '';
    if (!path) return false;

    const value =
      'value' in delta
        ? ((delta as { value?: { position?: unknown; content?: unknown; role?: unknown; streaming?: unknown } }).value ?? null)
        : null;

    if (opts?.skipAssistantShell) {
      const isPlaceholderAdd =
        delta.op === 'add' &&
        path === '/messages/-' &&
        value &&
        typeof value === 'object' &&
        (value as { role?: string }).role === 'assistant' &&
        (value as { streaming?: unknown }).streaming === true;
      if (isPlaceholderAdd) {
        return true;
      }
      if (/^\/messages\/-1(\/|$)/.test(path)) {
        return true;
      }
    }

    if (delta.op !== 'add') return false;

    const position = typeof value?.position === 'number' ? value.position : undefined;
    const content = typeof value?.content === 'string' ? value.content : '';

    // Skip if value metadata missing
    if (position === undefined || !content) return false;

    const isContentChunk = /\/chunks\/-$/.test(path);
    if (isContentChunk) {
      const minContentPosition = opts?.minContentPosition;
      if (typeof minContentPosition === 'number') {
        const end = position + content.length;
        if (end <= minContentPosition) {
          return true;
        }
      }
    }

    return false;
  }
}
