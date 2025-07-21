import { useEffect, useCallback, useState, useRef } from 'react';
import { useSocketConnection } from './useSocketConnection';
import SocketClient from '@/lib/socket-client';
import type {
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionStatus,
  TaskStatus,
  MessageRole,
  QualityScore,
  SocketIOEvents
} from '@starships/protocol';

// ============================================================================
// LOCAL SOCKET EVENT TYPE DEFINITIONS
// ============================================================================
// These types are based on the socket-events.ts file but defined locally
// until the protocol package exports are properly configured

export interface ExpeditionCreatedEvent {
  expeditionId: string;
  expedition: {
    id: string;
    title: string;
    objective: string;
    status: ExpeditionStatus;
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
  status: ExpeditionStatus;
  previousStatus: string;
  changedBy: string;
  timestamp: string;
}

export interface ExpeditionProgressEvent {
  expeditionId: string;
  progress: {
    overall: number;
    currentPhase: string;
    completedTasks: number;
    totalTasks: number;
    estimatedTimeRemaining?: number;
    lastActivity: string;
  };
  timestamp: string;
}

export interface TaskAssignedEvent {
  expeditionId: string;
  taskId: string;
  task: {
    id: string;
    title: string;
    description: string;
    status: TaskStatus;
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
    percentage: number;
    currentStep?: string;
    estimatedTimeRemaining?: number;
    lastUpdate: string;
  };
  timestamp: string;
}

export interface ExpeditionMessageEvent {
  expeditionId: string;
  messageId: string;
  message: {
    id: string;
    role: MessageRole;
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
    workload: number;
    lastActivity: string;
  };
  timestamp: string;
}

export interface QualityScoreUpdateEvent {
  expeditionId: string;
  resultId: string;
  qualityScore: QualityScore;
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
    resultType: 'analysis' | 'report' | 'data' | 'code' | 'document' | 'artifact';
    format: 'text' | 'markdown' | 'json' | 'csv' | 'pdf' | 'image' | 'other';
    createdBy: string;
    createdAt: string;
    quality: QualityScore;
  };
  timestamp: string;
}

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
    progress: number;
  };
  timestamp: string;
}

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
    systemLoad: number;
    lastHealthCheck: string;
  };
  timestamp: string;
}

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

// ============================================================================
// ENHANCED TYPES AND INTERFACES
// ============================================================================

/**
 * Connection states for the expedition socket
 */
export type ExpeditionSocketConnectionState = 
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

/**
 * Real-time event callback types with proper typing
 */
export interface ExpeditionSocketCallbacks {
  // Expedition lifecycle events
  onExpeditionCreated?: (event: ExpeditionCreatedEvent) => void;
  onExpeditionUpdated?: (event: ExpeditionUpdatedEvent) => void;
  onExpeditionDeleted?: (event: ExpeditionDeletedEvent) => void;
  onExpeditionStarted?: (event: ExpeditionStatusEvent) => void;
  onExpeditionPaused?: (event: ExpeditionStatusEvent) => void;
  onExpeditionResumed?: (event: ExpeditionStatusEvent) => void;
  onExpeditionCancelled?: (event: ExpeditionStatusEvent) => void;
  onExpeditionCompleted?: (event: ExpeditionStatusEvent) => void;
  onStatusUpdate?: (event: ExpeditionProgressEvent) => void;

  // Task management events
  onTaskAssigned?: (event: TaskAssignedEvent) => void;
  onTaskCompleted?: (event: TaskCompletedEvent) => void;
  onTaskProgress?: (event: TaskProgressEvent) => void;

  // Real-time messaging events
  onMessage?: (event: ExpeditionMessageEvent) => void;
  onTypingStart?: (event: ChatTypingEvent) => void;
  onTypingStop?: (event: ChatTypingEvent) => void;

  // Agent activity events
  onAgentActivity?: (event: AgentActivityEvent) => void;
  onAgentStatus?: (event: AgentStatusEvent) => void;

  // Quality and results events
  onQualityScoreUpdate?: (event: QualityScoreUpdateEvent) => void;
  onResultAvailable?: (event: ResultAvailableEvent) => void;

