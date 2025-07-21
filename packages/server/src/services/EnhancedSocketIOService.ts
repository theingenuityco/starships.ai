import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type {
  SocketConnectionState,
  EnhancedSocketIOEvents,
  EventEmissionOptions,
  EventEmissionResult,
  SocketExpeditionEventType
} from '@starships/protocol';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from './UserService';

// Kinde JWKS endpoint for token verification
const kindeIssuerUrl = process.env.KINDE_ISSUER_URL || 'https://starships.kinde.com';
const JWKS = createRemoteJWKSet(new URL(`${kindeIssuerUrl}/.well-known/jwks`));

// JWT verification function for Socket.IO
async function verifySocketJWT(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: kindeIssuerUrl,
  });
  return payload;
}

/**
 * Enhanced Socket.IO Service with improved timing, error handling, and real-time capabilities
 */
export class EnhancedSocketIOService {
  private static instance: EnhancedSocketIOService;
  private io: SocketIOServer<EnhancedSocketIOEvents>;
  private connections: Map<string, SocketConnectionState> = new Map();
  private expeditionRooms: Map<string, Set<string>> = new Map(); // expeditionId -> Set<socketId>
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>
  private reconnectionAttempts: Map<string, number> = new Map();
  private eventQueue: Map<string, Array<{ event: string; data: any; timestamp: number }>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private isShuttingDown = false;

