import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type {
  SocketConnectionState,
  SessionSocketEvents,
  EventEmissionOptions,
  EventEmissionResult,
} from '@starships/protocol';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from './UserService';
import { getEnvConfig } from '@starships/env';

// JWT verification function for Socket.IO
async function verifySocketJWT(token: string) {
  try {
    // Decode token without verification first to check its structure
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid JWT format: expected 3 parts, got ${parts.length}`);
    }

    // For our JWT auth system, we'll verify using the same secret as the auth routes
    const env = getEnvConfig();
    const jwtSecret = env.JWT_SECRET;
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Use our JWT secret for verification
    const secret = new TextEncoder().encode(jwtSecret);
    const result = await jwtVerify(token, secret);

    return result.payload;
  } catch (error) {
    console.error('[SOCKET.IO] JWT verification error details:', error);
    throw error;
  }
}

/**
 * Consolidated Socket.IO Service with enhanced features
 * Combines functionality from both SocketIOService and EnhancedSocketIOService
 */
export class SocketIOService {
  private static instance: SocketIOService;
  private io: SocketIOServer<SessionSocketEvents>;
  private connections: Map<string, SocketConnectionState> = new Map();
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  private reconnectionAttempts: Map<string, number> = new Map();
  private eventQueue: Map<string, Array<{ event: string; data: any; timestamp: number }>> =
    new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  private constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      // Enhanced configuration for better reliability
      allowEIO3: true,
      maxHttpBufferSize: 1e6, // 1MB
      httpCompression: true,
      perMessageDeflate: true,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHealthCheck();
    this.setupGracefulShutdown();
  }

  static initialize(httpServer: HTTPServer): SocketIOService {
    if (!SocketIOService.instance) {
      SocketIOService.instance = new SocketIOService(httpServer);
    }
    return SocketIOService.instance;
  }

  static getInstance(): SocketIOService {
    if (!SocketIOService.instance) {
      throw new Error('SocketIOService not initialized');
    }
    return SocketIOService.instance;
  }

  private setupMiddleware() {
    // Rate limiting middleware
    this.io.use((socket, next) => {
      const userId = socket.handshake.auth.userId;
      const maxConnections = 5;

      if (userId) {
        const userConnections = this.userSockets.get(userId) || new Set();
        if (userConnections.size >= maxConnections) {
          return next(new Error('Too many connections for this user'));
        }
      }

      next();
    });

    // Non-blocking authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token - this is the only blocking operation
        const payload = await verifySocketJWT(token);

        // Store user info immediately for connection
        socket.data.userId = payload.sub as string;
        socket.data.email = payload.email as string;
        socket.data.name = payload.name as string;
        socket.data.avatar = payload.avatar as string;
        socket.data.authenticated = true;
        socket.data.connectedAt = Date.now();
        socket.data.userResolved = true; // With JWT, user is immediately resolved

        console.log(
          `[SOCKET.IO] JWT verified for user ID: ${payload.sub}, connection ready`
        );

        // Allow connection immediately - user resolution happens in background
        next();
      } catch (error) {
        console.error('[SOCKET.IO] JWT verification failed:', error);
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      const socketId = socket.id;

      console.log(
        `[SOCKET.IO] Connection established for user ID: ${userId}, socket: ${socketId}`
      );

      // Initialize connection state
      this.connections.set(socketId, {
        connected: true,
        authenticated: true,
        roomJoined: false,
        userId: userId,
        connectionId: socketId,
        lastPing: Date.now(),
      });

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socketId);

      // Auto-join user to their personal room
      const userRoom = this.getUserRoom(userId);
      socket.join(userRoom);
      this.updateConnectionState(socketId, { roomJoined: true });

      // Send initial connection confirmation
      socket.emit('connection-status', {
        status: 'connected',
        userId: userId,
        connectionId: socketId,
        timestamp: new Date().toISOString(),
      });

      // Process any queued events for this user
      this.processQueuedEvents(userId, socketId);

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        this.updateConnectionState(socketId, { lastPing: Date.now() });
        socket.emit('pong');
      });

      // Handle disconnection with cleanup
      socket.on('disconnect', (reason) => {
        const currentUserId = socket.data.userId;
        console.log(`[SOCKET.IO] User ${currentUserId} disconnected: ${reason}`);
        this.handleDisconnection(socketId, currentUserId, reason);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        const currentUserId = socket.data.userId;
        console.error(`[SOCKET.IO] Socket error for user ${currentUserId}:`, error);
        this.handleSocketError(socketId, currentUserId, error);
      });
    });
  }

  private handleDisconnection(socketId: string, userId: string, reason: string) {
    console.log(
      `[SOCKET.IO] Handling disconnection for socket ${socketId}, user ${userId}, reason: ${reason}`
    );

    // Clean up connection state
    this.connections.delete(socketId);

    // Remove from user sockets tracking (works for both temp and resolved IDs)
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Reset reconnection attempts if clean disconnect
    if (reason === 'client namespace disconnect' || reason === 'server namespace disconnect') {
      this.reconnectionAttempts.delete(userId);
    }
  }

  private handleSocketError(socketId: string, userId: string, error: any) {
    console.warn(`[SOCKET.IO] Socket error for user ${userId}:`, error);

    const attempts = this.reconnectionAttempts.get(userId) || 0;
    this.reconnectionAttempts.set(userId, attempts + 1);

    // More lenient error handling - only disconnect for severe errors
    if (attempts > 10) {
      // Increased threshold
      console.warn(`[SOCKET.IO] Too many errors for user ${userId}, temporarily blocking`);
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        // Send warning before disconnecting
        socket.emit('connection-status', {
          status: 'error',
          userId: userId,
          connectionId: socketId,
          timestamp: new Date().toISOString(),
        });

        // Delay disconnection to allow user to see the warning
        setTimeout(() => {
          if (socket.connected) {
            socket.disconnect(true);
          }
        }, 3000);
      }
    } else if (attempts > 5) {
      // Send warning but don't disconnect
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('connection-status', {
          status: 'reconnecting',
          userId: userId,
          connectionId: socketId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  private processQueuedEvents(userId: string, socketId: string) {
    const queuedEvents = this.eventQueue.get(userId);
    if (queuedEvents && queuedEvents.length > 0) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        console.log(
          `[SOCKET.IO] Processing ${queuedEvents.length} queued events for user ${userId}`
        );

        queuedEvents.forEach(({ event, data }) => {
          socket.emit(event as any, data);
        });

        this.eventQueue.delete(userId);
      }
    }
  }


  private startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      const staleThreshold = 120000; // 2 minutes

      // Check for stale connections
      this.connections.forEach((state, socketId) => {
        if (now - (state.lastPing || 0) > staleThreshold) {
          console.warn(`[SOCKET.IO] Stale connection detected: ${socketId}`);
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      });

      // Clean up old queued events (older than 5 minutes)
      const eventThreshold = 300000; // 5 minutes
      this.eventQueue.forEach((events, userId) => {
        const filteredEvents = events.filter((event) => now - event.timestamp < eventThreshold);
        if (filteredEvents.length !== events.length) {
          if (filteredEvents.length === 0) {
            this.eventQueue.delete(userId);
          } else {
            this.eventQueue.set(userId, filteredEvents);
          }
        }
      });
    }, 30000); // Run every 30 seconds
  }

  private setupGracefulShutdown() {
    const shutdown = () => {
      console.log('[SOCKET.IO] Graceful shutdown initiated...');
      this.isShuttingDown = true;

      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Notify all connected clients
      this.io.emit('connection-status', {
        status: 'disconnected',
        userId: 'system',
        connectionId: 'system',
        timestamp: new Date().toISOString(),
      });

      // Close all connections
      this.io.close(() => {
        console.log('[SOCKET.IO] All connections closed');
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  private updateConnectionState(socketId: string, updates: Partial<SocketConnectionState>) {
    const current = this.connections.get(socketId);
    if (current) {
      this.connections.set(socketId, { ...current, ...updates });
    }
  }

  // Public methods for other services
  getIO(): SocketIOServer<SessionSocketEvents> {
    return this.io;
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  // Agent-specific room management (backward compatibility)
  getAgentRoom(agentId: string, userId: string): string {
    return `agent:${agentId}:${userId}`;
  }

  joinAgentRoom(socket: any, agentId: string, userId: string): void {
    const room = this.getAgentRoom(agentId, userId);
    socket.join(room);
    console.log(`[SOCKET.IO] User ${userId} joined agent room: ${room}`);
  }

  leaveAgentRoom(socket: any, agentId: string, userId: string): void {
    const room = this.getAgentRoom(agentId, userId);
    socket.leave(room);
    console.log(`[SOCKET.IO] User ${userId} left agent room: ${room}`);
  }

  emitToAgentRoom(agentId: string, userId: string, event: keyof SessionSocketEvents, data: any) {
    const agentRoom = this.getAgentRoom(agentId, userId);
    this.io.to(agentRoom).emit(event, data);
  }

  getConnectionState(socketId: string): SocketConnectionState | undefined {
    return this.connections.get(socketId);
  }

  isUserConnected(userId: string): boolean {
    const userSockets = this.userSockets.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  // Enhanced event emission with error handling and retry logic
  async emitToUser<K extends keyof SessionSocketEvents>(
    userId: string,
    event: K,
    data: Parameters<SessionSocketEvents[K]>[0],
    options?: Partial<EventEmissionOptions>
  ): Promise<EventEmissionResult> {
    const userRoom = this.getUserRoom(userId);
    return this.emitToRoom(userRoom, event, data, { ...options });
  }

  // Legacy method for backward compatibility
  async emitToUserWithRetry(
    userId: string,
    event: keyof SessionSocketEvents,
    data: any,
    options: EventEmissionOptions = {}
  ): Promise<EventEmissionResult> {
    return this.emitToUser(userId, event, data, options);
  }

  private async emitToRoom<K extends keyof SessionSocketEvents>(
    room: string,
    event: K,
    data: Parameters<SessionSocketEvents[K]>[0],
    options: EventEmissionOptions
  ): Promise<EventEmissionResult> {
    // const startTime = Date.now();
    // const errors: Array<{ userId: string; error: string }> = [];
    let recipientCount = 0;

    try {
      // Get sockets in the room
      const sockets = await this.io.in(room).fetchSockets();
      recipientCount = sockets.length;

      if (recipientCount === 0) {
        // Queue the event if no recipients are currently connected
        console.log(
          `[SOCKET.IO] No recipients for ${String(event)} in room ${room}, considering queueing`
        );
      }

      // Emit to room with timeout
      const emissionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Emission timeout'));
        }, options.timeout || 5000);

        this.io.to(room).emit(event as any, data);
        clearTimeout(timeout);
        resolve();
      });

      await emissionPromise;

      console.log(
        `[SOCKET.IO] Emitted ${String(event)} to ${recipientCount} recipients in room ${room}`
      );

      return {
        success: true,
        eventType: event as string,
        recipientCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`[SOCKET.IO] Failed to emit ${String(event)} to room ${room}:`, error);

      // Retry logic
      const retryCount = options.retryCount || 0;
      if (retryCount < 3) {
        console.log(`[SOCKET.IO] Retrying emission (attempt ${retryCount + 1})`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.emitToRoom(room, event, data, { ...options, retryCount: retryCount + 1 });
      }

      return {
        success: false,
        eventType: event as string,
        recipientCount,
        errors: [
          { userId: 'room', error: error instanceof Error ? error.message : 'Unknown error' },
        ],
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Queue events for offline users
  queueEventForUser(userId: string, event: string, data: any) {
    if (!this.eventQueue.has(userId)) {
      this.eventQueue.set(userId, []);
    }

    const queue = this.eventQueue.get(userId)!;
    queue.push({
      event,
      data,
      timestamp: Date.now(),
    });

    // Limit queue size to prevent memory issues
    if (queue.length > 50) {
      queue.shift(); // Remove oldest event
    }
  }

  // Start health monitoring (backward compatibility)
  startHealthMonitoring() {
    // Health monitoring is already started in constructor
    console.log('[SOCKET.IO] Health monitoring already active');
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userSockets.size,
      connectedUsers: this.userSockets.size, // For backward compatibility
      contextRooms: this.userSockets.size, // Migration note: was expeditionRooms, now represents user context rooms
      queuedEvents: Array.from(this.eventQueue.values()).reduce(
        (sum, queue) => sum + queue.length,
        0
      ),
      averagePingTime: this.getAveragePingTime(),
      healthyConnections: this.getHealthyConnectionsCount(),
      isHealthy: !this.isShuttingDown,
    };
  }

  private getAveragePingTime(): number {
    const now = Date.now();
    const pingTimes = Array.from(this.connections.values())
      .map((conn) => now - (conn.lastPing || now))
      .filter((time) => time < 60000); // Only consider pings within last minute

    return pingTimes.length > 0
      ? pingTimes.reduce((sum, time) => sum + time, 0) / pingTimes.length
      : 0;
  }

  private getHealthyConnectionsCount(): number {
    const now = Date.now();
    return Array.from(this.connections.values()).filter(
      (conn) => conn.connected && now - (conn.lastPing || 0) < 60000
    ).length;
  }
}