  // Phase and workflow events
  onPhaseChange?: (event: PhaseChangeEvent) => void;
  onMilestoneReached?: (event: MilestoneReachedEvent) => void;

  // System and error events
  onExpeditionError?: (event: ExpeditionErrorEvent) => void;
  onSystemStatus?: (event: SystemStatusEvent) => void;

  // Room management events
  onRoomJoined?: (event: RoomJoinedEvent) => void;
  onRoomLeft?: (event: RoomLeftEvent) => void;

  // Connection events
  onConnectionStateChange?: (state: ExpeditionSocketConnectionState) => void;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
}

/**
 * Enhanced props for the useExpeditionSocket hook
 */
export interface UseExpeditionSocketProps extends ExpeditionSocketCallbacks {
  expeditionId?: string;
  autoJoin?: boolean;
  enableReconnection?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  enableTypingIndicators?: boolean;
  enableAgentTracking?: boolean;
  enableQualityTracking?: boolean;
  enableSystemMonitoring?: boolean;
  debugMode?: boolean;
}

/**
 * Real-time data state
 */
export interface ExpeditionRealtimeData {
  // Current expedition state
  currentStatus?: ExpeditionStatusEvent;
  currentProgress?: ExpeditionProgressEvent;
  currentPhase?: PhaseChangeEvent;
  
  // Active participants
  activeUsers: RoomJoinedEvent[];
  typingUsers: ChatTypingEvent[];
  
  // Agent states
  agentStatuses: Record<string, AgentStatusEvent>;
  agentActivities: AgentActivityEvent[];
  
  // Recent events
  recentMessages: ExpeditionMessageEvent[];
  recentTasks: (TaskAssignedEvent | TaskCompletedEvent)[];
  recentResults: ResultAvailableEvent[];
  
  // System state
  systemStatus?: SystemStatusEvent;
  lastError?: ExpeditionErrorEvent;
  
  // Connection metrics
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  lastPing?: number;
  eventCount: number;
}

/**
 * Enhanced return interface with comprehensive functionality
 */
export interface UseExpeditionSocketReturn {
  // Connection state
  isConnected: boolean;
  connectionState: ExpeditionSocketConnectionState;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  
  // Real-time data
  realtimeData: ExpeditionRealtimeData;
  
  // Room management
  joinExpedition: (expeditionId: string) => Promise<boolean>;
  leaveExpedition: (expeditionId: string) => Promise<boolean>;
  isInRoom: (expeditionId: string) => boolean;
  
  // Messaging actions
  sendMessage: (expeditionId: string, message: string, messageType?: string) => Promise<boolean>;
  startTyping: (expeditionId: string) => void;
  stopTyping: (expeditionId: string) => void;
  
  // Expedition control actions
  startExpedition: (expeditionId: string) => Promise<boolean>;
  pauseExpedition: (expeditionId: string) => Promise<boolean>;
  resumeExpedition: (expeditionId: string) => Promise<boolean>;
  cancelExpedition: (expeditionId: string) => Promise<boolean>;
  
  // Event subscription management
  subscribeToEvents: (callbacks: Partial<ExpeditionSocketCallbacks>) => () => void;
  unsubscribeFromEvents: () => void;
  
  // Connection management
  reconnect: () => Promise<boolean>;
  disconnect: () => void;
  
  // Utility functions
  clearRealtimeData: () => void;
  getConnectionMetrics: () => {
    isConnected: boolean;
    connectionState: ExpeditionSocketConnectionState;
    lastPing?: number;
    eventCount: number;
    uptime: number;
  };
  
  // Error state
  error: string | null;
  lastError?: ExpeditionErrorEvent;
  
  // Loading states
  isJoining: boolean;
  isLeaving: boolean;
  isSending: boolean;
}

// ============================================================================
// ENHANCED EXPEDITION SOCKET HOOK IMPLEMENTATION
// ============================================================================

