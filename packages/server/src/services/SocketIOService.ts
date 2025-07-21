import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import type { SocketIOEvents, SocketConnectionState } from '@starships/protocol';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { UserService } from './UserService';

// Enhanced event emission options
interface EventEmissionOptions {
  expeditionId?: string;
  excludeUser?: string;
  includeUsers?: string[];
  retryCount?: number;
  timeout?: number;
}

interface EventEmissionResult {
  success: boolean;
  eventType: string;
  recipientCount: number;
  errors?: Array<{
    userId: string;
    error: string;
  }>;
  timestamp: string;
}

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

export class SocketIOService {
  private static instance: SocketIOService;
  private io: SocketIOServer<SocketIOEvents>;
  private connections: Map<string, SocketConnectionState> = new Map();

  private constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupMiddleware();
    this.setupEventHandlers();
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
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const payload = await verifySocketJWT(token);
        
        // Look up user in database by Kinde ID (same as HTTP middleware)
        let user;
        try {
          user = await UserService.getUserByKindeId(payload.sub as string);
        } catch (dbError) {
          console.error(`[SOCKET.IO] Database error when looking up user: ${payload.sub}`, dbError);
          return next(new Error('Database error during authentication'));
        }

        if (!user) {
          console.log(`[SOCKET.IO] User not found in database for Kinde ID: ${payload.sub}, attempting auto-sync`);
          
          // Auto-sync user if they don't exist (same as HTTP middleware)
          try {
            user = await UserService.syncUser({
              kindeId: payload.sub as string,
              email: (payload.email as string) || `user-${payload.sub}@unknown.com`,
              name: (payload.given_name as string) || (payload.name as string),
              avatar: payload.picture as string,
            });
            console.log(`[SOCKET.IO] User auto-synced: ${user.id} (${user.displayName || user.username})`);
          } catch (syncError: any) {
            console.error(`[SOCKET.IO] Failed to auto-sync user for Kinde ID: ${payload.sub}`, syncError);
            return next(new Error('Failed to sync user'));
          }
        }

        // Use internal user ID (not Kinde ID) for consistency with HTTP routes
        socket.data.userId = user.id;
        socket.data.kindeId = payload.sub;
        socket.data.authenticated = true;
        
