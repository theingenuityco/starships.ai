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

// Expedition-related events
export interface ExpeditionSocketEvents {
  // Expedition lifecycle events
  'expedition:created': (data: any) => void;
  'expedition:started': (data: any) => void;
  'expedition:status-changed': (data: any) => void;
  'expedition:completed': (data: any) => void;
  'expedition:failed': (data: any) => void;
  
  // Task events
  'task:created': (data: any) => void;
  'task:assigned': (data: any) => void;
  'task:completed': (data: any) => void;
  
  // Task review events
  'expedition:review-task': (data: { expeditionId: string; taskId: string; agentId: string; result: string }, callback?: (response: { success: boolean; reviewResult?: any; error?: string }) => void) => void;
  'expedition:task-reviewed': (data: { expeditionId: string; taskId: string; agentId: string; approved: boolean; feedback?: string; timestamp: string }) => void;
  
  // Message events
  'message:sent': (data: any) => void;
  
  // Agent events
  'agent:assigned': (data: any) => void;
  
  // Progress and activity events
  'expedition:progress': (data: any) => void;
  'expedition:agent-activity': (data: any) => void;
  'expedition:tool-usage': (data: any) => void;
  
  // Room management
  'expedition:join-room': (data: { expeditionId: string; userId: string }) => void;
  'expedition:leave-room': (data: { expeditionId: string; userId: string }) => void;
  'expedition:sync-required': (data: { expeditionId: string; reason: string; timestamp: string }) => void;
  
  // Message sending
  'expedition:send-message': (data: { expeditionId: string; content: string; messageType?: string; participantId?: string; timestamp: string }, callback?: (response: { success: boolean; error?: string }) => void) => void;
  
  // User presence events
  'expedition:user-joined': (data: { userId: string; expeditionId: string; timestamp: string }) => void;
  'expedition:user-left': (data: { userId: string; expeditionId: string; timestamp: string }) => void;
  
  // Status and typing events
  'expedition:request-status': (data: { expeditionId: string }) => void;
  'expedition:status-update': (data: { expeditionId: string; timestamp: string }) => void;
  'expedition:error': (data: { expeditionId: string; error: string; timestamp: string }) => void;
  'expedition:typing-start': (data: { expeditionId: string; userId?: string; agentId?: string }) => void;
  'expedition:typing-stop': (data: { expeditionId: string; userId?: string; agentId?: string }) => void;
  'expedition:user-typing': (data: { expeditionId: string; userId?: string; agentId?: string; isTyping: boolean; timestamp: string }) => void;
}

// Combined socket events interface
export interface SocketEvents extends BaseSocketEvents, ChatSocketEvents, ExpeditionSocketEvents {}

// Main SocketIO Events interface
export interface SocketIOEvents extends SocketEvents {}

// Legacy alias for backward compatibility
export interface EnhancedSocketIOEvents extends SocketIOEvents {}

// Type helpers for socket event data
export type SocketEventData<T extends keyof SocketEvents> = Parameters<SocketEvents[T]>[0];

// Additional type for Socket.io v4.x compatibility
export type ConnectionStatus = ConnectionStatusEvent;

// Utility types
export type SocketExpeditionEventType = keyof SocketIOEvents;

export interface EventEmissionOptions {
  expeditionId: string;
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