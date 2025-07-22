/**
 * Comprehensive Socket.IO Event Type Definitions
 *
 * This file defines all Socket.IO event types for real-time communication
 * across the expedition system, replacing generic 'any' types with proper
 * TypeScript interfaces for better type safety and development experience.
 */


// ============================================================================
// EXPEDITION EVENT TYPES
// ============================================================================

export interface ExpeditionCreatedEvent {
  expeditionId: string;
  expedition: {
    id: string;
    title: string;
    objective: string;
    status: 'draft' | 'planning' | 'in-progress' | 'paused' | 'review' | 'completed' | 'cancelled' | 'failed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    starshipId: string;
    createdBy: string;
    createdAt: string;
  };
  timestamp: string;
}

export interface ExpeditionUpdatedEvent {
  expeditionId: string;
  changes: {
    title?: string;
    objective?: string;
    status?: string;
    priority?: string;
    tags?: string[];
    estimatedDuration?: number;
  };
  updatedBy: string;
  timestamp: string;
}

export interface ExpeditionDeletedEvent {
  expeditionId: string;
  deletedBy: string;
  timestamp: string;
}

export interface ExpeditionStatusEvent {
  expeditionId: string;
  status: 'draft' | 'planning' | 'in-progress' | 'paused' | 'completed' | 'cancelled' | 'failed';
  previousStatus: string;
  changedBy: string;
  timestamp: string;
}

export interface ExpeditionProgressEvent {
  expeditionId: string;
  progress: {
    overall: number; // 0-100
    currentPhase: string;
    completedTasks: number;
    totalTasks: number;
    estimatedTimeRemaining?: number;
    lastActivity: string;
  };
  timestamp: string;
}

// ============================================================================
// TASK EVENT TYPES
// ============================================================================

export interface TaskAssignedEvent {
  expeditionId: string;
  taskId: string;
  task: {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'assigned' | 'in-progress' | 'completed' | 'failed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    assignedTo?: string;
    agentId?: string;
    estimatedEffort?: number;
  };
  assignedBy: string;
  timestamp: string;
}

export interface TaskCompletedEvent {
  expeditionId: string;
  taskId: string;
  task: {
    id: string;
    title: string;
    status: 'completed' | 'failed';
    result?: string;
    completedAt: string;
    completedBy?: string;
    agentId?: string;
  };
  timestamp: string;
}

export interface TaskProgressEvent {
  expeditionId: string;
  taskId: string;
  progress: {
    percentage: number; // 0-100
    currentStep?: string;
    estimatedTimeRemaining?: number;
    lastUpdate: string;
  };
  timestamp: string;
}

// ============================================================================
// MESSAGING EVENT TYPES
// ============================================================================

export interface ExpeditionMessageEvent {
  expeditionId: string;
  messageId: string;
  message: {
    id: string;
    role: 'user' | 'first-officer' | 'agent' | 'system';
    content: string;
    userId?: string;
    agentId?: string;
    threadId?: string;
    attachments?: Array<{
      id: string;
      name: string;
      type: string;
      url: string;
    }>;
  };
  timestamp: string;
}

export interface ChatTypingEvent {
  expeditionId: string;
  userId?: string;
  agentId?: string;
  role: 'user' | 'first-officer' | 'agent';
  isTyping: boolean;
  timestamp: string;
}

// ============================================================================
// AGENT ACTIVITY EVENT TYPES
// ============================================================================

export interface AgentActivityEvent {
  expeditionId: string;
  agentId: string;
  activity: {
    type: 'task_started' | 'task_progress' | 'task_completed' | 'message_sent' | 'analysis_complete' | 'error_occurred';
    description: string;
    taskId?: string;
    messageId?: string;
    data?: Record<string, any>;
  };
  timestamp: string;
}

export interface AgentStatusEvent {
  expeditionId: string;
  agentId: string;
  status: {
    state: 'idle' | 'working' | 'thinking' | 'error' | 'offline';
    currentTask?: string;
    workload: number; // 0-100
    lastActivity: string;
  };
  timestamp: string;
}

// ============================================================================
// QUALITY AND RESULTS EVENT TYPES
// ============================================================================

export interface QualityScoreUpdateEvent {
  expeditionId: string;
  resultId: string;
  qualityScore: {
    overall: number; // 0-100
    completeness: number;
    accuracy: number;
    relevance: number;
    clarity: number;
    assessedBy: string;
    assessedAt: string;
    notes?: string;
  };
  previousScore?: {
    overall: number;
    assessedBy: string;
    assessedAt: string;
  };
  timestamp: string;
}

export interface ResultAvailableEvent {
  expeditionId: string;
  resultId: string;
  result: {
    id: string;
    title: string;
    description?: string;
    resultType: 'final-report' | 'task-output' | 'analysis' | 'code' | 'document' | 'design' | 'data' | 'recommendation';
    format: 'text' | 'markdown' | 'json' | 'code' | 'html' | 'pdf' | 'image' | 'video' | 'audio' | 'archive';
    createdBy: string;
    createdAt: string;
    quality: {
      overall: number;
      completeness: number;
      accuracy: number;
      relevance: number;
      clarity: number;
    };
  };
  timestamp: string;
}

// ============================================================================
// PHASE AND WORKFLOW EVENT TYPES
// ============================================================================

