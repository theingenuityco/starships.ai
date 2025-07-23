/**
 * Enhanced Expedition Socket Client
 *
 * Provides comprehensive real-time WebSocket integration for expedition management
 * with automatic reconnection, event debouncing, and performance optimizations.
 */

import { Socket } from 'socket.io-client';
import type {
  SocketIOEvents,
  ExpeditionCreatedEvent,
  ExpeditionUpdatedEvent,
  ExpeditionDeletedEvent,
  ExpeditionStatusEvent,
  ExpeditionProgressEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskProgressEvent,
  ExpeditionMessageEvent,
  ChatTypingEvent,
  AgentActivityEvent,
  AgentStatusEvent,
  QualityScoreUpdateEvent,
  ResultAvailableEvent,
  PhaseChangeEvent,
  MilestoneReachedEvent,
  ExpeditionErrorEvent,
  SystemStatusEvent,
  RoomJoinedEvent,
  RoomLeftEvent,
  ConnectionStatusEvent
} from '@starships/protocol';

// Re-export the unified event types for backward compatibility
export type ExpeditionSocketEvents = SocketIOEvents;

export interface ConnectionMetrics {
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  lastPing?: number;
  eventCount: number;
  uptime: number;
  reconnectAttempts: number;
  lastError?: string;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  failureCount: number;
  lastFailureTime?: number;
  nextRetryTime?: number;
}

export interface ExpeditionSocketConfig {
  enableReconnection?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  reconnectBackoffMultiplier?: number;
  enableEventDebouncing?: boolean;
  debounceDelay?: number;
  enablePerformanceMonitoring?: boolean;
  maxEventHistory?: number;
  enableTypingIndicators?: boolean;
  typingTimeout?: number;
  // Circuit breaker configuration
  circuitBreakerFailureThreshold?: number;
  circuitBreakerTimeout?: number;
  circuitBreakerRetryDelay?: number;
  // Error handling configuration
  enableGracefulDegradation?: boolean;
  offlineQueueSize?: number;
  enableErrorRecovery?: boolean;
  healthCheckInterval?: number;
}

