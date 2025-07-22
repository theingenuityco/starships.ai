/**
 * Enhanced Expedition Socket Hook
 * 
 * Provides a comprehensive React hook for real-time expedition management
 * with automatic connection management, event handling, and performance optimizations.
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useSocketConnection } from './useSocketConnection';
import SocketClient from '@/lib/socket-client';
import ExpeditionSocketClient, { type ExpeditionSocketEvents, type ConnectionMetrics } from '@/lib/expeditionSocketClient';

// Import the actual socket event types
import type {
  ExpeditionStatusEvent,
  ExpeditionProgressEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskProgressEvent,
  AgentStatusEvent,
  ExpeditionMessageEvent,
  ChatTypingEvent,
  PhaseChangeEvent,
  ResultAvailableEvent,
  ExpeditionErrorEvent
} from '@starships/protocol';

// Enhanced event callback types that match the actual socket events
export interface EnhancedExpeditionSocketCallbacks {
  // Expedition lifecycle events
  onExpeditionStarted?: (data: ExpeditionStatusEvent) => void;
  onExpeditionCompleted?: (data: ExpeditionStatusEvent) => void;
  onExpeditionFailed?: (data: ExpeditionStatusEvent) => void;
  onExpeditionCancelled?: (data: ExpeditionStatusEvent) => void;
  onExpeditionPaused?: (data: ExpeditionStatusEvent) => void;
  onExpeditionResumed?: (data: ExpeditionStatusEvent) => void;
  
  // Progress and status updates
  onStatusUpdate?: (data: ExpeditionProgressEvent) => void;
  onWorkflowProgress?: (data: any) => void; // Custom event not in unified types
  
  // Task management
  onTaskAssigned?: (data: TaskAssignedEvent) => void;
  onTaskCompleted?: (data: TaskCompletedEvent) => void;
  onTaskProgress?: (data: TaskProgressEvent) => void;
  
  // Agent management
  onAgentAssigned?: (data: any) => void; // Custom event not in unified types
  onAgentStatus?: (data: AgentStatusEvent) => void;
  
  // Real-time messaging
  onMessage?: (data: ExpeditionMessageEvent) => void;
  onTypingStart?: (data: ChatTypingEvent) => void;
  onTypingStop?: (data: ChatTypingEvent) => void;
  
  // Phase and workflow
  onPhaseChange?: (data: PhaseChangeEvent) => void;
  onResultAvailable?: (data: ResultAvailableEvent) => void;
  
  // Error handling
  onError?: (data: ExpeditionErrorEvent) => void;
  
  // Connection events
  onConnectionChange?: (connected: boolean) => void;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
}

export interface UseEnhancedExpeditionSocketProps extends EnhancedExpeditionSocketCallbacks {
  expeditionId?: string;
  autoJoin?: boolean;
  enableReconnection?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  enableEventDebouncing?: boolean;
  debounceDelay?: number;
  enablePerformanceMonitoring?: boolean;
  enableTypingIndicators?: boolean;
  typingTimeout?: number;
  debugMode?: boolean;
}

export interface TypingUser {
  id: string;
  name: string;
  role: 'user' | 'first-officer' | 'agent' | 'system';
  expeditionId: string;
  timestamp: string;
}

export interface RealtimeExpeditionData {
  // Current state
  currentStatus?: any;
  currentProgress?: any;
  currentPhase?: string;
  
  // Active participants
  typingUsers: TypingUser[];
  activeAgents: string[];
  
  // Recent activity
  recentMessages: any[];
  recentTasks: any[];
  recentResults: any[];
  
  // Connection info
  connectionMetrics: ConnectionMetrics;
  lastError?: any;
}

export interface UseEnhancedExpeditionSocketReturn {
  // Connection state
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  connectionState: ConnectionMetrics;
  
  // Real-time data
  realtimeData: RealtimeExpeditionData;
  
  // Room management
  joinExpedition: (expeditionId: string) => Promise<boolean>;
  leaveExpedition: (expeditionId: string) => Promise<boolean>;
  isJoinedToExpedition: (expeditionId: string) => boolean;
  
  // Messaging actions
  sendMessage: (expeditionId: string, message: string, messageType?: string) => Promise<boolean>;
  startTyping: (expeditionId: string) => void;
  stopTyping: (expeditionId: string) => void;
  
  // Expedition control actions
  startExpedition: (expeditionId: string) => Promise<boolean>;
  pauseExpedition: (expeditionId: string) => Promise<boolean>;
  cancelExpedition: (expeditionId: string) => Promise<boolean>;
  
  // Event subscription management
  subscribeToEvents: (callbacks: Partial<EnhancedExpeditionSocketCallbacks>) => () => void;
  
  // Enhanced connection management
  getConnectionMetrics: () => ConnectionMetrics;
  getCircuitBreakerStatus: () => { state: 'closed' | 'open' | 'half-open'; failureCount: number; nextRetryTime?: number; timeUntilRetry?: number; };
  getOfflineQueueStatus: () => { queueSize: number; maxQueueSize: number; oldestOperationAge?: number; };
  getHealthStatus: () => { isHealthy: boolean; connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected'; issues: string[]; recommendations: string[]; };
  forceReconnect: () => void;
  resetCircuitBreaker: () => void;
  clearOfflineQueue: () => void;
  
  // Utility functions
  getEventHistory: () => Array<{ event: string; data: any; timestamp: number }>;
  clearRealtimeData: () => void;
  
  // Error state
  error: string | null;
  
  // Loading states
  isJoining: boolean;
  isLeaving: boolean;
  isSending: boolean;
}

export function useEnhancedExpeditionSocket(props: UseEnhancedExpeditionSocketProps = {}): UseEnhancedExpeditionSocketReturn {
  const {
    expeditionId,
    autoJoin = true,
    enableReconnection = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    enableEventDebouncing = true,
    debounceDelay = 100,
    enablePerformanceMonitoring = true,
    enableTypingIndicators = true,
    typingTimeout = 3000,
    debugMode = false,
    // Callback props
    onExpeditionStarted,
    onExpeditionCompleted,
    onExpeditionFailed,
    onExpeditionCancelled,
    onExpeditionPaused,
    onExpeditionResumed,
    onStatusUpdate,
    onWorkflowProgress,
    onTaskAssigned,
    onTaskCompleted,
    onTaskProgress,
    onAgentAssigned,
    onAgentStatus,
    onMessage,
    onTypingStart,
    onTypingStop,
    onPhaseChange,
    onResultAvailable,
    onError,
    onConnectionChange,
    onReconnectAttempt
  } = props;

  // State management
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionMetrics>({
    isConnected: false,
    connectionQuality: 'disconnected',
    eventCount: 0,
    uptime: 0,
    reconnectAttempts: 0,
    circuitBreakerState: 'closed',
    failureCount: 0
  });
  const [realtimeData, setRealtimeData] = useState<RealtimeExpeditionData>({
    typingUsers: [],
    activeAgents: [],
    recentMessages: [],
    recentTasks: [],
    recentResults: [],
    connectionMetrics: {
      isConnected: false,
      connectionQuality: 'disconnected',
      eventCount: 0,
      uptime: 0,
      reconnectAttempts: 0,
      circuitBreakerState: 'closed',
      failureCount: 0
    }
  });

  // Refs for cleanup and subscription management
  const expeditionSocketRef = useRef<ExpeditionSocketClient | null>(null);
  const eventUnsubscribersRef = useRef<Array<() => void>>([]);
  const additionalCallbacksRef = useRef<Partial<EnhancedExpeditionSocketCallbacks>>({});

  // Base socket connection
  const { isConnected: socketConnected, connectionStatus } = useSocketConnection();
  const baseSocketClient = SocketClient.getInstance();

  // Debug logging
  const debugLog = useCallback((message: string, data?: any) => {
    if (debugMode) {
      console.log(`[ENHANCED EXPEDITION SOCKET] ${message}`, data || '');
    }
  }, [debugMode]);
  
  // Debug the base socket connection state
  useEffect(() => {
    debugLog('Base socket connection changed:', {
      socketConnected,
      connectionStatus,
      actualSocketConnected: baseSocketClient.isConnected()
    });
  }, [socketConnected, connectionStatus, debugLog]);

  // Initialize expedition socket client
  useEffect(() => {
    debugLog('Socket connection state changed:', { socketConnected });
    
    if (!socketConnected) {
      debugLog('Base socket not connected, skipping expedition socket initialization');
      return;
    }

    const baseSocket = baseSocketClient.getSocket();
    if (!baseSocket) {
      debugLog('Base socket instance not available');
      return;
    }

    debugLog('Base socket state:', {
      connected: baseSocket.connected,
      id: baseSocket.id
    });

    const initializeExpeditionSocket = async () => {
      try {
        expeditionSocketRef.current = ExpeditionSocketClient.getInstance({
          enableReconnection,
          maxReconnectAttempts,
          reconnectDelay,
          enableEventDebouncing,
          debounceDelay,
          enablePerformanceMonitoring,
          enableTypingIndicators,
          typingTimeout
        });

        await expeditionSocketRef.current.initialize(baseSocket);
        debugLog('Expedition socket initialized successfully');

        // Update connection metrics immediately
        const metrics = expeditionSocketRef.current.getConnectionMetrics();
        debugLog('Initial connection metrics:', metrics);
        
        setConnectionState(metrics);
        setRealtimeData(prev => ({
          ...prev,
          connectionMetrics: metrics
        }));

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize expedition socket';
        setError(errorMessage);
        debugLog('Failed to initialize expedition socket:', err);
      }
    };

    initializeExpeditionSocket();

    return () => {
      if (expeditionSocketRef.current) {
        debugLog('Cleaning up expedition socket');
        expeditionSocketRef.current.cleanup();
        expeditionSocketRef.current = null;
      }
    };
  }, [socketConnected, enableReconnection, maxReconnectAttempts, reconnectDelay, enableEventDebouncing, debounceDelay, enablePerformanceMonitoring, enableTypingIndicators, typingTimeout, debugLog]);

  // Enhanced connection state monitoring
  useEffect(() => {
    if (!expeditionSocketRef.current) return;

    const unsubscribeConnectionState = expeditionSocketRef.current.onConnectionStateChange((newState) => {
      debugLog('Connection state changed:', newState);
      
      setConnectionState(newState);
      setRealtimeData(prev => ({
        ...prev,
        connectionMetrics: newState
      }));

      // Handle connection state changes
      if (onConnectionChange) {
        onConnectionChange(newState.isConnected);
      }

      // Handle reconnection attempts
      if (onReconnectAttempt && newState.reconnectAttempts > 0) {
        onReconnectAttempt(newState.reconnectAttempts, maxReconnectAttempts);
      }

      // Clear errors on successful connection
      if (newState.isConnected && newState.circuitBreakerState === 'closed') {
        setError(null);
      }

      // Set error for circuit breaker open state
      if (newState.circuitBreakerState === 'open') {
        setError('Connection temporarily suspended due to repeated failures. Retrying automatically...');
      }
    });

    // Also get the initial connection state
    const initialState = expeditionSocketRef.current.getConnectionMetrics();
    debugLog('Initial connection state:', initialState);
    setConnectionState(initialState);
    setRealtimeData(prev => ({
      ...prev,
      connectionMetrics: initialState
    }));

    return unsubscribeConnectionState;
  }, [maxReconnectAttempts, debugLog]); // Added debugLog back since it's stable

  // Setup event listeners
  useEffect(() => {
    if (!expeditionSocketRef.current) return;

    const expeditionSocket = expeditionSocketRef.current;
    const unsubscribers: Array<() => void> = [];

    // Setup all event listeners
    if (onExpeditionStarted) {
      unsubscribers.push(expeditionSocket.on('expedition:started', onExpeditionStarted));
    }
    if (onExpeditionCompleted) {
      unsubscribers.push(expeditionSocket.on('expedition:completed', onExpeditionCompleted));
    }
    if (onExpeditionFailed) {
      unsubscribers.push(expeditionSocket.on('expedition:failed', onExpeditionFailed));
    }
    if (onExpeditionCancelled) {
      unsubscribers.push(expeditionSocket.on('expedition:cancelled', onExpeditionCancelled));
    }
    if (onExpeditionPaused) {
      unsubscribers.push(expeditionSocket.on('expedition:paused', onExpeditionPaused));
    }
    if (onExpeditionResumed) {
      unsubscribers.push(expeditionSocket.on('expedition:resumed', onExpeditionResumed));
    }

    // Progress and status events
    if (onStatusUpdate) {
      unsubscribers.push(expeditionSocket.on('expedition:status-update', (data) => {
        setRealtimeData(prev => ({ ...prev, currentStatus: data }));
        onStatusUpdate(data);
      }));
    }
    if (onWorkflowProgress) {
      unsubscribers.push(expeditionSocket.on('expedition:workflow-progress', (data) => {
        setRealtimeData(prev => ({ ...prev, currentProgress: data }));
        onWorkflowProgress(data);
      }));
    }

    // Task events
    if (onTaskAssigned) {
      unsubscribers.push(expeditionSocket.on('expedition:task-assigned', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          recentTasks: [data, ...prev.recentTasks].slice(0, 50)
        }));
        onTaskAssigned(data);
      }));
    }
    if (onTaskCompleted) {
      unsubscribers.push(expeditionSocket.on('expedition:task-completed', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          recentTasks: [data, ...prev.recentTasks].slice(0, 50)
        }));
        onTaskCompleted(data);
      }));
    }
    if (onTaskProgress) {
      unsubscribers.push(expeditionSocket.on('expedition:task-progress', onTaskProgress));
    }

    // Agent events
    if (onAgentAssigned) {
      unsubscribers.push(expeditionSocket.on('expedition:agent-assigned', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          activeAgents: [...new Set([...prev.activeAgents, data.agentId])]
        }));
        onAgentAssigned(data);
      }));
    }
    if (onAgentStatus) {
      unsubscribers.push(expeditionSocket.on('expedition:agent-status', onAgentStatus));
    }

    // Messaging events
    if (onMessage) {
      unsubscribers.push(expeditionSocket.on('expedition:message', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          recentMessages: [data, ...prev.recentMessages].slice(0, 100)
        }));
        onMessage(data);
      }));
    }

    // Typing events
    if (onTypingStart) {
      unsubscribers.push(expeditionSocket.on('expedition:typing-start', (data) => {
        setRealtimeData(prev => {
          const existingIndex = prev.typingUsers.findIndex(
            user => user.id === (data.userId || data.agentId) && user.expeditionId === data.expeditionId
          );
          
          const newTypingUser: TypingUser = {
            id: data.userId || data.agentId || 'unknown',
            name: data.userId ? 'User' : data.agentId ? `Agent ${data.agentId.slice(0, 8)}` : 'Unknown',
            role: data.role as 'user' | 'first-officer' | 'agent' | 'system',
            expeditionId: data.expeditionId,
            timestamp: data.timestamp
          };

          const newTypingUsers = [...prev.typingUsers];
          if (existingIndex >= 0) {
            newTypingUsers[existingIndex] = newTypingUser;
          } else {
            newTypingUsers.push(newTypingUser);
          }

          return { ...prev, typingUsers: newTypingUsers };
        });
        onTypingStart(data);
      }));
    }

    if (onTypingStop) {
      unsubscribers.push(expeditionSocket.on('expedition:typing-stop', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          typingUsers: prev.typingUsers.filter(
            user => !(user.id === (data.userId || data.agentId) && user.expeditionId === data.expeditionId)
          )
        }));
        onTypingStop(data);
      }));
    }

    // Phase and workflow events
    if (onPhaseChange) {
      unsubscribers.push(expeditionSocket.on('expedition:phase-change', (data) => {
        setRealtimeData(prev => ({ ...prev, currentPhase: data.phase.current }));
        onPhaseChange(data);
      }));
    }
    if (onResultAvailable) {
      unsubscribers.push(expeditionSocket.on('expedition:result-available', (data) => {
        setRealtimeData(prev => ({
          ...prev,
          recentResults: [data, ...prev.recentResults].slice(0, 50)
        }));
        onResultAvailable(data);
      }));
    }

    // Error events
    if (onError) {
      unsubscribers.push(expeditionSocket.on('expedition:error', (data) => {
        setRealtimeData(prev => ({ ...prev, lastError: data }));
        setError(data.error.message);
        onError(data);
      }));
    }

    eventUnsubscribersRef.current = unsubscribers;

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
      eventUnsubscribersRef.current = [];
    };
  }, [
    onExpeditionStarted, onExpeditionCompleted, onExpeditionFailed, onExpeditionCancelled,
    onExpeditionPaused, onExpeditionResumed, onStatusUpdate, onWorkflowProgress,
    onTaskAssigned, onTaskCompleted, onTaskProgress, onAgentAssigned, onAgentStatus,
    onMessage, onTypingStart, onTypingStop, onPhaseChange, onResultAvailable, onError
  ]);

  // Auto-join expedition
  useEffect(() => {
    if (expeditionId && autoJoin && expeditionSocketRef.current?.isConnected()) {
      joinExpedition(expeditionId);
    }
  }, [expeditionId, autoJoin]);

  // Update connection metrics periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (expeditionSocketRef.current) {
        setRealtimeData(prev => ({
          ...prev,
          connectionMetrics: expeditionSocketRef.current!.getConnectionMetrics()
        }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Public API methods
  const joinExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      setError('Expedition socket not initialized');
      return false;
    }

    setIsJoining(true);
    setError(null);

    try {
      const success = await expeditionSocketRef.current.joinExpedition(expeditionId);
      debugLog(`Join expedition ${expeditionId}:`, success);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join expedition';
      setError(errorMessage);
      return false;
    } finally {
      setIsJoining(false);
    }
  }, [debugLog]);

  const leaveExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      return false;
    }

    setIsLeaving(true);

    try {
      const success = await expeditionSocketRef.current.leaveExpedition(expeditionId);
      debugLog(`Leave expedition ${expeditionId}:`, success);
      return success;
    } catch (err) {
      debugLog('Failed to leave expedition:', err);
      return false;
    } finally {
      setIsLeaving(false);
    }
  }, [debugLog]);

  const isJoinedToExpedition = useCallback((expeditionId: string): boolean => {
    return expeditionSocketRef.current?.isJoinedToExpedition(expeditionId) || false;
  }, []);

  const sendMessage = useCallback(async (expeditionId: string, message: string, messageType: string = 'user-input'): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      setError('Expedition socket not initialized');
      return false;
    }

    setIsSending(true);
    setError(null);

    try {
      const success = await expeditionSocketRef.current.sendMessage(expeditionId, message, messageType);
      debugLog(`Send message to ${expeditionId}:`, success);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
      setError(errorMessage);
      return false;
    } finally {
      setIsSending(false);
    }
  }, [debugLog]);

  const startTyping = useCallback((expeditionId: string) => {
    expeditionSocketRef.current?.startTyping(expeditionId);
  }, []);

  const stopTyping = useCallback((expeditionId: string) => {
    expeditionSocketRef.current?.stopTyping(expeditionId);
  }, []);

  const startExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      setError('Expedition socket not initialized');
      return false;
    }

    try {
      const success = await expeditionSocketRef.current.startExpedition(expeditionId);
      debugLog(`Start expedition ${expeditionId}:`, success);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start expedition';
      setError(errorMessage);
      return false;
    }
  }, [debugLog]);

  const pauseExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      setError('Expedition socket not initialized');
      return false;
    }

    try {
      const success = await expeditionSocketRef.current.pauseExpedition(expeditionId);
      debugLog(`Pause expedition ${expeditionId}:`, success);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to pause expedition';
      setError(errorMessage);
      return false;
    }
  }, [debugLog]);

  const cancelExpedition = useCallback(async (expeditionId: string): Promise<boolean> => {
    if (!expeditionSocketRef.current) {
      setError('Expedition socket not initialized');
      return false;
    }

    try {
      const success = await expeditionSocketRef.current.cancelExpedition(expeditionId);
      debugLog(`Cancel expedition ${expeditionId}:`, success);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel expedition';
      setError(errorMessage);
      return false;
    }
  }, [debugLog]);

  const subscribeToEvents = useCallback((callbacks: Partial<EnhancedExpeditionSocketCallbacks>) => {
    additionalCallbacksRef.current = { ...additionalCallbacksRef.current, ...callbacks };
    
    return () => {
      Object.keys(callbacks).forEach(key => {
        delete additionalCallbacksRef.current[key as keyof EnhancedExpeditionSocketCallbacks];
      });
    };
  }, []);

  const getConnectionMetrics = useCallback((): ConnectionMetrics => {
    return expeditionSocketRef.current?.getConnectionMetrics() || realtimeData.connectionMetrics;
  }, [realtimeData.connectionMetrics]);

  const getEventHistory = useCallback(() => {
    return expeditionSocketRef.current?.getEventHistory() || [];
  }, []);

  const clearRealtimeData = useCallback(() => {
    setRealtimeData({
      typingUsers: [],
      activeAgents: [],
      recentMessages: [],
      recentTasks: [],
      recentResults: [],
      connectionMetrics: expeditionSocketRef.current?.getConnectionMetrics() || {
        isConnected: false,
        connectionQuality: 'disconnected',
        eventCount: 0,
        uptime: 0,
        reconnectAttempts: 0,
        circuitBreakerState: 'closed',
        failureCount: 0
      }
    });
  }, []);

  // Enhanced connection management methods
  const getCircuitBreakerStatus = useCallback(() => {
    return expeditionSocketRef.current?.getCircuitBreakerStatus() || {
      state: 'closed' as const,
      failureCount: 0
    };
  }, []);

  const getOfflineQueueStatus = useCallback(() => {
    return expeditionSocketRef.current?.getOfflineQueueStatus() || {
      queueSize: 0,
      maxQueueSize: 100,
      oldestOperationAge: undefined
    };
  }, []);

  const getHealthStatus = useCallback(() => {
    return expeditionSocketRef.current?.getHealthStatus() || {
      isHealthy: false,
      connectionQuality: 'disconnected' as const,
      issues: ['Socket not initialized'],
      recommendations: ['Initialize socket connection']
    };
  }, []);

  const forceReconnect = useCallback(() => {
    if (expeditionSocketRef.current) {
      expeditionSocketRef.current.forceReconnect();
    }
  }, []);

  const resetCircuitBreaker = useCallback(() => {
    if (expeditionSocketRef.current) {
      expeditionSocketRef.current.resetCircuitBreaker();
    }
  }, []);

  const clearOfflineQueue = useCallback(() => {
    if (expeditionSocketRef.current) {
      expeditionSocketRef.current.clearOfflineQueue();
    }
  }, []);

  return {
    // Connection state
    isConnected: connectionState.isConnected,
    connectionQuality: connectionState.connectionQuality,
    connectionState,
    
    // Real-time data
    realtimeData,
    
    // Room management
    joinExpedition,
    leaveExpedition,
    isJoinedToExpedition,
    
    // Messaging actions
    sendMessage,
    startTyping,
    stopTyping,
    
    // Expedition control actions
    startExpedition,
    pauseExpedition,
    cancelExpedition,
    
    // Event subscription management
    subscribeToEvents,
    
    // Enhanced connection management
    getConnectionMetrics,
    getCircuitBreakerStatus,
    getOfflineQueueStatus,
    getHealthStatus,
    forceReconnect,
    resetCircuitBreaker,
    clearOfflineQueue,
    
    // Utility functions
    getEventHistory,
    clearRealtimeData,
    
    // Error state
    error,
    
    // Loading states
    isJoining,
    isLeaving,
    isSending
  };
}