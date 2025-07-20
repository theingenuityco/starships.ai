"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketIOService = void 0;
const socket_io_1 = require("socket.io");
const jose_1 = require("jose");
// Kinde JWKS endpoint for token verification
const kindeIssuerUrl = process.env.KINDE_ISSUER_URL || 'https://starships.kinde.com';
const JWKS = (0, jose_1.createRemoteJWKSet)(new URL(`${kindeIssuerUrl}/.well-known/jwks`));
// JWT verification function for Socket.IO
async function verifySocketJWT(token) {
    const { payload } = await (0, jose_1.jwtVerify)(token, JWKS, {
        issuer: kindeIssuerUrl,
    });
    return payload;
}
class SocketIOService {
    constructor(httpServer) {
        this.connections = new Map();
        this.io = new socket_io_1.Server(httpServer, {
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
    static initialize(httpServer) {
        if (!SocketIOService.instance) {
            SocketIOService.instance = new SocketIOService(httpServer);
        }
        return SocketIOService.instance;
    }
    static getInstance() {
        if (!SocketIOService.instance) {
            throw new Error('SocketIOService not initialized');
        }
        return SocketIOService.instance;
    }
    setupMiddleware() {
        // Authentication middleware
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const payload = await verifySocketJWT(token);
                socket.data.userId = payload.sub;
                socket.data.authenticated = true;
                console.log(`[SOCKET.IO] User ${payload.sub} authenticated`);
                next();
            }
            catch (error) {
                console.error('[SOCKET.IO] Authentication failed:', error);
                next(new Error('Authentication failed'));
            }
        });
    }
    setupEventHandlers() {
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
            socket.on('ping', () => {
                this.updateConnectionState(socket.id, { last_ping: Date.now() });
                socket.emit('pong');
            });
        });
    }
    updateConnectionState(socketId, updates) {
        const current = this.connections.get(socketId);
        if (current) {
            this.connections.set(socketId, { ...current, ...updates });
        }
    }
    // Public methods for other services
    getIO() {
        return this.io;
    }
    getUserRoom(userId) {
        return `user:${userId}`;
    }
    // Agent-specific room management
    getAgentRoom(agentId, userId) {
        return `agent:${agentId}:${userId}`;
    }
    joinAgentRoom(socket, agentId, userId) {
        const room = this.getAgentRoom(agentId, userId);
        socket.join(room);
        console.log(`[SOCKET.IO] User ${userId} joined agent room: ${room}`);
    }
    leaveAgentRoom(socket, agentId, userId) {
        const room = this.getAgentRoom(agentId, userId);
        socket.leave(room);
        console.log(`[SOCKET.IO] User ${userId} left agent room: ${room}`);
    }
    emitToAgentRoom(agentId, userId, event, data) {
        const agentRoom = this.getAgentRoom(agentId, userId);
        this.io.to(agentRoom).emit(event, data);
    }
    getConnectionState(socketId) {
        return this.connections.get(socketId);
    }
    isUserConnected(userId) {
        return Array.from(this.connections.values()).some(conn => conn.user_id === userId && conn.connected);
    }
    emitToUser(userId, event, data) {
        const userRoom = this.getUserRoom(userId);
        this.io.to(userRoom).emit(event, data);
    }
    getConnectedUsersCount() {
        return this.connections.size;
    }
}
exports.SocketIOService = SocketIOService;