class ExpeditionSocketClient {
  private static instance: ExpeditionSocketClient;
  private socket: Socket | null = null;
  private config: Required<ExpeditionSocketConfig>;
  private eventListeners: Map<string, Set<(...args: any[]) => void>> = new Map();
  private joinedRooms: Set<string> = new Set();
  private eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];
  private connectionMetrics: ConnectionMetrics;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private typingTimers: Map<string, NodeJS.Timeout> = new Map();
  private eventDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private performanceObserver: PerformanceObserver | null = null;
  // Enhanced error handling and recovery
  private offlineQueue: Array<{ method: string; args: any[]; timestamp: number; resolve: (value: any) => void; reject: (reason: any) => void }> = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private circuitBreakerTimer: NodeJS.Timeout | null = null;
  private connectionStateListeners: Set<(state: ConnectionMetrics) => void> = new Set();
  private isInitialized: boolean = false;

  private constructor(config: ExpeditionSocketConfig = {}) {
    this.config = {
      enableReconnection: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      reconnectBackoffMultiplier: 1.5,
      enableEventDebouncing: true,
      debounceDelay: 100,
      enablePerformanceMonitoring: true,
      maxEventHistory: 1000,
      enableTypingIndicators: true,
      typingTimeout: 3000,
      circuitBreakerFailureThreshold: 5,
      circuitBreakerTimeout: 60000,
      circuitBreakerRetryDelay: 5000,
      enableGracefulDegradation: true,
      offlineQueueSize: 100,
      enableErrorRecovery: true,
      healthCheckInterval: 30000,
      ...config
    };

    this.connectionMetrics = {
      isConnected: false,
      connectionQuality: 'disconnected',
      eventCount: 0,
      uptime: 0,
      reconnectAttempts: 0,
      circuitBreakerState: 'closed',
      failureCount: 0
    };

    this.initializePerformanceMonitoring();
  }

  static getInstance(config?: ExpeditionSocketConfig): ExpeditionSocketClient {
    if (!ExpeditionSocketClient.instance) {
      ExpeditionSocketClient.instance = new ExpeditionSocketClient(config);
    }
    return ExpeditionSocketClient.instance;
  }

  /**
   * Initialize the socket connection with enhanced error handling
   */
  async initialize(baseSocket: Socket): Promise<void> {
    if (this.socket) {
      console.warn('[EXPEDITION SOCKET] Already initialized');
      return;
    }

    this.socket = baseSocket;
    this.setupEventListeners();
    this.connectionMetrics.uptime = Date.now();
    this.isInitialized = true;
    
    // Check initial connection state
    if (this.socket.connected) {
      console.log('[EXPEDITION SOCKET] Base socket already connected - updating state');
      this.handleSuccessfulConnection();
    } else {
      console.log('[EXPEDITION SOCKET] Base socket not connected - waiting for connection');
    }
    
    // Start health monitoring
    this.startHealthCheck();
    
    console.log('[EXPEDITION SOCKET] Initialized with enhanced error handling and recovery');
  }

  /**
   * Setup comprehensive event listeners with enhanced error handling
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Enhanced connection events with circuit breaker and recovery
    this.socket.on('connect', () => {
      this.handleSuccessfulConnection();
    });

    this.socket.on('disconnect', (reason) => {
      this.handleDisconnection(reason);
    });

    this.socket.on('connect_error', (error) => {
      this.handleConnectionError(error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.handleReconnectSuccess(attemptNumber);
    });

    this.socket.on('reconnect_error', (error) => {
      this.handleReconnectError(error);
    });

    this.socket.on('reconnect_failed', () => {
      this.handleReconnectFailed();
    });

    // Setup all expedition event listeners
    this.setupExpeditionEventListeners();
  }

  /**
   * Setup all expedition-specific event listeners
   */
  private setupExpeditionEventListeners(): void {
    if (!this.socket) return;

    // Expedition lifecycle events
    this.socket.on('expedition:started', (data) => this.handleEvent('expedition:started', data));
    this.socket.on('expedition:completed', (data) => this.handleEvent('expedition:completed', data));
    this.socket.on('expedition:failed', (data) => this.handleEvent('expedition:failed', data));
    this.socket.on('expedition:cancelled', (data) => this.handleEvent('expedition:cancelled', data));
    this.socket.on('expedition:paused', (data) => this.handleEvent('expedition:paused', data));
    this.socket.on('expedition:resumed', (data) => this.handleEvent('expedition:resumed', data));

    // Progress and status events
    this.socket.on('expedition:status-update', (data) => this.handleEvent('expedition:status-update', data));
    this.socket.on('expedition:workflow-progress', (data) => this.handleEvent('expedition:workflow-progress', data));

    // Task events
    this.socket.on('expedition:task-assigned', (data) => this.handleEvent('expedition:task-assigned', data));
    this.socket.on('expedition:task-completed', (data) => this.handleEvent('expedition:task-completed', data));
    this.socket.on('expedition:task-progress', (data) => this.handleEvent('expedition:task-progress', data));

    // Agent events
    this.socket.on('expedition:agent-assigned', (data) => this.handleEvent('expedition:agent-assigned', data));
    this.socket.on('expedition:agent-status', (data) => this.handleEvent('expedition:agent-status', data));

    // Messaging events
    this.socket.on('expedition:message', (data) => this.handleEvent('expedition:message', data));
    this.socket.on('expedition:typing-start', (data) => this.handleTypingStart(data));
    this.socket.on('expedition:typing-stop', (data) => this.handleTypingStop(data));

    // Phase and workflow events
    this.socket.on('expedition:phase-change', (data) => this.handleEvent('expedition:phase-change', data));
    this.socket.on('expedition:result-available', (data) => this.handleEvent('expedition:result-available', data));

    // Error events
    this.socket.on('expedition:error', (data) => this.handleEvent('expedition:error', data));
  }

  /**
   * Handle incoming events with debouncing and performance monitoring
   */
  private handleEvent(eventName: string, data: any): void {
    this.connectionMetrics.eventCount++;
    this.connectionMetrics.lastPing = Date.now();

    // Add to event history
    this.addToEventHistory(eventName, data);

    // Handle event debouncing for high-frequency events
    if (this.config.enableEventDebouncing && this.isHighFrequencyEvent(eventName)) {
      this.debounceEvent(eventName, data);
    } else {
      this.emitToListeners(eventName, data);
    }
  }

  /**
   * Handle typing start events with automatic timeout
   */
  private handleTypingStart(data: any): void {
    if (!this.config.enableTypingIndicators) return;

    const typingKey = `${data.expeditionId}-${data.userId || data.agentId}`;
    
    // Clear existing timer
    if (this.typingTimers.has(typingKey)) {
      clearTimeout(this.typingTimers.get(typingKey)!);
    }

    // Emit typing start
    this.emitToListeners('expedition:typing-start', data);

    // Set auto-stop timer
    const timer = setTimeout(() => {
      this.emitToListeners('expedition:typing-stop', data);
      this.typingTimers.delete(typingKey);
    }, this.config.typingTimeout);

    this.typingTimers.set(typingKey, timer);
  }

  /**
   * Handle typing stop events
   */
  private handleTypingStop(data: any): void {
    if (!this.config.enableTypingIndicators) return;

    const typingKey = `${data.expeditionId}-${data.userId || data.agentId}`;
    
    // Clear timer if exists
    if (this.typingTimers.has(typingKey)) {
      clearTimeout(this.typingTimers.get(typingKey)!);
      this.typingTimers.delete(typingKey);
    }

    this.emitToListeners('expedition:typing-stop', data);
  }

  /**
   * Debounce high-frequency events to prevent UI thrashing
   */
  private debounceEvent(eventName: string, data: any): void {
    const debounceKey = `${eventName}-${data.expeditionId}`;
    
    if (this.eventDebounceTimers.has(debounceKey)) {
      clearTimeout(this.eventDebounceTimers.get(debounceKey)!);
    }

    const timer = setTimeout(() => {
      this.emitToListeners(eventName, data);
      this.eventDebounceTimers.delete(debounceKey);
    }, this.config.debounceDelay);

    this.eventDebounceTimers.set(debounceKey, timer);
  }

  /**
   * Check if an event is high-frequency and should be debounced
   */
  private isHighFrequencyEvent(eventName: string): boolean {
    return [
      'expedition:task-progress',
      'expedition:workflow-progress',
      'expedition:agent-status'
    ].includes(eventName);
  }

  /**
   * Emit event to all registered listeners
   */
  private emitToListeners(eventName: string, data: any): void {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[EXPEDITION SOCKET] Error in event listener for ${eventName}:`, error);
        }
      });
    }
  }

  /**
   * Add event to history for debugging and monitoring
   */
  private addToEventHistory(eventName: string, data: any): void {
    this.eventHistory.push({
      event: eventName,
      data,
      timestamp: Date.now()
    });

    // Trim history if it exceeds max size
    if (this.eventHistory.length > this.config.maxEventHistory) {
      this.eventHistory = this.eventHistory.slice(-this.config.maxEventHistory);
    }
  }

  /**
   * Initialize performance monitoring
   */
  private initializePerformanceMonitoring(): void {
    if (!this.config.enablePerformanceMonitoring || typeof PerformanceObserver === 'undefined') {
      return;
    }

    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.name.includes('expedition-socket')) {
            console.debug('[EXPEDITION SOCKET] Performance:', entry);
          }
        });
      });

      this.performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
    } catch (error) {
      console.warn('[EXPEDITION SOCKET] Performance monitoring not available:', error);
    }
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnection(): void {
    if (this.connectionMetrics.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[EXPEDITION SOCKET] Max reconnection attempts reached');
      this.connectionMetrics.connectionQuality = 'disconnected';
      return;
    }

    this.connectionMetrics.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.connectionMetrics.reconnectAttempts - 1);

    console.log(`[EXPEDITION SOCKET] Reconnecting in ${delay}ms (attempt ${this.connectionMetrics.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Enhanced connection event handlers with circuit breaker pattern
   */
  private handleSuccessfulConnection(): void {
    this.connectionMetrics.isConnected = true;
    this.connectionMetrics.connectionQuality = 'excellent';
    this.connectionMetrics.reconnectAttempts = 0;
    this.connectionMetrics.failureCount = 0;
    this.connectionMetrics.circuitBreakerState = 'closed';
    this.connectionMetrics.lastError = undefined;
    this.connectionMetrics.nextRetryTime = undefined;
    
    this.clearReconnectTimer();
    this.clearCircuitBreakerTimer();
    
    // Process offline queue
    this.processOfflineQueue();
    
    // Notify connection state listeners
    this.notifyConnectionStateChange();
    
    console.log('[EXPEDITION SOCKET] Connected successfully with enhanced recovery');
  }

  private handleDisconnection(reason: string): void {
    this.connectionMetrics.isConnected = false;
    this.connectionMetrics.connectionQuality = 'disconnected';
    this.connectionMetrics.lastError = `Disconnected: ${reason}`;
    
    // Notify connection state listeners
    this.notifyConnectionStateChange();
    
    console.log('[EXPEDITION SOCKET] Disconnected:', reason);
    
    // Only attempt reconnection for certain disconnect reasons
    if (this.config.enableReconnection && this.shouldAttemptReconnection(reason)) {
      this.handleReconnectionWithCircuitBreaker();
    }
  }

  private handleConnectionError(error: any): void {
    this.connectionMetrics.connectionQuality = 'poor';
    this.connectionMetrics.failureCount++;
    this.connectionMetrics.lastError = error.message || 'Connection error';
    this.connectionMetrics.lastFailureTime = Date.now();
    
    // Check circuit breaker threshold
    if (this.connectionMetrics.failureCount >= this.config.circuitBreakerFailureThreshold) {
      this.openCircuitBreaker();
    }
    
    // Notify connection state listeners
    this.notifyConnectionStateChange();
    
    console.error('[EXPEDITION SOCKET] Connection error:', error);
  }

  private handleReconnectSuccess(attemptNumber: number): void {
    console.log(`[EXPEDITION SOCKET] Reconnected successfully after ${attemptNumber} attempts`);
    this.handleSuccessfulConnection();
  }

  private handleReconnectError(error: any): void {
    this.connectionMetrics.failureCount++;
    this.connectionMetrics.lastError = error.message || 'Reconnection error';
    this.connectionMetrics.lastFailureTime = Date.now();
    
    console.error('[EXPEDITION SOCKET] Reconnection error:', error);
    
    // Check if we should open circuit breaker
    if (this.connectionMetrics.failureCount >= this.config.circuitBreakerFailureThreshold) {
      this.openCircuitBreaker();
    }
  }

  private handleReconnectFailed(): void {
    this.connectionMetrics.connectionQuality = 'disconnected';
    this.connectionMetrics.lastError = 'Reconnection failed - max attempts reached';
    
    // Open circuit breaker
    this.openCircuitBreaker();
    
    // Notify connection state listeners
    this.notifyConnectionStateChange();
    
    console.error('[EXPEDITION SOCKET] Reconnection failed - max attempts reached');
  }

  /**
   * Circuit breaker pattern implementation
   */
  private openCircuitBreaker(): void {
    this.connectionMetrics.circuitBreakerState = 'open';
    this.connectionMetrics.nextRetryTime = Date.now() + this.config.circuitBreakerTimeout;
    
    console.warn('[EXPEDITION SOCKET] Circuit breaker opened - suspending connection attempts');
    
    // Set timer to transition to half-open state
    this.circuitBreakerTimer = setTimeout(() => {
      this.connectionMetrics.circuitBreakerState = 'half-open';
      console.log('[EXPEDITION SOCKET] Circuit breaker half-open - allowing test connection');
      this.notifyConnectionStateChange();
    }, this.config.circuitBreakerTimeout);
  }

  private clearCircuitBreakerTimer(): void {
    if (this.circuitBreakerTimer) {
      clearTimeout(this.circuitBreakerTimer);
      this.circuitBreakerTimer = null;
    }
  }

  private shouldAttemptReconnection(reason: string): boolean {
    // Don't reconnect if circuit breaker is open
    if (this.connectionMetrics.circuitBreakerState === 'open') {
      return false;
    }
    
    // Don't reconnect for client-initiated disconnections
    const clientDisconnectReasons = [
      'io client disconnect',
      'client namespace disconnect',
      'transport close'
    ];
    
    return !clientDisconnectReasons.includes(reason);
  }

  private handleReconnectionWithCircuitBreaker(): void {
    // Check circuit breaker state
    if (this.connectionMetrics.circuitBreakerState === 'open') {
      console.log('[EXPEDITION SOCKET] Circuit breaker open - skipping reconnection attempt');
      return;
    }
    
    // Use existing reconnection logic but with enhanced backoff
    this.handleReconnectionWithExponentialBackoff();
  }

  private handleReconnectionWithExponentialBackoff(): void {
    if (this.connectionMetrics.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[EXPEDITION SOCKET] Max reconnection attempts reached');
      this.openCircuitBreaker();
      return;
    }

    this.connectionMetrics.reconnectAttempts++;
    
    // Calculate delay with exponential backoff and jitter
    const baseDelay = this.config.reconnectDelay;
    const backoffMultiplier = this.config.reconnectBackoffMultiplier;
    const maxDelay = this.config.maxReconnectDelay;
    
    let delay = Math.min(
      baseDelay * Math.pow(backoffMultiplier, this.connectionMetrics.reconnectAttempts - 1),
      maxDelay
    );
    
    // Add jitter to prevent thundering herd
    delay = delay + (Math.random() * 1000);

    console.log(`[EXPEDITION SOCKET] Reconnecting in ${Math.round(delay)}ms (attempt ${this.connectionMetrics.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        // For half-open circuit breaker, this is a test connection
        if (this.connectionMetrics.circuitBreakerState === 'half-open') {
          console.log('[EXPEDITION SOCKET] Testing connection in half-open circuit breaker state');
        }
        
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Offline queue management for graceful degradation
   */
  private queueOfflineOperation(method: string, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      if (this.offlineQueue.length >= this.config.offlineQueueSize) {
        // Remove oldest operation
        const removed = this.offlineQueue.shift();
        if (removed) {
          removed.reject(new Error('Operation expired - queue full'));
        }
      }
      
      this.offlineQueue.push({
        method,
        args,
        timestamp: Date.now(),
        resolve,
        reject
      });
      
      console.log(`[EXPEDITION SOCKET] Queued offline operation: ${method}`);
    });
  }

  private processOfflineQueue(): void {
    if (this.offlineQueue.length === 0) return;
    
    console.log(`[EXPEDITION SOCKET] Processing ${this.offlineQueue.length} queued operations`);
    
    const operations = [...this.offlineQueue];
    this.offlineQueue = [];
    
    operations.forEach(async (operation) => {
      try {
        // Check if operation is too old
        const age = Date.now() - operation.timestamp;
        if (age > 300000) { // 5 minutes
          operation.reject(new Error('Operation expired'));
          return;
        }
        
        // Execute the operation
        const result = await this.executeQueuedOperation(operation.method, operation.args);
        operation.resolve(result);
      } catch (error) {
        operation.reject(error);
      }
    });
  }

  private async executeQueuedOperation(method: string, args: any[]): Promise<any> {
    switch (method) {
      case 'joinExpedition':
        return this.joinExpedition(args[0]);
      case 'sendMessage':
        return this.sendMessage(args[0], args[1], args[2]);
      case 'startExpedition':
        return this.startExpedition(args[0]);
      case 'pauseExpedition':
        return this.pauseExpedition(args[0]);
      case 'cancelExpedition':
        return this.cancelExpedition(args[0]);
      default:
        throw new Error(`Unknown queued operation: ${method}`);
    }
  }

  /**
   * Connection state management
   */
  private notifyConnectionStateChange(): void {
    this.connectionStateListeners.forEach(listener => {
      try {
        listener(this.connectionMetrics);
      } catch (error) {
        console.error('[EXPEDITION SOCKET] Error in connection state listener:', error);
      }
    });
  }

  /**
   * Health check system
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private performHealthCheck(): void {
    if (!this.socket || !this.isInitialized) return;
    
    const now = Date.now();
    const lastPing = this.connectionMetrics.lastPing || 0;
    const timeSinceLastPing = now - lastPing;
    
    // Update connection quality based on ping times
    if (this.connectionMetrics.isConnected) {
      if (timeSinceLastPing < 5000) {
        this.connectionMetrics.connectionQuality = 'excellent';
      } else if (timeSinceLastPing < 15000) {
        this.connectionMetrics.connectionQuality = 'good';
      } else if (timeSinceLastPing < 30000) {
        this.connectionMetrics.connectionQuality = 'poor';
      } else {
        // Connection might be stale
        this.connectionMetrics.connectionQuality = 'poor';
        console.warn('[EXPEDITION SOCKET] Connection appears stale - no recent activity');
      }
    }
    
    // Emit ping to test connection
    if (this.socket.connected) {
      this.socket.emit('ping');
    }
  }

  // Public API methods

  /**
   * Join an expedition room with offline queue support
   */
  async joinExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Socket not initialized');
      return false;
    }

    if (this.joinedRooms.has(expeditionId)) {
      console.log(`[EXPEDITION SOCKET] Already joined expedition: ${expeditionId}`);
      return true;
    }

    // If not connected and graceful degradation is enabled, queue the operation
    if (!this.socket.connected && this.config.enableGracefulDegradation) {
      console.log(`[EXPEDITION SOCKET] Queueing join expedition: ${expeditionId}`);
      return this.queueOfflineOperation('joinExpedition', [expeditionId]);
    }

    if (!this.socket.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot join expedition - not connected');
      return false;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Join expedition timeout'));
      }, 10000);

      try {
        this.socket!.emit('expedition:join', expeditionId);
        this.joinedRooms.add(expeditionId);
        
        // Wait a bit for the join to complete
        setTimeout(() => {
          clearTimeout(timeout);
          console.log(`[EXPEDITION SOCKET] Joined expedition: ${expeditionId}`);
          resolve(true);
        }, 100);
      } catch (error) {
        clearTimeout(timeout);
        console.error(`[EXPEDITION SOCKET] Failed to join expedition: ${expeditionId}`, error);
        reject(error);
      }
    });
  }

  /**
   * Leave an expedition room
   */
  async leaveExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      return false;
    }

    if (!this.joinedRooms.has(expeditionId)) {
      return true;
    }

    return new Promise((resolve) => {
      this.socket!.emit('expedition:leave', expeditionId);
      this.joinedRooms.delete(expeditionId);
      
      setTimeout(() => {
        console.log(`[EXPEDITION SOCKET] Left expedition: ${expeditionId}`);
        resolve(true);
      }, 100);
    });
  }

  /**
   * Send a message with offline queue support
   */
  async sendMessage(expeditionId: string, message: string, messageType: string = 'user-input'): Promise<boolean> {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Socket not initialized');
      return false;
    }

    // If not connected and graceful degradation is enabled, queue the operation
    if (!this.socket.connected && this.config.enableGracefulDegradation) {
      console.log(`[EXPEDITION SOCKET] Queueing send message: ${expeditionId}`);
      return this.queueOfflineOperation('sendMessage', [expeditionId, message, messageType]);
    }

    if (!this.socket.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot send message - not connected');
      return false;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Send message timeout'));
      }, 15000);

      try {
        this.socket!.emit('expedition:send-message', { expeditionId, message, messageType });
        
        // Wait a bit to ensure message was sent
        setTimeout(() => {
          clearTimeout(timeout);
          resolve(true);
        }, 100);
      } catch (error) {
        clearTimeout(timeout);
        console.error('[EXPEDITION SOCKET] Failed to send message:', error);
        reject(error);
      }
    });
  }

  /**
   * Start typing indicator
   */
  startTyping(expeditionId: string): void {
    if (this.socket?.connected && this.config.enableTypingIndicators) {
      this.socket.emit('expedition:typing-start', { expeditionId });
    }
  }

  /**
   * Stop typing indicator
   */
  stopTyping(expeditionId: string): void {
    if (this.socket?.connected && this.config.enableTypingIndicators) {
      this.socket.emit('expedition:typing-stop', { expeditionId });
    }
  }

  /**
   * Start an expedition with offline queue support
   */
  async startExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Socket not initialized');
      return false;
    }

    // If not connected and graceful degradation is enabled, queue the operation
    if (!this.socket.connected && this.config.enableGracefulDegradation) {
      console.log(`[EXPEDITION SOCKET] Queueing start expedition: ${expeditionId}`);
      return this.queueOfflineOperation('startExpedition', [expeditionId]);
    }

    if (!this.socket.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot start expedition - not connected');
      return false;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Start expedition timeout'));
      }, 15000);

      try {
        this.socket!.emit('expedition:start', expeditionId);
        
        setTimeout(() => {
          clearTimeout(timeout);
          resolve(true);
        }, 100);
      } catch (error) {
        clearTimeout(timeout);
        console.error('[EXPEDITION SOCKET] Failed to start expedition:', error);
        reject(error);
      }
    });
  }

  /**
   * Pause an expedition with offline queue support
   */
  async pauseExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Socket not initialized');
      return false;
    }

    // If not connected and graceful degradation is enabled, queue the operation
    if (!this.socket.connected && this.config.enableGracefulDegradation) {
      console.log(`[EXPEDITION SOCKET] Queueing pause expedition: ${expeditionId}`);
      return this.queueOfflineOperation('pauseExpedition', [expeditionId]);
    }

    if (!this.socket.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot pause expedition - not connected');
      return false;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Pause expedition timeout'));
      }, 15000);

      try {
        this.socket!.emit('expedition:pause', expeditionId);
        
        setTimeout(() => {
          clearTimeout(timeout);
          resolve(true);
        }, 100);
      } catch (error) {
        clearTimeout(timeout);
        console.error('[EXPEDITION SOCKET] Failed to pause expedition:', error);
        reject(error);
      }
    });
  }

  /**
   * Cancel an expedition with offline queue support
   */
  async cancelExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Socket not initialized');
      return false;
    }

    // If not connected and graceful degradation is enabled, queue the operation
    if (!this.socket.connected && this.config.enableGracefulDegradation) {
      console.log(`[EXPEDITION SOCKET] Queueing cancel expedition: ${expeditionId}`);
      return this.queueOfflineOperation('cancelExpedition', [expeditionId]);
    }

    if (!this.socket.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot cancel expedition - not connected');
      return false;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Cancel expedition timeout'));
      }, 15000);

      try {
        this.socket!.emit('expedition:cancel', expeditionId);
        
        setTimeout(() => {
          clearTimeout(timeout);
          resolve(true);
        }, 100);
      } catch (error) {
        clearTimeout(timeout);
        console.error('[EXPEDITION SOCKET] Failed to cancel expedition:', error);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to an event
   */
  on<K extends keyof ExpeditionSocketEvents>(event: K, listener: ExpeditionSocketEvents[K]): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.eventListeners.delete(event);
        }
      }
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof ExpeditionSocketEvents>(event: K, listener?: ExpeditionSocketEvents[K]): void {
    if (listener) {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.eventListeners.delete(event);
        }
      }
    } else {
      this.eventListeners.delete(event);
    }
  }

  /**
   * Get connection metrics
   */
  getConnectionMetrics(): ConnectionMetrics {
    return {
      ...this.connectionMetrics,
      uptime: this.connectionMetrics.uptime ? Date.now() - this.connectionMetrics.uptime : 0
    };
  }

  /**
   * Get event history for debugging
   */
  getEventHistory(): Array<{ event: string; data: any; timestamp: number }> {
    return [...this.eventHistory];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connectionMetrics.isConnected;
  }

  /**
   * Check if joined to expedition room
   */
  isJoinedToExpedition(expeditionId: string): boolean {
    return this.joinedRooms.has(expeditionId);
  }

  /**
   * Get list of joined expeditions
   */
  getJoinedExpeditions(): string[] {
    return Array.from(this.joinedRooms);
  }

  /**
   * Enhanced connection state management methods
   */
  
  /**
   * Subscribe to connection state changes
   */
  onConnectionStateChange(listener: (state: ConnectionMetrics) => void): () => void {
    this.connectionStateListeners.add(listener);
    
    // Immediately notify with current state
    listener(this.connectionMetrics);
    
    // Return unsubscribe function
    return () => {
      this.connectionStateListeners.delete(listener);
    };
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    nextRetryTime?: number;
    timeUntilRetry?: number;
  } {
    const now = Date.now();
    return {
      state: this.connectionMetrics.circuitBreakerState,
      failureCount: this.connectionMetrics.failureCount,
      nextRetryTime: this.connectionMetrics.nextRetryTime,
      timeUntilRetry: this.connectionMetrics.nextRetryTime
        ? Math.max(0, this.connectionMetrics.nextRetryTime - now)
        : undefined
    };
  }

  /**
   * Get offline queue status
   */
  getOfflineQueueStatus(): {
    queueSize: number;
    maxQueueSize: number;
    oldestOperationAge?: number;
  } {
    const now = Date.now();
    const oldestOperation = this.offlineQueue[0];
    
    return {
      queueSize: this.offlineQueue.length,
      maxQueueSize: this.config.offlineQueueSize,
      oldestOperationAge: oldestOperation
        ? now - oldestOperation.timestamp
        : undefined
    };
  }

  /**
   * Force reconnection attempt (bypasses circuit breaker temporarily)
   */
  forceReconnect(): void {
    if (!this.socket) {
      console.warn('[EXPEDITION SOCKET] Cannot force reconnect - socket not initialized');
      return;
    }

    console.log('[EXPEDITION SOCKET] Forcing reconnection attempt');
    
    // Temporarily allow reconnection even if circuit breaker is open
    const originalState = this.connectionMetrics.circuitBreakerState;
    this.connectionMetrics.circuitBreakerState = 'half-open';
    
    // Clear existing timers
    this.clearReconnectTimer();
    this.clearCircuitBreakerTimer();
    
    // Attempt immediate reconnection
    if (!this.socket.connected) {
      this.socket.connect();
    }
    
    // Restore circuit breaker state if connection fails
    setTimeout(() => {
      if (!this.socket?.connected && this.connectionMetrics.circuitBreakerState === 'half-open') {
        this.connectionMetrics.circuitBreakerState = originalState;
        this.notifyConnectionStateChange();
      }
    }, 5000);
  }

  /**
   * Clear offline queue (useful for cleanup or when operations are no longer relevant)
   */
  clearOfflineQueue(): void {
    const queueSize = this.offlineQueue.length;
    
    // Reject all queued operations
    this.offlineQueue.forEach(operation => {
      operation.reject(new Error('Queue cleared'));
    });
    
    this.offlineQueue = [];
    
    console.log(`[EXPEDITION SOCKET] Cleared ${queueSize} queued operations`);
  }

  /**
   * Reset circuit breaker (useful for manual recovery)
   */
  resetCircuitBreaker(): void {
    this.connectionMetrics.circuitBreakerState = 'closed';
    this.connectionMetrics.failureCount = 0;
    this.connectionMetrics.lastFailureTime = undefined;
    this.connectionMetrics.nextRetryTime = undefined;
    
    this.clearCircuitBreakerTimer();
    this.notifyConnectionStateChange();
    
    console.log('[EXPEDITION SOCKET] Circuit breaker reset');
  }

  /**
   * Get health status summary
   */
  getHealthStatus(): {
    isHealthy: boolean;
    connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check connection status
    if (!this.connectionMetrics.isConnected) {
      issues.push('Not connected to server');
      recommendations.push('Check network connection');
    }
    
    // Check circuit breaker
    if (this.connectionMetrics.circuitBreakerState === 'open') {
      issues.push('Circuit breaker is open');
      recommendations.push('Wait for automatic retry or use forceReconnect()');
    }
    
    // Check failure count
    if (this.connectionMetrics.failureCount > 0) {
      issues.push(`${this.connectionMetrics.failureCount} recent failures`);
      if (this.connectionMetrics.failureCount >= this.config.circuitBreakerFailureThreshold - 1) {
        recommendations.push('Connection is unstable - circuit breaker may open soon');
      }
    }
    
    // Check offline queue
    if (this.offlineQueue.length > this.config.offlineQueueSize * 0.8) {
      issues.push('Offline queue is nearly full');
      recommendations.push('Clear old operations or improve connection stability');
    }
    
    // Check connection quality
    const now = Date.now();
    const lastPing = this.connectionMetrics.lastPing || 0;
    const timeSinceLastPing = now - lastPing;
    
    if (this.connectionMetrics.isConnected && timeSinceLastPing > 30000) {
      issues.push('Connection appears stale');
      recommendations.push('Check for network issues or server problems');
    }
    
    return {
      isHealthy: issues.length === 0,
      connectionQuality: this.connectionMetrics.connectionQuality,
      issues,
      recommendations
    };
  }

  /**
   * Enhanced cleanup and disconnect
   */
  cleanup(): void {
    console.log('[EXPEDITION SOCKET] Starting enhanced cleanup...');
    
    // Clear all timers
    this.typingTimers.forEach(timer => clearTimeout(timer));
    this.typingTimers.clear();
    
    this.eventDebounceTimers.forEach(timer => clearTimeout(timer));
    this.eventDebounceTimers.clear();
    
    this.clearReconnectTimer();
    this.clearCircuitBreakerTimer();
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Clear offline queue
    this.clearOfflineQueue();

    // Cleanup performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    // Clear event listeners and connection state listeners
    this.eventListeners.clear();
    this.connectionStateListeners.clear();
    this.joinedRooms.clear();
    this.eventHistory = [];
    
    // Reset connection metrics
    this.connectionMetrics = {
      isConnected: false,
      connectionQuality: 'disconnected',
      eventCount: 0,
      uptime: 0,
      reconnectAttempts: 0,
      circuitBreakerState: 'closed',
      failureCount: 0
    };
    
    this.isInitialized = false;

    console.log('[EXPEDITION SOCKET] Enhanced cleanup completed successfully');
  }
}

export default ExpeditionSocketClient;