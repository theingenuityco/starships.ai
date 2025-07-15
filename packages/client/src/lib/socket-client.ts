import { io, Socket } from 'socket.io-client';
import type { SocketIOEvents, ConnectionStatus, SocketConnectionState } from '@starships/protocol';

class SocketClient {
  private static instance: SocketClient;
  private socket: Socket<SocketIOEvents> | null = null;
  private connectionState: SocketConnectionState = {
    connected: false,
    authenticated: false,
    room_joined: false
  };
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private constructor() {}

  static getInstance(): SocketClient {
    if (!SocketClient.instance) {
      SocketClient.instance = new SocketClient();
    }
    return SocketClient.instance;
  }

  async connect(token: string, userId: string): Promise<void> {
    if (this.socket?.connected) {
      console.log('[SOCKET CLIENT] Already connected');
      return;
    }

    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
    
    this.socket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
    });

    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Socket not initialized'));

      this.socket.on('connect', () => {
        console.log('[SOCKET CLIENT] Connected:', this.socket!.id);
        this.connectionState = {
          connected: true,
          authenticated: true,
          room_joined: true,
          user_id: userId,
          connection_id: this.socket!.id,
          last_ping: Date.now()
        };
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[SOCKET CLIENT] Connection error:', error);
        this.connectionState.connected = false;
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[SOCKET CLIENT] Disconnected:', reason);
        this.connectionState.connected = false;
        
        if (reason === 'io server disconnect') {
          this.handleReconnection();
        }
      });

      this.socket.on('connection-status', (status: ConnectionStatus) => {
        console.log('[SOCKET CLIENT] Status update:', status);
        this.connectionState.connected = status === 'connected';
      });

      setInterval(() => {
        if (this.socket?.connected) {
          // Use socket.io's built-in ping mechanism
          this.connectionState.last_ping = Date.now();
        }
      }, 30000);
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SOCKET CLIENT] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[SOCKET CLIENT] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    }, delay);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connectionState = {
        connected: false,
        authenticated: false,
        room_joined: false
      };
    }
  }

  getSocket(): Socket<SocketIOEvents> | null {
    return this.socket;
  }

  getConnectionState(): SocketConnectionState {
    return { ...this.connectionState };
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Agent-specific room management
  joinAgentRoom(agentId: string, userId: string) {
    if (this.socket?.connected) {
      this.socket.emit('agent:join-room', userId, agentId);
      console.log(`[SOCKET CLIENT] Joining agent room: agent:${agentId}:${userId}`);
    } else {
      console.warn('[SOCKET CLIENT] Cannot join agent room - not connected');
    }
  }

  leaveAgentRoom(agentId: string, userId: string) {
    if (this.socket?.connected) {
      this.socket.emit('agent:leave-room', userId, agentId);
      console.log(`[SOCKET CLIENT] Leaving agent room: agent:${agentId}:${userId}`);
    } else {
      console.warn('[SOCKET CLIENT] Cannot leave agent room - not connected');
    }
  }

  on(event: string, listener: (...args: any[]) => void) {
    this.socket?.on(event as any, listener);
  }

  off(event: string, listener?: (...args: any[]) => void) {
    this.socket?.off(event as any, listener);
  }

  emit(event: string, ...args: any[]) {
    this.socket?.emit(event as any, ...args);
  }
}

export default SocketClient;