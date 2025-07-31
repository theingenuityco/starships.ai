// Socket.IO event types for real-time communication

// Base socket events
export interface BaseSocketEvents {
  connect: () => void;
  disconnect: () => void;
  error: (error: Error) => void;
}

// Connection and room event types
export interface ConnectionStatusEvent {
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  userId: string;
  connectionId: string;
  timestamp: string;
}

// Chat-related events (Sibil and Agent chat)
export interface ChatSocketEvents {
  // Connection events
  'connection-status': (event: ConnectionStatusEvent) => void;
  'ping': () => void;
  'pong': () => void;

  // Sibil Client to Server events
  'sibil:start-stream': (request: any) => void;
  'sibil:stop-stream': (streamId: string) => void;
  'sibil:join-room': (userId: string) => void;
  'sibil:leave-room': (userId: string) => void;

  // Sibil Server to Client events
  'sibil:stream-start': (streamId: string) => void;
  'sibil:stream-chunk': (chunk: any) => void;
  'sibil:stream-complete': (response: any) => void;
  'sibil:stream-error': (error: any) => void;
  'sibil:typing-start': () => void;
  'sibil:typing-stop': () => void;

  // Agent Chat Client to Server events
  'agent:start-stream': (request: any) => void;
  'agent:stop-stream': (streamId: string) => void;
  'agent:join-room': (userId: string, agentId: string) => void;
  'agent:leave-room': (userId: string, agentId: string) => void;

  // Agent Chat Server to Client events
  'agent:stream-start': (streamId: string, agentId: string) => void;
  'agent:stream-chunk': (chunk: any) => void;
  'agent:stream-complete': (response: any) => void;
  'agent:stream-error': (error: any) => void;
  'agent:typing-start': (agentId: string) => void;
  'agent:typing-stop': (agentId: string) => void;
}


// Combined socket events interface
export interface SocketEvents extends BaseSocketEvents, ChatSocketEvents {}

// Main SocketIO Events interface
export interface SocketIOEvents extends SocketEvents {}

// Legacy alias for backward compatibility
export interface EnhancedSocketIOEvents extends SocketIOEvents {}

// Type helpers for socket event data
export type SocketEventData<T extends keyof SocketEvents> = Parameters<SocketEvents[T]>[0];

// Additional type for Socket.io v4.x compatibility
export type ConnectionStatus = ConnectionStatusEvent;

// Utility types

export interface EventEmissionOptions {
  excludeUser?: string;
  includeUsers?: string[];
  retryCount?: number;
  timeout?: number;
}

export interface EventEmissionResult {
  success: boolean;
  eventType: string;
  recipientCount: number;
  errors?: Array<{
    userId: string;
    error: string;
  }>;
  timestamp: string;
}