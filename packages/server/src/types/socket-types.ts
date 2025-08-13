/**
 * Extended Socket Event Types for Server Implementation
 * 
 * This file provides type extensions to handle the mismatch between
 * protocol-defined events and server implementation needs.
 */

export interface ExpeditionMessageData {
  expeditionId: string;
  content: string;
  messageType?: string;
  participantId?: string;
  timestamp: string;
  enableStreaming?: boolean;
}

export interface ExtendedSocketEvents {
  // Expedition events that need to be emitted from server
  'expedition:created': (data: any) => void;
  'expedition:started': (data: any) => void;
  'expedition:status-changed': (data: any) => void;
  'expedition:completed': (data: any) => void;
  'expedition:failed': (data: any) => void;
  'expedition:progress': (data: any) => void;
  'expedition:join-room': (data: any) => void;
  'expedition:leave-room': (data: any) => void;
  'expedition:user-joined': (data: any) => void;
  'expedition:user-left': (data: any) => void;
  'expedition:request-status': (data: any) => void;
  'expedition:status-update': (data: any) => void;
  'expedition:error': (data: any) => void;
  'expedition:typing-start': (data: any) => void;
  'expedition:typing-stop': (data: any) => void;
  'expedition:user-typing': (data: any) => void;
  'expedition:send-message': (data: ExpeditionMessageData, callback?: (response: any) => void) => void;

  // Message events
  'message:sent': (data: any) => void;

  // Mission events
  'mission:clarity-updated': (data: any) => void;
  'mission:phase-changed': (data: any) => void;
  'mission:status-changed': (data: any) => void;

  // Streaming events
  'expedition:stream-start': (data: any) => void;
  'expedition:stream-chunk': (data: any) => void;
  'expedition:stream-complete': (data: any) => void;
  'expedition:stream-error': (data: any) => void;

  // Task events
  'task:created': (data: any) => void;
  'task:assigned': (data: any) => void;
  'task:completed': (data: any) => void;
  'task:updated': (data: any) => void;

  // Agent events
  'agent:assigned': (data: any) => void;
  'expedition:agent-activity': (data: any) => void;

  // Workflow events
  'expedition:workflow-dsl-generated': (data: any) => void;
  'expedition:workflow-dsl-approved': (data: any) => void;
  'expedition:workflow-dsl-rejected': (data: any) => void;
  'expedition:workflow-dsl-modified': (data: any) => void;
  'expedition:workflow-execution-started': (data: any) => void;
  'expedition:workflow-node-executing': (data: any) => void;
  'expedition:workflow-node-completed': (data: any) => void;
  'expedition:workflow-conditional-evaluated': (data: any) => void;
  'expedition:workflow-user-prompt-required': (data: any) => void;
  'expedition:workflow-user-prompt-responded': (data: any) => void;
}

// Type helper to cast events properly
export function emitExpeditionEvent<K extends keyof ExtendedSocketEvents>(
  socket: any,
  event: K,
  data: Parameters<ExtendedSocketEvents[K]>[0]
) {
  socket.emit(event as any, data);
}