export interface PhaseChangeEvent {
  expeditionId: string;
  phase: {
    current: string;
    previous?: string;
    description: string;
    estimatedDuration?: number;
    startedAt: string;
  };
  data?: {
    tasksInPhase?: number;
    completedTasks?: number;
    nextPhase?: string;
    milestones?: string[];
  };
  timestamp: string;
}

export interface MilestoneReachedEvent {
  expeditionId: string;
  milestone: {
    id: string;
    name: string;
    description: string;
    achievedAt: string;
    progress: number; // 0-100
  };
  timestamp: string;
}

// ============================================================================
// ERROR AND SYSTEM EVENT TYPES
// ============================================================================

export interface ExpeditionErrorEvent {
  expeditionId: string;
  error: {
    code: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: 'system' | 'agent' | 'user' | 'external';
    taskId?: string;
    agentId?: string;
    recoverable: boolean;
    retryCount?: number;
  };
  timestamp: string;
}

export interface SystemStatusEvent {
  expeditionId: string;
  status: {
    health: 'healthy' | 'degraded' | 'error';
    activeAgents: number;
    queuedTasks: number;
    systemLoad: number; // 0-100
    lastHealthCheck: string;
  };
  timestamp: string;
}

// ============================================================================
// CONNECTION AND ROOM EVENT TYPES
// ============================================================================

export interface RoomJoinedEvent {
  expeditionId: string;
  userId: string;
  userInfo: {
    id: string;
    name: string;
    role: 'owner' | 'collaborator' | 'viewer';
  };
  timestamp: string;
}

export interface RoomLeftEvent {
  expeditionId: string;
  userId: string;
  timestamp: string;
}

export interface ConnectionStatusEvent {
  status: 'connected' | 'disconnected' | 'reconnecting' | 'error';
  userId: string;
  connectionId: string;
  timestamp: string;
}

// Additional type for Socket.io v4.x compatibility
export type ConnectionStatus = ConnectionStatusEvent;

// ============================================================================
// UNIFIED SOCKET.IO EVENTS INTERFACE
// ============================================================================

/**
 * Unified Socket.IO Events Interface
 * This replaces both EnhancedSocketIOEvents and client-side ExpeditionSocketEvents
 * to ensure type consistency across client and server
 */
export interface SocketIOEvents {
  // Connection events
  'connection-status': (event: ConnectionStatusEvent) => void;
  'ping': () => void;
  'pong': () => void;

  // Expedition lifecycle events
  'expedition:created': (event: ExpeditionCreatedEvent) => void;
  'expedition:updated': (event: ExpeditionUpdatedEvent) => void;
  'expedition:deleted': (event: ExpeditionDeletedEvent) => void;
  'expedition:started': (event: ExpeditionStatusEvent) => void;
  'expedition:paused': (event: ExpeditionStatusEvent) => void;
  'expedition:resumed': (event: ExpeditionStatusEvent) => void;
  'expedition:cancelled': (event: ExpeditionStatusEvent) => void;
  'expedition:completed': (event: ExpeditionStatusEvent) => void;
  'expedition:failed': (event: ExpeditionStatusEvent) => void;
  'expedition:status-update': (event: ExpeditionProgressEvent) => void;
  'expedition:workflow-progress': (event: any) => void;

  // Task events
  'expedition:task-assigned': (event: TaskAssignedEvent) => void;
  'expedition:task-completed': (event: TaskCompletedEvent) => void;
  'expedition:task-progress': (event: TaskProgressEvent) => void;

  // Messaging events
  'expedition:message': (event: ExpeditionMessageEvent) => void;
  'expedition:typing-start': (event: ChatTypingEvent) => void;
  'expedition:typing-stop': (event: ChatTypingEvent) => void;

  // Agent activity events
  'expedition:agent-activity': (event: AgentActivityEvent) => void;
  'expedition:agent-assigned': (event: any) => void;
  'expedition:agent-status': (event: AgentStatusEvent) => void;

  // Quality and results events
  'expedition:quality-score-update': (event: QualityScoreUpdateEvent) => void;
  'expedition:result-available': (event: ResultAvailableEvent) => void;

  // Phase and workflow events
  'expedition:phase-change': (event: PhaseChangeEvent) => void;
  'expedition:milestone-reached': (event: MilestoneReachedEvent) => void;

  // Error and system events
  'expedition:error': (event: ExpeditionErrorEvent) => void;
  'expedition:system-status': (event: SystemStatusEvent) => void;

  // Room management events
  'expedition:room-joined': (event: RoomJoinedEvent) => void;
  'expedition:room-left': (event: RoomLeftEvent) => void;
  

  // Client to server events
  'expedition:join': (expeditionId: string) => void;
  'expedition:leave': (expeditionId: string) => void;
  'expedition:send-message': (data: { expeditionId: string; message: string }) => void;
  'expedition:start': (expeditionId: string) => void;
  'expedition:pause': (expeditionId: string) => void;
  'expedition:resume': (expeditionId: string) => void;
  'expedition:cancel': (expeditionId: string) => void;

  // Non-expedition events for backward compatibility
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

/**
 * Legacy alias for backward compatibility
 * @deprecated Use SocketIOEvents instead
 */
export interface EnhancedSocketIOEvents extends SocketIOEvents {}

/**
 * Client-compatible expedition socket events
 * This ensures the client can use the same types as the server
 */
export interface ExpeditionSocketEvents extends SocketIOEvents {}

// ============================================================================
// UTILITY TYPES
// ============================================================================

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