        console.log(`[SOCKET.IO] User ${user.id} (${user.displayName || user.username}) authenticated`);
        next();
      } catch (error) {
        console.error('[SOCKET.IO] Authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const userId = socket.data.userId;
      console.log(`[SOCKET.IO] User ${userId} connected: ${socket.id}`);

      // Initialize connection state
      this.connections.set(socket.id, {
        connected: true,
        authenticated: true,
        room_joined: false,
        user_id: userId,
        connection_id: socket.id,
        last_ping: Date.now()
      });

      // Auto-join user to their personal room
      const userRoom = `user:${userId}`;
      socket.join(userRoom);
      this.updateConnectionState(socket.id, { room_joined: true });

      // Send connection confirmation
      socket.emit('connection-status', 'connected');

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`[SOCKET.IO] User ${userId} disconnected: ${reason}`);
        this.connections.delete(socket.id);
      });

      // Handle ping/pong for connection health
      socket.on('ping' as any, () => {
        this.updateConnectionState(socket.id, { last_ping: Date.now() });
        socket.emit('pong' as any);
      });
    });
  }

  private updateConnectionState(socketId: string, updates: Partial<SocketConnectionState>) {
    const current = this.connections.get(socketId);
    if (current) {
      this.connections.set(socketId, { ...current, ...updates });
    }
  }

  // Public methods for other services
  getIO(): SocketIOServer<SocketIOEvents> {
    return this.io;
  }

  getUserRoom(userId: string): string {
    return `user:${userId}`;
  }

  // Agent-specific room management
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

  emitToAgentRoom(agentId: string, userId: string, event: keyof SocketIOEvents, data: any) {
    const agentRoom = this.getAgentRoom(agentId, userId);
    this.io.to(agentRoom).emit(event, data);
  }

  getConnectionState(socketId: string): SocketConnectionState | undefined {
    return this.connections.get(socketId);
  }

  isUserConnected(userId: string): boolean {
    return Array.from(this.connections.values()).some(
      conn => conn.user_id === userId && conn.connected
    );
  }

  emitToUser(userId: string, event: keyof SocketIOEvents, data: any) {
    const userRoom = this.getUserRoom(userId);
    this.io.to(userRoom).emit(event, data);
  }

  // Enhanced event emission with error handling and retry logic
  async emitToUserWithRetry(
    userId: string,
    event: keyof SocketIOEvents,
    data: any,
    options: EventEmissionOptions = {}
  ): Promise<EventEmissionResult> {
    const userRoom = this.getUserRoom(userId);
    return this.emitToRoomWithRetry(userRoom, event, data, options);
  }

  async emitToExpeditionRoomWithRetry(
    expeditionId: string,
    event: keyof SocketIOEvents,
    data: any,
    options: EventEmissionOptions = {}
  ): Promise<EventEmissionResult> {
    const expeditionRoom = `expedition:${expeditionId}`;
    return this.emitToRoomWithRetry(expeditionRoom, event, data, { ...options, expeditionId });
  }

  private async emitToRoomWithRetry(
    room: string,
    event: keyof SocketIOEvents,
    data: any,
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
        console.log(`[SOCKET.IO] No recipients for ${String(event)} in room ${room}`);
        return {
          success: true,
          eventType: String(event),
          recipientCount: 0,
          timestamp: new Date().toISOString()
        };
      }

      // Emit with timeout protection
      const emissionPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Emission timeout'));
        }, options.timeout || 5000);

        try {
          this.io.to(room).emit(event, data);
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      await emissionPromise;

      console.log(`[SOCKET.IO] Emitted ${String(event)} to ${recipientCount} recipients in room ${room}`);

      return {
        success: true,
        eventType: String(event),
        recipientCount,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error(`[SOCKET.IO] Failed to emit ${String(event)} to room ${room}:`, error);
      
      // Retry logic
      const retryCount = options.retryCount || 0;
      if (retryCount < 3) {
        console.log(`[SOCKET.IO] Retrying emission (attempt ${retryCount + 1})`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.emitToRoomWithRetry(room, event, data, { ...options, retryCount: retryCount + 1 });
      }

      return {
        success: false,
        eventType: String(event),
        recipientCount,
        errors: [{ userId: 'room', error: error instanceof Error ? error.message : 'Unknown error' }],
        timestamp: new Date().toISOString()
      };
    }
  }

  // Connection health monitoring
  private connectionHealthCheck() {
    const now = Date.now();
    const staleThreshold = 120000; // 2 minutes

    for (const [socketId, state] of this.connections.entries()) {
      if (now - (state.last_ping || 0) > staleThreshold) {
        console.warn(`[SOCKET.IO] Stale connection detected: ${socketId}`);
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }
    }
  }

  // Start health monitoring
  startHealthMonitoring() {
    setInterval(() => {
      this.connectionHealthCheck();
    }, 30000); // Check every 30 seconds
  }

  getConnectedUsersCount(): number {
    return this.connections.size;
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connections.size,
      connectedUsers: Array.from(this.connections.values()).map(conn => conn.user_id).filter((id, index, arr) => arr.indexOf(id) === index).length,
      averagePingTime: this.getAveragePingTime(),
      healthyConnections: this.getHealthyConnectionsCount()
    };
  }

  private getAveragePingTime(): number {
    const now = Date.now();
    const pingTimes = Array.from(this.connections.values())
      .map(conn => now - (conn.last_ping || now))
      .filter(time => time < 60000); // Only consider pings within last minute
    
    return pingTimes.length > 0 ? pingTimes.reduce((sum, time) => sum + time, 0) / pingTimes.length : 0;
  }

  private getHealthyConnectionsCount(): number {
    const now = Date.now();
    return Array.from(this.connections.values())
      .filter(conn => conn.connected && (now - (conn.last_ping || 0)) < 60000)
      .length;
  }
}