export function useExpeditionSocket(props: UseExpeditionSocketProps = {}): UseExpeditionSocketReturn {
  const {
    expeditionId,
    autoJoin = true,
    enableReconnection = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    enableTypingIndicators = true,
    enableAgentTracking = true,
    enableQualityTracking = true,
    enableSystemMonitoring = true,
    debugMode = false,
    // Callback props
    onExpeditionCreated,
    onExpeditionUpdated,
    onExpeditionDeleted,
    onExpeditionStarted,
    onExpeditionPaused,
    onExpeditionResumed,
    onExpeditionCancelled,
    onExpeditionCompleted,
    onStatusUpdate,
    onTaskAssigned,
    onTaskCompleted,
    onTaskProgress,
    onMessage,
    onTypingStart,
    onTypingStop,
    onAgentActivity,
    onAgentStatus,
    onQualityScoreUpdate,
    onResultAvailable,
    onPhaseChange,
    onMilestoneReached,
    onExpeditionError,
    onSystemStatus,
    onRoomJoined,
    onRoomLeft,
    onConnectionStateChange,
    onReconnectAttempt
  } = props;

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  const { isConnected: socketConnected, connectionState: socketConnectionState } = useSocketConnection();
  const socketClient = SocketClient.getInstance();
  
  // Connection state
  const [connectionState, setConnectionState] = useState<ExpeditionSocketConnectionState>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [lastError, setLastError] = useState<ExpeditionErrorEvent | undefined>();
  
  // Loading states
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Room management
  const [joinedRooms, setJoinedRooms] = useState<Set<string>>(new Set());
  
  // Real-time data state
  const [realtimeData, setRealtimeData] = useState<ExpeditionRealtimeData>({
    activeUsers: [],
    typingUsers: [],
    agentStatuses: {},
    agentActivities: [],
    recentMessages: [],
    recentTasks: [],
    recentResults: [],
    connectionQuality: 'disconnected',
    eventCount: 0
  });

  // Connection metrics
  const connectionStartTime = useRef<number>(Date.now());
  const eventCountRef = useRef<number>(0);
  const lastPingRef = useRef<number | undefined>(undefined);
  
  // Event subscription management
  const eventSubscriptions = useRef<Map<string, (...args: any[]) => void>>(new Map());
  const additionalCallbacks = useRef<Partial<ExpeditionSocketCallbacks>>({});

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  // Update connection state based on socket connection
  useEffect(() => {
    if (socketConnected) {
      setConnectionState('connected');
      setError(null);
      updateRealtimeData({ connectionQuality: 'excellent' });
    } else {
      setConnectionState('disconnected');
      updateRealtimeData({ connectionQuality: 'disconnected' });
    }
    
    onConnectionStateChange?.(socketConnected ? 'connected' : 'disconnected');
  }, [socketConnected, onConnectionStateChange]);

  // Helper function to update realtime data
  const updateRealtimeData = useCallback((updates: Partial<ExpeditionRealtimeData>) => {
    setRealtimeData(prev => ({ ...prev, ...updates }));
  }, []);

  // Helper function to log debug messages
  const debugLog = useCallback((message: string, data?: any) => {
    if (debugMode) {
      console.log(`[EXPEDITION SOCKET] ${message}`, data || '');
    }
  }, [debugMode]);

  // ============================================================================
  // ROOM MANAGEMENT FUNCTIONS
  // ============================================================================

  const joinExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      debugLog('Cannot join expedition - not connected');
      setError('Not connected to server');
      return false;
    }

    if (joinedRooms.has(expeditionId)) {
      debugLog(`Already joined expedition: ${expeditionId}`);
      return true;
    }

    try {
      setIsJoining(true);
      setError(null);
      
      debugLog(`Joining expedition: ${expeditionId}`);
      socketClient.emit('expedition:join', expeditionId);
      
      setJoinedRooms(prev => new Set([...prev, expeditionId]));
      
      // Wait a bit for the join to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join expedition';
      setError(errorMessage);
      debugLog('Failed to join expedition:', err);
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [socketConnected, joinedRooms, debugLog]);

  const leaveExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      debugLog('Cannot leave expedition - not connected');
      return false;
    }

    if (!joinedRooms.has(expeditionId)) {
      debugLog(`Not joined to expedition: ${expeditionId}`);
      return true;
    }

    try {
      setIsLeaving(true);
      
      debugLog(`Leaving expedition: ${expeditionId}`);
      socketClient.emit('expedition:leave', expeditionId);
      
      setJoinedRooms(prev => {
        const newSet = new Set(prev);
        newSet.delete(expeditionId);
        return newSet;
      });
      
      // Wait a bit for the leave to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (err) {
      debugLog('Failed to leave expedition:', err);
      return false;
    } finally {
      setIsLeaving(false);
    }
  }, [socketConnected, joinedRooms, debugLog]);

  const isInRoom = useCallback((expeditionId: string): boolean => {
    return joinedRooms.has(expeditionId);
  }, [joinedRooms]);

  // ============================================================================
  // MESSAGING FUNCTIONS
  // ============================================================================

  const sendMessage = useCallback(async (
    expeditionId: string, 
    message: string, 
    messageType: string = 'user-input'
  ): Promise<boolean> => {
    if (!socketConnected) {
      setError('Not connected to server');
      return false;
    }

    try {
      setIsSending(true);
      setError(null);
      
      debugLog(`Sending message to expedition: ${expeditionId}`, { message, messageType });
      socketClient.emit('expedition:send-message', { expeditionId, message, messageType });
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      debugLog('Failed to send message:', err);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [socketConnected, debugLog]);

  const startTyping = useCallback((expeditionId: string) => {
    if (socketConnected && enableTypingIndicators) {
      socketClient.emit('expedition:typing-start', { expeditionId });
    }
  }, [socketConnected, enableTypingIndicators]);

  const stopTyping = useCallback((expeditionId: string) => {
    if (socketConnected && enableTypingIndicators) {
      socketClient.emit('expedition:typing-stop', { expeditionId });
    }
  }, [socketConnected, enableTypingIndicators]);

  // ============================================================================
  // EXPEDITION CONTROL FUNCTIONS
  // ============================================================================

  const startExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      setError('Not connected to server');
      return false;
    }

    try {
      debugLog(`Starting expedition: ${expeditionId}`);
      socketClient.emit('expedition:start', expeditionId);
      setError(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start expedition';
      setError(errorMessage);
      return false;
    }
  }, [socketConnected, debugLog]);

  const pauseExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      setError('Not connected to server');
      return false;
    }

    try {
      debugLog(`Pausing expedition: ${expeditionId}`);
      socketClient.emit('expedition:pause', expeditionId);
      setError(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause expedition';
      setError(errorMessage);
      return false;
    }
  }, [socketConnected, debugLog]);

  const resumeExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      setError('Not connected to server');
      return false;
    }

    try {
      debugLog(`Resuming expedition: ${expeditionId}`);
      socketClient.emit('expedition:resume', expeditionId);
      setError(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to resume expedition';
      setError(errorMessage);
      return false;
    }
  }, [socketConnected, debugLog]);

  const cancelExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!socketConnected) {
      setError('Not connected to server');
      return false;
    }

    try {
      debugLog(`Cancelling expedition: ${expeditionId}`);
      socketClient.emit('expedition:cancel', expeditionId);
      setError(null);
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel expedition';
      setError(errorMessage);
      return false;
    }
  }, [socketConnected, debugLog]);

  // ============================================================================
  // EVENT SUBSCRIPTION MANAGEMENT
  // ============================================================================

  const subscribeToEvents = useCallback((callbacks: Partial<ExpeditionSocketCallbacks>) => {
    additionalCallbacks.current = { ...additionalCallbacks.current, ...callbacks };
    
    return () => {
      // Remove the specific callbacks
      Object.keys(callbacks).forEach(key => {
        delete additionalCallbacks.current[key as keyof ExpeditionSocketCallbacks];
      });
    };
  }, []);

  const unsubscribeFromEvents = useCallback(() => {
    additionalCallbacks.current = {};
  }, []);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const reconnect = useCallback(async (): Promise<boolean> => {
    try {
      setConnectionState('reconnecting');
      // The useSocketConnection hook handles the actual reconnection
      return true;
    } catch (err) {
      setConnectionState('error');
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    // Leave all joined rooms first
    joinedRooms.forEach(expeditionId => {
      leaveExpedition(expeditionId);
    });
    
    setJoinedRooms(new Set());
    setConnectionState('disconnected');
  }, [joinedRooms, leaveExpedition]);

  const clearRealtimeData = useCallback(() => {
    setRealtimeData({
      activeUsers: [],
      typingUsers: [],
      agentStatuses: {},
      agentActivities: [],
      recentMessages: [],
      recentTasks: [],
      recentResults: [],
      connectionQuality: socketConnected ? 'excellent' : 'disconnected',
      eventCount: 0
    });
    eventCountRef.current = 0;
  }, [socketConnected]);

  const getConnectionMetrics = useCallback(() => {
    return {
      isConnected: socketConnected,
      connectionState,
      lastPing: lastPingRef.current,
      eventCount: eventCountRef.current,
      uptime: Date.now() - connectionStartTime.current
    };
  }, [socketConnected, connectionState]);

  // ============================================================================
  // SOCKET EVENT HANDLERS
  // ============================================================================

  // Helper function to increment event count and update connection quality
  const handleEventReceived = useCallback(() => {
    eventCountRef.current += 1;
    updateRealtimeData({ 
      eventCount: eventCountRef.current,
      connectionQuality: 'excellent'
    });
    lastPingRef.current = Date.now();
  }, [updateRealtimeData]);

  // Auto-join expedition when connected and expeditionId is provided
  useEffect(() => {
    if (socketConnected && expeditionId && autoJoin && !joinedRooms.has(expeditionId)) {
      joinExpedition(expeditionId);
    }
  }, [socketConnected, expeditionId, autoJoin, joinedRooms, joinExpedition]);

  // Set up comprehensive event listeners
  useEffect(() => {
    if (!socketConnected) return;

    const socket = socketClient.getSocket();
    if (!socket) return;

    debugLog('Setting up expedition socket event listeners');

    // ============================================================================
    // EXPEDITION LIFECYCLE EVENT HANDLERS
    // ============================================================================

    const handleExpeditionCreated = (event: ExpeditionCreatedEvent) => {
      handleEventReceived();
      debugLog('Expedition created:', event);
      onExpeditionCreated?.(event);
      additionalCallbacks.current.onExpeditionCreated?.(event);
    };

    const handleExpeditionUpdated = (event: ExpeditionUpdatedEvent) => {
      handleEventReceived();
      debugLog('Expedition updated:', event);
      onExpeditionUpdated?.(event);
      additionalCallbacks.current.onExpeditionUpdated?.(event);
    };

    const handleExpeditionDeleted = (event: ExpeditionDeletedEvent) => {
      handleEventReceived();
      debugLog('Expedition deleted:', event);
      onExpeditionDeleted?.(event);
      additionalCallbacks.current.onExpeditionDeleted?.(event);
    };

    const handleExpeditionStarted = (event: ExpeditionStatusEvent) => {
      handleEventReceived();
      debugLog('Expedition started:', event);
      updateRealtimeData({ currentStatus: event });
      onExpeditionStarted?.(event);
      additionalCallbacks.current.onExpeditionStarted?.(event);
    };

    const handleExpeditionPaused = (event: ExpeditionStatusEvent) => {
      handleEventReceived();
      debugLog('Expedition paused:', event);
      updateRealtimeData({ currentStatus: event });
      onExpeditionPaused?.(event);
      additionalCallbacks.current.onExpeditionPaused?.(event);
    };

    const handleExpeditionResumed = (event: ExpeditionStatusEvent) => {
      handleEventReceived();
      debugLog('Expedition resumed:', event);
      updateRealtimeData({ currentStatus: event });
      onExpeditionResumed?.(event);
      additionalCallbacks.current.onExpeditionResumed?.(event);
    };

    const handleExpeditionCancelled = (event: ExpeditionStatusEvent) => {
      handleEventReceived();
      debugLog('Expedition cancelled:', event);
      updateRealtimeData({ currentStatus: event });
      onExpeditionCancelled?.(event);
      additionalCallbacks.current.onExpeditionCancelled?.(event);
    };

    const handleExpeditionCompleted = (event: ExpeditionStatusEvent) => {
      handleEventReceived();
      debugLog('Expedition completed:', event);
      updateRealtimeData({ currentStatus: event });
      onExpeditionCompleted?.(event);
      additionalCallbacks.current.onExpeditionCompleted?.(event);
    };

    const handleStatusUpdate = (event: ExpeditionProgressEvent) => {
      handleEventReceived();
      debugLog('Status update:', event);
      updateRealtimeData({ currentProgress: event });
      onStatusUpdate?.(event);
      additionalCallbacks.current.onStatusUpdate?.(event);
    };

    // ============================================================================
    // TASK EVENT HANDLERS
    // ============================================================================

    const handleTaskAssigned = (event: TaskAssignedEvent) => {
      handleEventReceived();
      debugLog('Task assigned:', event);
      updateRealtimeData({ 
        recentTasks: [event, ...realtimeData.recentTasks].slice(0, 50) 
      });
      onTaskAssigned?.(event);
      additionalCallbacks.current.onTaskAssigned?.(event);
    };

    const handleTaskCompleted = (event: TaskCompletedEvent) => {
      handleEventReceived();
      debugLog('Task completed:', event);
      updateRealtimeData({ 
        recentTasks: [event, ...realtimeData.recentTasks].slice(0, 50) 
      });
      onTaskCompleted?.(event);
      additionalCallbacks.current.onTaskCompleted?.(event);
    };

    const handleTaskProgress = (event: TaskProgressEvent) => {
      if (enableAgentTracking) {
        handleEventReceived();
        debugLog('Task progress:', event);
        onTaskProgress?.(event);
        additionalCallbacks.current.onTaskProgress?.(event);
      }
    };

    // ============================================================================
    // MESSAGING EVENT HANDLERS
    // ============================================================================

    const handleMessage = (event: ExpeditionMessageEvent) => {
      handleEventReceived();
      debugLog('New message:', event);
      updateRealtimeData({
        recentMessages: [event, ...realtimeData.recentMessages].slice(0, 100)
      });
      onMessage?.(event);
      additionalCallbacks.current.onMessage?.(event);
    };

    const handleTypingStart = (event: ChatTypingEvent) => {
      if (enableTypingIndicators) {
        debugLog('Typing started:', event);
        updateRealtimeData({
          typingUsers: [...realtimeData.typingUsers.filter(u =>
            u.userId !== event.userId || u.agentId !== event.agentId
          ), event]
        });
        onTypingStart?.(event);
        additionalCallbacks.current.onTypingStart?.(event);
      }
    };

    const handleTypingStop = (event: ChatTypingEvent) => {
      if (enableTypingIndicators) {
        debugLog('Typing stopped:', event);
        updateRealtimeData({
          typingUsers: realtimeData.typingUsers.filter(u =>
            u.userId !== event.userId || u.agentId !== event.agentId
          )
        });
        onTypingStop?.(event);
        additionalCallbacks.current.onTypingStop?.(event);
      }
    };

    // ============================================================================
    // AGENT ACTIVITY EVENT HANDLERS
    // ============================================================================

    const handleAgentActivity = (event: AgentActivityEvent) => {
      if (enableAgentTracking) {
        handleEventReceived();
        debugLog('Agent activity:', event);
        updateRealtimeData({
          agentActivities: [event, ...realtimeData.agentActivities].slice(0, 100)
        });
        onAgentActivity?.(event);
        additionalCallbacks.current.onAgentActivity?.(event);
      }
    };

    const handleAgentStatus = (event: AgentStatusEvent) => {
      if (enableAgentTracking) {
        debugLog('Agent status:', event);
        updateRealtimeData({
          agentStatuses: { ...realtimeData.agentStatuses, [event.agentId]: event }
        });
        onAgentStatus?.(event);
        additionalCallbacks.current.onAgentStatus?.(event);
      }
    };

    // ============================================================================
    // QUALITY AND RESULTS EVENT HANDLERS
    // ============================================================================

    const handleQualityScoreUpdate = (event: QualityScoreUpdateEvent) => {
      if (enableQualityTracking) {
        handleEventReceived();
        debugLog('Quality score update:', event);
        onQualityScoreUpdate?.(event);
        additionalCallbacks.current.onQualityScoreUpdate?.(event);
      }
    };

    const handleResultAvailable = (event: ResultAvailableEvent) => {
      handleEventReceived();
      debugLog('Result available:', event);
      updateRealtimeData({
        recentResults: [event, ...realtimeData.recentResults].slice(0, 50)
      });
      onResultAvailable?.(event);
      additionalCallbacks.current.onResultAvailable?.(event);
    };

    // ============================================================================
    // PHASE AND WORKFLOW EVENT HANDLERS
    // ============================================================================

    const handlePhaseChange = (event: PhaseChangeEvent) => {
      handleEventReceived();
      debugLog('Phase change:', event);
      updateRealtimeData({ currentPhase: event });
      onPhaseChange?.(event);
      additionalCallbacks.current.onPhaseChange?.(event);
    };

    const handleMilestoneReached = (event: MilestoneReachedEvent) => {
      handleEventReceived();
      debugLog('Milestone reached:', event);
      onMilestoneReached?.(event);
      additionalCallbacks.current.onMilestoneReached?.(event);
    };

    // ============================================================================
    // ERROR AND SYSTEM EVENT HANDLERS
    // ============================================================================

    const handleExpeditionError = (event: ExpeditionErrorEvent) => {
      handleEventReceived();
      debugLog('Expedition error:', event);
      
      // Enhanced error handling with filtering
      if (!event || !event.error) {
        debugLog('Received invalid error event, ignoring');
        return;
      }

      const { error } = event;
      
      // Filter out low-severity or recoverable errors if needed
      if (error.severity === 'low' && error.recoverable) {
        debugLog('Ignoring low-severity recoverable error');
        return;
      }

      setLastError(event);
      updateRealtimeData({ lastError: event });
      
      // Set user-friendly error message
      const errorMessage = error.message || 'An expedition error occurred';
      setError(errorMessage);
      
      onExpeditionError?.(event);
      additionalCallbacks.current.onExpeditionError?.(event);
    };

    const handleSystemStatus = (event: SystemStatusEvent) => {
      if (enableSystemMonitoring) {
        debugLog('System status:', event);
        updateRealtimeData({ systemStatus: event });
        onSystemStatus?.(event);
        additionalCallbacks.current.onSystemStatus?.(event);
      }
    };

    // ============================================================================
    // ROOM MANAGEMENT EVENT HANDLERS
    // ============================================================================

    const handleRoomJoined = (event: RoomJoinedEvent) => {
      debugLog('Room joined:', event);
      updateRealtimeData({
        activeUsers: [...realtimeData.activeUsers.filter(u => u.userId !== event.userId), event]
      });
      onRoomJoined?.(event);
      additionalCallbacks.current.onRoomJoined?.(event);
    };

    const handleRoomLeft = (event: RoomLeftEvent) => {
      debugLog('Room left:', event);
      updateRealtimeData({
        activeUsers: realtimeData.activeUsers.filter(u => u.userId !== event.userId)
      });
      onRoomLeft?.(event);
      additionalCallbacks.current.onRoomLeft?.(event);
    };

    // ============================================================================
    // REGISTER ALL EVENT LISTENERS
    // ============================================================================

    // Expedition lifecycle events
    socket.on('expedition:created', handleExpeditionCreated);
    socket.on('expedition:updated', handleExpeditionUpdated);
    socket.on('expedition:deleted', handleExpeditionDeleted);
    socket.on('expedition:started', handleExpeditionStarted);
    socket.on('expedition:paused', handleExpeditionPaused);
    socket.on('expedition:resumed', handleExpeditionResumed);
    socket.on('expedition:cancelled', handleExpeditionCancelled);
    socket.on('expedition:completed', handleExpeditionCompleted);
    socket.on('expedition:status-update', handleStatusUpdate);

    // Task events
    socket.on('expedition:task-assigned', handleTaskAssigned);
    socket.on('expedition:task-completed', handleTaskCompleted);
    (socket as any).on('expedition:task-progress', handleTaskProgress);

    // Messaging events
    socket.on('expedition:message', handleMessage);
    (socket as any).on('expedition:typing-start', handleTypingStart);
    (socket as any).on('expedition:typing-stop', handleTypingStop);

    // Agent activity events
    (socket as any).on('expedition:agent-activity', handleAgentActivity);
    (socket as any).on('expedition:agent-status', handleAgentStatus);

    // Quality and results events
    (socket as any).on('expedition:quality-score-update', handleQualityScoreUpdate);
    socket.on('expedition:result-available', handleResultAvailable);

    // Phase and workflow events
    socket.on('expedition:phase-change', handlePhaseChange);
    (socket as any).on('expedition:milestone-reached', handleMilestoneReached);

    // Error and system events
    socket.on('expedition:error', handleExpeditionError);
    (socket as any).on('expedition:system-status', handleSystemStatus);

    // Room management events
    (socket as any).on('expedition:room-joined', handleRoomJoined);
    (socket as any).on('expedition:room-left', handleRoomLeft);

    // ============================================================================
    // CLEANUP FUNCTION
    // ============================================================================

    return () => {
      debugLog('Cleaning up expedition socket event listeners');
      
      // Remove all event listeners
      socket.off('expedition:created', handleExpeditionCreated);
      socket.off('expedition:updated', handleExpeditionUpdated);
      socket.off('expedition:deleted', handleExpeditionDeleted);
      socket.off('expedition:started', handleExpeditionStarted);
      socket.off('expedition:paused', handleExpeditionPaused);
      socket.off('expedition:resumed', handleExpeditionResumed);
      socket.off('expedition:cancelled', handleExpeditionCancelled);
      socket.off('expedition:completed', handleExpeditionCompleted);
      socket.off('expedition:status-update', handleStatusUpdate);
      socket.off('expedition:task-assigned', handleTaskAssigned);
      socket.off('expedition:task-completed', handleTaskCompleted);
      (socket as any).off('expedition:task-progress', handleTaskProgress);
      socket.off('expedition:message', handleMessage);
      (socket as any).off('expedition:typing-start', handleTypingStart);
      (socket as any).off('expedition:typing-stop', handleTypingStop);
      (socket as any).off('expedition:agent-activity', handleAgentActivity);
      (socket as any).off('expedition:agent-status', handleAgentStatus);
      (socket as any).off('expedition:quality-score-update', handleQualityScoreUpdate);
      socket.off('expedition:result-available', handleResultAvailable);
      socket.off('expedition:phase-change', handlePhaseChange);
      (socket as any).off('expedition:milestone-reached', handleMilestoneReached);
      socket.off('expedition:error', handleExpeditionError);
      (socket as any).off('expedition:system-status', handleSystemStatus);
      (socket as any).off('expedition:room-joined', handleRoomJoined);
      (socket as any).off('expedition:room-left', handleRoomLeft);
    };
  }, [
    socketConnected,
    debugLog,
    handleEventReceived,
    updateRealtimeData,
    realtimeData,
    enableAgentTracking,
    enableTypingIndicators,
    enableQualityTracking,
    enableSystemMonitoring,
    onExpeditionCreated,
    onExpeditionUpdated,
    onExpeditionDeleted,
    onExpeditionStarted,
    onExpeditionPaused,
    onExpeditionResumed,
    onExpeditionCancelled,
    onExpeditionCompleted,
    onStatusUpdate,
    onTaskAssigned,
    onTaskCompleted,
    onTaskProgress,
    onMessage,
    onTypingStart,
    onTypingStop,
    onAgentActivity,
    onAgentStatus,
    onQualityScoreUpdate,
    onResultAvailable,
    onPhaseChange,
    onMilestoneReached,
    onExpeditionError,
    onSystemStatus,
    onRoomJoined,
    onRoomLeft
  ]);

  // ============================================================================
  // RETURN HOOK INTERFACE
  // ============================================================================

  return {
    // Connection state
    isConnected: socketConnected,
    connectionState,
    connectionQuality: realtimeData.connectionQuality,
    
    // Real-time data
    realtimeData,
    
    // Room management
    joinExpedition,
    leaveExpedition,
    isInRoom,
    
    // Messaging actions
    sendMessage,
    startTyping,
    stopTyping,
    
    // Expedition control actions
    startExpedition,
    pauseExpedition,
    resumeExpedition,
    cancelExpedition,
    
    // Event subscription management
    subscribeToEvents,
    unsubscribeFromEvents,
    
    // Connection management
    reconnect,
    disconnect,
    
    // Utility functions
    clearRealtimeData,
    getConnectionMetrics,
    
    // Error state
    error,
    lastError,
    
    // Loading states
    isJoining,
    isLeaving,
    isSending
  };
}