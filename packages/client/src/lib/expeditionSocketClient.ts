/**
 * Enhanced Expedition Socket Client
 * 
 * Provides comprehensive real-time WebSocket integration for expedition management
 * with automatic reconnection, event debouncing, and performance optimizations.
 */

import { Socket } from 'socket.io-client';

// Event types for expedition socket events
export interface ExpeditionSocketEvents {
  // Expedition lifecycle
  'expedition:started': (data: { expeditionId: string; timestamp: string }) => void;
  'expedition:completed': (data: { expeditionId: string; result: string; timestamp: string }) => void;
  'expedition:failed': (data: { expeditionId: string; error: string; timestamp: string }) => void;
  'expedition:cancelled': (data: { expeditionId: string; timestamp: string }) => void;
  'expedition:paused': (data: { expeditionId: string; timestamp: string }) => void;
  'expedition:resumed': (data: { expeditionId: string; timestamp: string }) => void;
  
  // Progress and status updates
  'expedition:status-update': (data: { expeditionId: string; progress: any; timestamp: string }) => void;
  'expedition:workflow-progress': (data: { expeditionId: string; phase: string; progress: number; timestamp: string }) => void;
  
  // Task management
  'expedition:task-assigned': (data: { expeditionId: string; taskId: string; agentId: string; timestamp: string }) => void;
  'expedition:task-completed': (data: { expeditionId: string; taskId: string; result: string; timestamp: string }) => void;
  'expedition:task-progress': (data: { expeditionId: string; taskId: string; progress: number; timestamp: string }) => void;
  
  // Agent management
  'expedition:agent-assigned': (data: { expeditionId: string; agentId: string; timestamp: string }) => void;
  'expedition:agent-status': (data: { expeditionId: string; agentId: string; status: string; timestamp: string }) => void;
  
  // Real-time messaging
  'expedition:message': (data: { expeditionId: string; role: string; content: string; userId?: string; agentId?: string; timestamp: string }) => void;
  'expedition:typing-start': (data: { expeditionId: string; userId?: string; agentId?: string; role: string; timestamp: string }) => void;
  'expedition:typing-stop': (data: { expeditionId: string; userId?: string; agentId?: string; role: string; timestamp: string }) => void;
  
  // Phase and workflow
  'expedition:phase-change': (data: { expeditionId: string; phase: string; data?: any; timestamp: string }) => void;
  'expedition:result-available': (data: { expeditionId: string; resultId: string; timestamp: string }) => void;
  
  // Error handling
  'expedition:error': (data: { expeditionId: string; error: string; timestamp: string; source?: string }) => void;
}

export interface ConnectionMetrics {
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
  lastPing?: number;
  eventCount: number;
  uptime: number;
  reconnectAttempts: number;
}

export interface ExpeditionSocketConfig {
  enableReconnection?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  enableEventDebouncing?: boolean;
  debounceDelay?: number;
  enablePerformanceMonitoring?: boolean;
  maxEventHistory?: number;
  enableTypingIndicators?: boolean;
  typingTimeout?: number;
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

  private constructor(config: ExpeditionSocketConfig = {}) {
    this.config = {
      enableReconnection: true,
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      enableEventDebouncing: true,
      debounceDelay: 100,
      enablePerformanceMonitoring: true,
      maxEventHistory: 1000,
      enableTypingIndicators: true,
      typingTimeout: 3000,
      ...config
    };

    this.connectionMetrics = {
      isConnected: false,
      connectionQuality: 'disconnected',
      eventCount: 0,
      uptime: 0,
      reconnectAttempts: 0
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
   * Initialize the socket connection
   */
  async initialize(baseSocket: Socket): Promise<void> {
    if (this.socket) {
      console.warn('[EXPEDITION SOCKET] Already initialized');
      return;
    }

    this.socket = baseSocket;
    this.setupEventListeners();
    this.connectionMetrics.uptime = Date.now();
    
    console.log('[EXPEDITION SOCKET] Initialized with comprehensive event handling');
  }

  /**
   * Setup comprehensive event listeners for all expedition events
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.connectionMetrics.isConnected = true;
      this.connectionMetrics.connectionQuality = 'excellent';
      this.connectionMetrics.reconnectAttempts = 0;
      this.clearReconnectTimer();
      console.log('[EXPEDITION SOCKET] Connected successfully');
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionMetrics.isConnected = false;
      this.connectionMetrics.connectionQuality = 'disconnected';
      console.log('[EXPEDITION SOCKET] Disconnected:', reason);
      
      if (this.config.enableReconnection && reason !== 'io client disconnect') {
        this.handleReconnection();
      }
    });

    this.socket.on('connect_error', (error) => {
      this.connectionMetrics.connectionQuality = 'poor';
      console.error('[EXPEDITION SOCKET] Connection error:', error);
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

  // Public API methods

  /**
   * Join an expedition room for real-time updates
   */
  async joinExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot join expedition - not connected');
      return false;
    }

    if (this.joinedRooms.has(expeditionId)) {
      console.log(`[EXPEDITION SOCKET] Already joined expedition: ${expeditionId}`);
      return true;
    }

    return new Promise((resolve) => {
      this.socket!.emit('expedition:join', expeditionId);
      this.joinedRooms.add(expeditionId);
      
      // Wait a bit for the join to complete
      setTimeout(() => {
        console.log(`[EXPEDITION SOCKET] Joined expedition: ${expeditionId}`);
        resolve(true);
      }, 100);
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
   * Send a message to an expedition
   */
  async sendMessage(expeditionId: string, message: string, messageType: string = 'user-input'): Promise<boolean> {
    if (!this.socket?.connected) {
      console.warn('[EXPEDITION SOCKET] Cannot send message - not connected');
      return false;
    }

    try {
      this.socket.emit('expedition:send-message', { expeditionId, message, messageType });
      return true;
    } catch (error) {
      console.error('[EXPEDITION SOCKET] Failed to send message:', error);
      return false;
    }
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
   * Start an expedition
   */
  async startExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      return false;
    }

    try {
      this.socket.emit('expedition:start', expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION SOCKET] Failed to start expedition:', error);
      return false;
    }
  }

  /**
   * Pause an expedition
   */
  async pauseExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      return false;
    }

    try {
      this.socket.emit('expedition:pause', expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION SOCKET] Failed to pause expedition:', error);
      return false;
    }
  }

  /**
   * Cancel an expedition
   */
  async cancelExpedition(expeditionId: string): Promise<boolean> {
    if (!this.socket?.connected) {
      return false;
    }

    try {
      this.socket.emit('expedition:cancel', expeditionId);
      return true;
    } catch (error) {
      console.error('[EXPEDITION SOCKET] Failed to cancel expedition:', error);
      return false;
    }
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
   * Cleanup and disconnect
   */
  cleanup(): void {
    // Clear all timers
    this.typingTimers.forEach(timer => clearTimeout(timer));
    this.typingTimers.clear();
    
    this.eventDebounceTimers.forEach(timer => clearTimeout(timer));
    this.eventDebounceTimers.clear();
    
    this.clearReconnectTimer();

    // Cleanup performance observer
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    // Clear event listeners
    this.eventListeners.clear();
    this.joinedRooms.clear();
    this.eventHistory = [];

    console.log('[EXPEDITION SOCKET] Cleaned up successfully');
  }
}

export default ExpeditionSocketClient;