  private constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      connectTimeout: 45000,
      // Enhanced configuration for better reliability
      allowEIO3: true,
      maxHttpBufferSize: 1e6, // 1MB
      httpCompression: true,
      perMessageDeflate: true
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startHealthCheck();
    this.setupGracefulShutdown();
  }

  static initialize(httpServer: HTTPServer): EnhancedSocketIOService {
    if (!EnhancedSocketIOService.instance) {
      EnhancedSocketIOService.instance = new EnhancedSocketIOService(httpServer);
    }
    return EnhancedSocketIOService.instance;
  }

  static getInstance(): EnhancedSocketIOService {
    if (!EnhancedSocketIOService.instance) {
      throw new Error('EnhancedSocketIOService not initialized');
    }
    return EnhancedSocketIOService.instance;
  }

  private setupMiddleware() {
    // Rate limiting middleware
    this.io.use((socket, next) => {
      const userId = socket.handshake.auth.userId;
      const now = Date.now();
      const windowMs = 60000; // 1 minute
      const maxConnections = 5;

      if (userId) {
        const userConnections = this.userSockets.get(userId) || new Set();
        if (userConnections.size >= maxConnections) {
          return next(new Error('Too many connections for this user'));
        }
      }

      next();
    });

    // Authentication middleware with enhanced error handling
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = await verifySocketJWT(token);
        
        // Look up user in database by Kinde ID
        let user;
        try {
          user = await UserService.getUserByKindeId(payload.sub as string);
        } catch (dbError) {
          console.error(`[ENHANCED-SOCKET.IO] Database error when looking up user: ${payload.sub}`, dbError);
          return next(new Error('Database error during authentication'));
        }

        if (!user) {
          console.log(`[ENHANCED-SOCKET.IO] User not found in database for Kinde ID: ${payload.sub}, attempting auto-sync`);
          
          // Auto-sync user if they don't exist
          try {
            user = await UserService.syncUser({
              kindeId: payload.sub as string,
              email: (payload.email as string) || `user-${payload.sub}@unknown.com`,
              name: (payload.given_name as string) || (payload.name as string),
              avatar: payload.picture as string,
            });
            console.log(`[ENHANCED-SOCKET.IO] User auto-synced: ${user.id} (${user.displayName || user.username})`);
          } catch (syncError: any) {
            console.error(`[ENHANCED-SOCKET.IO] Failed to auto-sync user for Kinde ID: ${payload.sub}`, syncError);
            return next(new Error('Failed to sync user'));
          }
        }

        // Use internal user ID for consistency
        socket.data.userId = user.id;
        socket.data.kindeId = payload.sub;
        socket.data.authenticated = true;
        socket.data.connectedAt = Date.now();
        
        console.log(`[ENHANCED-SOCKET.IO] User ${user.id} (${user.displayName || user.username}) authenticated`);
        next();
      } catch (error) {
        console.error('[ENHANCED-SOCKET.IO] Authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      const socketId = socket.id;
      
      console.log(`[ENHANCED-SOCKET.IO] User ${userId} connected: ${socketId}`);

      // Initialize connection state
      this.connections.set(socketId, {
        connected: true,
        authenticated: true,
        room_joined: false,
        user_id: userId,
        connection_id: socketId,
        last_ping: Date.now()
      });

      // Track user sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(socketId);

      // Auto-join user to their personal room
      const userRoom = this.getUserRoom(userId);
      socket.join(userRoom);
      this.updateConnectionState(socketId, { room_joined: true });

      // Process any queued events for this user
      this.processQueuedEvents(userId, socketId);

      // Send connection confirmation
      socket.emit('connection-status', {
        status: 'connected',
        userId,
        connectionId: socketId,
        timestamp: new Date().toISOString()
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        this.updateConnectionState(socketId, { last_ping: Date.now() });
        socket.emit('pong');
      });

      // Handle expedition room management
      this.setupExpeditionHandlers(socket);

      // Handle disconnection with cleanup
      socket.on('disconnect', (reason) => {
        console.log(`[ENHANCED-SOCKET.IO] User ${userId} disconnected: ${reason}`);
        this.handleDisconnection(socketId, userId, reason);
      });

      // Handle connection errors
      socket.on('error', (error) => {
        console.error(`[ENHANCED-SOCKET.IO] Socket error for user ${userId}:`, error);
        this.handleSocketError(socketId, userId, error);
      });
    });
  }

  private setupExpeditionHandlers(socket: any) {
    const userId = socket.data.userId;

    // Join expedition room
    socket.on('expedition:join', (expeditionId: string) => {
      try {
        const expeditionRoom = this.getExpeditionRoom(expeditionId);
        socket.join(expeditionRoom);
        
        // Track expedition room membership
        if (!this.expeditionRooms.has(expeditionId)) {
          this.expeditionRooms.set(expeditionId, new Set());
        }
        this.expeditionRooms.get(expeditionId)!.add(socket.id);

        console.log(`[ENHANCED-SOCKET.IO] User ${userId} joined expedition room: ${expeditionId}`);
        
        // Emit room joined event
        this.emitToExpeditionRoom(expeditionId, 'expedition:room-joined', {
          expeditionId,
          userId,
          userInfo: {
            id: userId,
            name: 'User', // TODO: Get actual user name
            role: 'owner' // TODO: Determine actual role
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`[ENHANCED-SOCKET.IO] Failed to join expedition room ${expeditionId}:`, error);
        socket.emit('expedition:error', {
          expeditionId,
          error: {
            code: 'ROOM_JOIN_FAILED',
            message: 'Failed to join expedition room',
            severity: 'medium',
            source: 'system',
            recoverable: true,
            retryCount: 0
          },
          timestamp: new Date().toISOString()
        });
      }
    });

    // Leave expedition room
    socket.on('expedition:leave', (expeditionId: string) => {
      try {
        const expeditionRoom = this.getExpeditionRoom(expeditionId);
        socket.leave(expeditionRoom);
        
        // Remove from expedition room tracking
        const roomMembers = this.expeditionRooms.get(expeditionId);
        if (roomMembers) {
          roomMembers.delete(socket.id);
          if (roomMembers.size === 0) {
            this.expeditionRooms.delete(expeditionId);
          }
        }

        console.log(`[ENHANCED-SOCKET.IO] User ${userId} left expedition room: ${expeditionId}`);
        
        // Emit room left event
        this.emitToExpeditionRoom(expeditionId, 'expedition:room-left', {
          expeditionId,
          userId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(`[ENHANCED-SOCKET.IO] Failed to leave expedition room ${expeditionId}:`, error);
      }
    });
  }

  private handleDisconnection(socketId: string, userId: string, reason: string) {
    // Clean up connection state
    this.connections.delete(socketId);
    
    // Remove from user sockets tracking
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }

    // Clean up expedition room memberships
    for (const [expeditionId, members] of this.expeditionRooms.entries()) {
      if (members.has(socketId)) {
        members.delete(socketId);
        if (members.size === 0) {
          this.expeditionRooms.delete(expeditionId);
        }
      }
    }

    // Reset reconnection attempts if clean disconnect
    if (reason === 'client namespace disconnect' || reason === 'server namespace disconnect') {
      this.reconnectionAttempts.delete(userId);
    }
  }

  private handleSocketError(socketId: string, userId: string, error: any) {
    const attempts = this.reconnectionAttempts.get(userId) || 0;
    this.reconnectionAttempts.set(userId, attempts + 1);

    // If too many errors, temporarily block the user
    if (attempts > 5) {
      console.warn(`[ENHANCED-SOCKET.IO] Too many errors for user ${userId}, temporarily blocking`);
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }
  }

  private processQueuedEvents(userId: string, socketId: string) {
    const queuedEvents = this.eventQueue.get(userId);
    if (queuedEvents && queuedEvents.length > 0) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        console.log(`[ENHANCED-SOCKET.IO] Processing ${queuedEvents.length} queued events for user ${userId}`);
        
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
      for (const [socketId, state] of this.connections.entries()) {
        if (now - (state.last_ping || 0) > staleThreshold) {
          console.warn(`[ENHANCED-SOCKET.IO] Stale connection detected: ${socketId}`);
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.disconnect(true);
          }
        }
      }

      // Clean up old queued events (older than 5 minutes)
      const eventThreshold = 300000; // 5 minutes
      for (const [userId, events] of this.eventQueue.entries()) {
        const filteredEvents = events.filter(event => now - event.timestamp < eventThreshold);
        if (filteredEvents.length !== events.length) {
          if (filteredEvents.length === 0) {
            this.eventQueue.delete(userId);
          } else {
            this.eventQueue.set(userId, filteredEvents);
          }
        }
      }
    }, 30000); // Run every 30 seconds
  }

  private setupGracefulShutdown() {
    const shutdown = () => {
      console.log('[ENHANCED-SOCKET.IO] Graceful shutdown initiated...');
      this.isShuttingDown = true;
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      // Notify all connected clients
      this.io.emit('connection-status', {
        status: 'disconnected',
        userId: 'system',
        connectionId: 'system',
        timestamp: new Date().toISOString()
      });

      // Close all connections
      this.io.close(() => {
        console.log('[ENHANCED-SOCKET.IO] All connections closed');
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
  getIO(): SocketIOServer<EnhancedSocketIOEvents> {
    return this.io;
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  getExpeditionRoom(expeditionId: string): string {
    return `expedition:${expeditionId}`;
  }

  isUserConnected(userId: string): boolean {
    const userSockets = this.userSockets.get(userId);
    return userSockets ? userSockets.size > 0 : false;
  }

  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }

  getExpeditionMembersCount(expeditionId: string): number {
    const members = this.expeditionRooms.get(expeditionId);
    return members ? members.size : 0;
  }

  // Enhanced event emission with error handling and retry logic
  async emitToUser<K extends keyof EnhancedSocketIOEvents>(
    userId: string, 
    event: K, 
    data: Parameters<EnhancedSocketIOEvents[K]>[0],
    options?: Partial<EventEmissionOptions>
  ): Promise<EventEmissionResult> {
    const userRoom = this.getUserRoom(userId);
    return this.emitToRoom(userRoom, event, data, { ...options, expeditionId: options?.expeditionId || 'user-room' });
  }

  async emitToExpeditionRoom<K extends keyof EnhancedSocketIOEvents>(
    expeditionId: string,
    event: K,
    data: Parameters<EnhancedSocketIOEvents[K]>[0],
    options?: Partial<EventEmissionOptions>
  ): Promise<EventEmissionResult> {
    const expeditionRoom = this.getExpeditionRoom(expeditionId);
    return this.emitToRoom(expeditionRoom, event, data, { ...options, expeditionId });
  }

  private async emitToRoom<K extends keyof EnhancedSocketIOEvents>(
    room: string,
    event: K,
    data: Parameters<EnhancedSocketIOEvents[K]>[0],
    options: EventEmissionOptions
  ): Promise<EventEmissionResult> {
    const startTime = Date.now();
    const errors: Array<{ userId: string; error: string }> = [];
    let recipientCount = 0;

    try {
      // Get sockets in the room
      const sockets = await this.io.in(room).fetchSockets();
      recipientCount = sockets.length;

      if (recipientCount === 0) {
        // Queue the event if no recipients are currently connected
        const expeditionId = options.expeditionId;
        if (expeditionId && expeditionId !== 'user-room') {
          // For expedition events, we might want to queue for offline users
          console.log(`[ENHANCED-SOCKET.IO] No recipients for ${String(event)} in room ${room}, considering queueing`);
        }
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

      console.log(`[ENHANCED-SOCKET.IO] Emitted ${String(event)} to ${recipientCount} recipients in room ${room}`);

      return {
        success: true,
        eventType: event as string,
        recipientCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[ENHANCED-SOCKET.IO] Failed to emit ${String(event)} to room ${room}:`, error);
      
      // Retry logic
      const retryCount = options.retryCount || 0;
      if (retryCount < 3) {
        console.log(`[ENHANCED-SOCKET.IO] Retrying emission (attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.emitToRoom(room, event, data, { ...options, retryCount: retryCount + 1 });
      }

      return {
        success: false,
        eventType: event as string,
        recipientCount,
        errors: [{ userId: 'room', error: error instanceof Error ? error.message : 'Unknown error' }],
        timestamp: new Date().toISOString()
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
      timestamp: Date.now()
    });

    // Limit queue size to prevent memory issues
    if (queue.length > 50) {
      queue.shift(); // Remove oldest event
    }
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      totalUsers: this.userSockets.size,
      expeditionRooms: this.expeditionRooms.size,
      queuedEvents: Array.from(this.eventQueue.values()).reduce((sum, queue) => sum + queue.length, 0),
      isHealthy: !this.isShuttingDown
    };
  }
}