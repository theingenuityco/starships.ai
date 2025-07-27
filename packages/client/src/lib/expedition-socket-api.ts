import SocketClient from './socket-client';
import type { 
  ExpeditionEvent, 
  ExpeditionEventType,
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult
} from '@starships/protocol';

/**
 * Expedition Socket API - Real-time event handling for expeditions
 * 
 * This module provides WebSocket-based real-time updates for expedition-related events
 * including status changes, task updates, messages, and agent activities.
 */

// Event listener types
export type ExpeditionEventListener = (event: ExpeditionEvent) => void;
export type StatusChangeListener = (expeditionId: string, newStatus: string, oldStatus?: string) => void;
export type TaskUpdateListener = (task: ExpeditionTask) => void;
export type MessageListener = (message: ExpeditionMessage) => void;
export type AgentActivityListener = (agentId: string, activity: any) => void;
export type ProgressUpdateListener = (expeditionId: string, progress: any) => void;

// Event subscription management
interface EventSubscriptions {
  all: Set<ExpeditionEventListener>;
  statusChange: Set<StatusChangeListener>;
  taskUpdate: Set<TaskUpdateListener>;
  message: Set<MessageListener>;
  agentActivity: Set<AgentActivityListener>;
  progressUpdate: Set<ProgressUpdateListener>;
  typingStart: Set<TypingListener>;
  typingStop: Set<TypingListener>;
}

type TypingListener = (agentId: string, agentName?: string) => void;

class ExpeditionSocketAPI {
  private static instance: ExpeditionSocketAPI;
  private socketClient: SocketClient;
  private subscriptions: Map<string, EventSubscriptions> = new Map(); // expeditionId -> subscriptions
  private globalSubscriptions: EventSubscriptions = {
    all: new Set(),
    statusChange: new Set(),
    taskUpdate: new Set(),
    message: new Set(),
    agentActivity: new Set(),
    progressUpdate: new Set(),
    typingStart: new Set(),
    typingStop: new Set()
  };
  private expeditionRooms: Set<string> = new Set();
  private eventHandlersSetup = false;

  private constructor() {
    this.socketClient = SocketClient.getInstance();
    // Note: Event handlers will be set up when joining rooms to ensure socket is connected
  }

  static getInstance(): ExpeditionSocketAPI {
    if (!ExpeditionSocketAPI.instance) {
      ExpeditionSocketAPI.instance = new ExpeditionSocketAPI();
    }
    return ExpeditionSocketAPI.instance;
  }

  /**
   * Setup global event handlers for expedition events
   */
  private setupEventHandlers() {
    // Prevent duplicate setup
    if (this.eventHandlersSetup) {
      console.log('[EXPEDITION-SOCKET] Event handlers already set up, skipping');
      return;
    }
    
    const socket = this.socketClient.getSocket();
    if (!socket) {
      console.warn('[EXPEDITION-SOCKET] Cannot setup event handlers - socket not available');
      return;
    }

    console.log('[EXPEDITION-SOCKET] Setting up event handlers for connected socket');
    this.eventHandlersSetup = true;

    // Handle expedition events
    socket.on('expedition:created', this.handleExpeditionEvent.bind(this, 'expedition:created'));
    socket.on('expedition:started', this.handleExpeditionEvent.bind(this, 'expedition:started'));
    socket.on('expedition:status-changed', this.handleExpeditionEvent.bind(this, 'expedition:status-changed'));
    socket.on('expedition:completed', this.handleExpeditionEvent.bind(this, 'expedition:completed'));
    socket.on('expedition:failed', this.handleExpeditionEvent.bind(this, 'expedition:failed'));
    
    // Handle task events
    socket.on('task:created', this.handleExpeditionEvent.bind(this, 'task:created'));
    socket.on('task:assigned', this.handleExpeditionEvent.bind(this, 'task:assigned'));
    socket.on('task:completed', this.handleExpeditionEvent.bind(this, 'task:completed'));
    
    // Handle message events - THIS IS THE CRITICAL ONE
    socket.on('message:sent', this.handleExpeditionEvent.bind(this, 'message:sent'));
    console.log('[EXPEDITION-SOCKET] ✅ Set up message:sent event listener');
    
    // Add test listener to see if we're receiving ANY message:sent events
    socket.on('message:sent', (data) => {
      console.log('[EXPEDITION-SOCKET] 🔥 RAW message:sent event received:', data);
    });
    
    // Handle streaming events
    socket.on('expedition:stream-start', this.handleStreamStart.bind(this));
    socket.on('expedition:stream-chunk', this.handleStreamChunk.bind(this));
    socket.on('expedition:stream-complete', this.handleStreamComplete.bind(this));
    socket.on('expedition:stream-error', this.handleStreamError.bind(this));
    console.log('[EXPEDITION-SOCKET] Set up streaming event listeners');
    
    // Handle agent events
    socket.on('agent:assigned', this.handleExpeditionEvent.bind(this, 'agent:assigned'));
    
    // Handle progress updates
    socket.on('expedition:progress', this.handleProgressUpdate.bind(this));
    
    // Handle agent activities
    socket.on('expedition:agent-activity', this.handleAgentActivity.bind(this));
    socket.on('agent:activity', this.handleAgentActivity.bind(this)); // Also listen for the direct event
    
    // Handle task events
    socket.on('task:start', (data: any) => {
      console.log('[EXPEDITION-SOCKET] Task start:', data);
      // Convert to agent activity for typing indicator
      this.handleAgentActivity({
        expeditionId: data.expeditionId,
        agentId: data.agentId,
        activity: `Started working on task ${data.taskId}`,
        timestamp: new Date().toISOString()
      });
    });
    
    // Handle typing events
    socket.on('agent:typing-start', (data: any) => {
      console.log('[EXPEDITION-SOCKET] Agent started typing:', data);
      this.notifyTypingStart(data.expeditionId, data.agentId, data.agentName);
    });
    
    socket.on('agent:typing-stop', (data: any) => {
      console.log('[EXPEDITION-SOCKET] Agent stopped typing:', data);
      this.notifyTypingStop(data.expeditionId, data.agentId);
    });
    
    // Handle tool usage
    socket.on('expedition:tool-usage', this.handleToolUsage.bind(this));
    
    // Handle sync required events
    socket.on('expedition:sync-required', (data: any) => {
      console.log('[EXPEDITION-SOCKET] Sync required:', data);
      this.handleExpeditionEvent('expedition:sync-required' as any, data);
    });
    
    // Handle disconnection to reset state
    socket.on('disconnect', () => {
      console.log('[EXPEDITION-SOCKET] Socket disconnected, resetting event handlers flag');
      this.eventHandlersSetup = false;
    });

    console.log('[EXPEDITION-SOCKET] Event handlers setup completed');
  }

  /**
   * Handle incoming expedition events
   */
  private handleExpeditionEvent(type: ExpeditionEventType, data: any) {
    const event: ExpeditionEvent = {
      type,
      expeditionId: data.expeditionId,
      data: data.data || data,
      timestamp: data.timestamp || new Date().toISOString(),
      userId: data.userId,
      agentId: data.agentId
    };

    console.log('[EXPEDITION-SOCKET] Received event:', type, event);
    console.log('[EXPEDITION-SOCKET] Raw data received:', data);

    // Notify all listeners for this expedition
    const expeditionSubs = this.subscriptions.get(event.expeditionId);
    if (expeditionSubs) {
      expeditionSubs.all.forEach(listener => listener(event));
    }

    // Notify global listeners
    this.globalSubscriptions.all.forEach(listener => listener(event));

    // Handle specific event types
    switch (type) {
      case 'expedition:status-changed':
        this.notifyStatusChange(event.expeditionId, data.newStatus, data.oldStatus);
        break;
      case 'task:created':
      case 'task:assigned':
      case 'task:completed':
        this.notifyTaskUpdate(data.task);
        break;
      case 'message:sent':
        // For message:sent events, the message is nested in data.message
        const message = data.message || data;
        console.log('[EXPEDITION-SOCKET] Processing message:', message);
        this.notifyMessage(message);
        break;
    }
  }

  /**
   * Handle progress updates
   */
  private handleProgressUpdate(data: any) {
    console.log('[EXPEDITION-SOCKET] Progress update:', data);
    
    const expeditionId = data.expeditionId;
    const progress = data.progress;

    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.progressUpdate.forEach(listener => listener(expeditionId, progress));
    }

    // Notify global listeners
    this.globalSubscriptions.progressUpdate.forEach(listener => listener(expeditionId, progress));
  }

  /**
   * Handle agent activity events
   */
  private handleAgentActivity(data: any) {
    console.log('[EXPEDITION-SOCKET] Agent activity:', data);
    
    const expeditionId = data.expeditionId;
    const agentId = data.agentId;
    const activity = data.activity;

    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.agentActivity.forEach(listener => listener(agentId, activity));
    }

    // Notify global listeners
    this.globalSubscriptions.agentActivity.forEach(listener => listener(agentId, activity));
  }

  /**
   * Handle tool usage events
   */
  private handleToolUsage(data: any) {
    console.log('[EXPEDITION-SOCKET] Tool usage:', data);
    
    // Tool usage is a specific type of agent activity
    this.handleAgentActivity({
      expeditionId: data.expeditionId,
      agentId: data.agentId,
      activity: {
        type: 'tool-usage',
        tool: data.tool,
        input: data.input,
        output: data.output,
        timestamp: data.timestamp
      }
    });
  }

  /**
   * Handle streaming start
   */
  private handleStreamStart(data: any) {
    console.log('[EXPEDITION-SOCKET] 🚀 Stream started:', data);
    
    // Notify streaming listeners
    const expeditionSubs = this.subscriptions.get(data.expeditionId);
    if (expeditionSubs) {
      expeditionSubs.all.forEach(listener => listener({
        type: 'expedition:stream-start' as any,
        expeditionId: data.expeditionId,
        data,
        timestamp: data.timestamp,
        userId: undefined,
        agentId: data.participantId
      }));
    }
  }

  /**
   * Handle streaming chunks
   */
  private handleStreamChunk(data: any) {
    console.log('[EXPEDITION-SOCKET] ⚡ Stream chunk:', data.content);
    
    // Notify streaming listeners
    const expeditionSubs = this.subscriptions.get(data.expeditionId);
    if (expeditionSubs) {
      expeditionSubs.all.forEach(listener => listener({
        type: 'expedition:stream-chunk' as any,
        expeditionId: data.expeditionId,
        data,
        timestamp: data.timestamp,
        userId: undefined,
        agentId: data.participantId
      }));
    }
  }

  /**
   * Handle streaming complete
   */
  private handleStreamComplete(data: any) {
    console.log('[EXPEDITION-SOCKET] ✅ Stream completed:', data);
    
    // Notify streaming listeners
    const expeditionSubs = this.subscriptions.get(data.expeditionId);
    if (expeditionSubs) {
      expeditionSubs.all.forEach(listener => listener({
        type: 'expedition:stream-complete' as any,
        expeditionId: data.expeditionId,
        data,
        timestamp: data.timestamp,
        userId: undefined,
        agentId: data.participantId
      }));
    }

    // Also add the final message to regular message listeners
    if (data.message) {
      this.notifyMessage(data.message);
    }
  }

  /**
   * Handle streaming error
   */
  private handleStreamError(data: any) {
    console.error('[EXPEDITION-SOCKET] Stream error:', data);
    
    // Notify streaming listeners
    const expeditionSubs = this.subscriptions.get(data.expeditionId);
    if (expeditionSubs) {
      expeditionSubs.all.forEach(listener => listener({
        type: 'expedition:stream-error' as any,
        expeditionId: data.expeditionId,
        data,
        timestamp: data.timestamp,
        userId: undefined,
        agentId: data.participantId
      }));
    }
  }

  /**
   * Notify status change listeners
   */
  private notifyStatusChange(expeditionId: string, newStatus: string, oldStatus?: string) {
    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.statusChange.forEach(listener => listener(expeditionId, newStatus, oldStatus));
    }

    // Notify global listeners
    this.globalSubscriptions.statusChange.forEach(listener => listener(expeditionId, newStatus, oldStatus));
  }

  /**
   * Notify task update listeners
   */
  private notifyTaskUpdate(task: ExpeditionTask) {
    const expeditionId = task.expeditionId;

    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.taskUpdate.forEach(listener => listener(task));
    }

    // Notify global listeners
    this.globalSubscriptions.taskUpdate.forEach(listener => listener(task));
  }

  /**
   * Notify message listeners
   */
  private notifyMessage(message: ExpeditionMessage) {
    const expeditionId = message.expeditionId;

    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.message.forEach(listener => listener(message));
    }

    // Notify global listeners
    this.globalSubscriptions.message.forEach(listener => listener(message));
  }

  /**
   * Handle progress update
   */
  private handleProgressUpdate(data: any) {
    console.log('[EXPEDITION-SOCKET] Progress update:', data);
    
    const expeditionId = data.expeditionId;
    
    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.progressUpdate.forEach(listener => listener(expeditionId, data));
    }

    // Notify global listeners
    this.globalSubscriptions.progressUpdate.forEach(listener => listener(expeditionId, data));
  }
  
  /**
   * Notify typing start listeners
   */
  private notifyTypingStart(expeditionId: string, agentId: string, agentName?: string) {
    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.typingStart.forEach(listener => listener(agentId, agentName));
    }

    // Notify global listeners
    this.globalSubscriptions.typingStart.forEach(listener => listener(agentId, agentName));
  }
  
  /**
   * Notify typing stop listeners
   */
  private notifyTypingStop(expeditionId: string, agentId: string) {
    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.typingStop.forEach(listener => listener(agentId));
    }

    // Notify global listeners
    this.globalSubscriptions.typingStop.forEach(listener => listener(agentId));
  }

  /**
   * Handle agent activity
   */
  private handleAgentActivity(data: any) {
    console.log('[EXPEDITION-SOCKET] Agent activity:', data);
    
    const expeditionId = data.expeditionId;
    const agentId = data.agentId;
    
    // Notify expedition-specific listeners
    const expeditionSubs = this.subscriptions.get(expeditionId);
    if (expeditionSubs) {
      expeditionSubs.agentActivity.forEach(listener => listener(agentId, data));
    }

    // Notify global listeners
    this.globalSubscriptions.agentActivity.forEach(listener => listener(agentId, data));
  }

  /**
   * Handle tool usage
   */
  private handleToolUsage(data: any) {
    console.log('[EXPEDITION-SOCKET] Tool usage:', data);
    
    // Handle as a general expedition event
    this.handleExpeditionEvent('expedition:tool-usage' as any, data);
  }

  /**
   * Join an expedition room for real-time updates
   */
  joinExpeditionRoom(expeditionId: string, userId: string) {
    const socket = this.socketClient.getSocket();
    if (!socket) {
      console.warn('[EXPEDITION-SOCKET] Cannot join room - socket not available');
      return;
    }

    const roomId = `expedition:${expeditionId}`;
    
    // If socket is not connected yet, wait for connection
    if (!socket.connected) {
      console.log('[EXPEDITION-SOCKET] Socket not connected yet, waiting for connection...');
      
      const onConnect = () => {
        console.log('[EXPEDITION-SOCKET] Socket connected, now joining room');
        this.setupEventHandlers();
        
        if (!this.expeditionRooms.has(roomId)) {
          console.log(`[EXPEDITION-SOCKET] 🚀 Joining expedition room after connection: ${roomId}`);
          socket.emit('expedition:join-room', { expeditionId, userId });
          this.expeditionRooms.add(roomId);
          console.log(`[EXPEDITION-SOCKET] ✅ Joined expedition room: ${roomId}`);
        }
        
        // Remove the connect listener after use
        socket.off('connect', onConnect);
      };
      
      socket.once('connect', onConnect);
      return;
    }

    // Socket is already connected, join immediately
    this.setupEventHandlers();

    if (!this.expeditionRooms.has(roomId)) {
      console.log(`[EXPEDITION-SOCKET] 🚀 Attempting to join expedition room: ${roomId}`);
      console.log(`[EXPEDITION-SOCKET] 🚀 User ID: ${userId}`);
      console.log(`[EXPEDITION-SOCKET] 🚀 Socket connected: ${socket.connected}, Socket ID: ${socket.id}`);
      
      socket.emit('expedition:join-room', { expeditionId, userId });
      this.expeditionRooms.add(roomId);
      console.log(`[EXPEDITION-SOCKET] ✅ Joined expedition room: ${roomId}`);
      console.log(`[EXPEDITION-SOCKET] ✅ Current rooms:`, Array.from(this.expeditionRooms));
    } else {
      console.log(`[EXPEDITION-SOCKET] ⚠️ Already in expedition room: ${roomId}`);
    }
  }

  /**
   * Leave an expedition room
   */
  leaveExpeditionRoom(expeditionId: string, userId: string) {
    const socket = this.socketClient.getSocket();
    if (!socket) return;

    const roomId = `expedition:${expeditionId}`;
    if (this.expeditionRooms.has(roomId)) {
      socket.emit('expedition:leave-room', { expeditionId, userId });
      this.expeditionRooms.delete(roomId);
      
      // Clean up subscriptions for this expedition
      this.subscriptions.delete(expeditionId);
      
      console.log(`[EXPEDITION-SOCKET] Left expedition room: ${roomId}`);
    }
  }

  /**
   * Subscribe to all events for a specific expedition
   */
  subscribeToExpedition(expeditionId: string, listener: ExpeditionEventListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.all.add(listener);

    return () => {
      subs.all.delete(listener);
    };
  }

  /**
   * Subscribe to status changes for a specific expedition
   */
  subscribeToStatusChanges(expeditionId: string, listener: StatusChangeListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.statusChange.add(listener);

    return () => {
      subs.statusChange.delete(listener);
    };
  }

  /**
   * Subscribe to task updates for a specific expedition
   */
  subscribeToTaskUpdates(expeditionId: string, listener: TaskUpdateListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.taskUpdate.add(listener);

    return () => {
      subs.taskUpdate.delete(listener);
    };
  }

  /**
   * Subscribe to messages for a specific expedition
   */
  subscribeToMessages(expeditionId: string, listener: MessageListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.message.add(listener);

    return () => {
      subs.message.delete(listener);
    };
  }

  /**
   * Subscribe to agent activities for a specific expedition
   */
  subscribeToAgentActivities(expeditionId: string, listener: AgentActivityListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.agentActivity.add(listener);

    return () => {
      subs.agentActivity.delete(listener);
    };
  }
  
  /**
   * Subscribe to typing start events for a specific expedition
   */
  subscribeToTypingStart(expeditionId: string, listener: TypingListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.typingStart.add(listener);

    return () => {
      subs.typingStart.delete(listener);
    };
  }
  
  /**
   * Subscribe to typing stop events for a specific expedition
   */
  subscribeToTypingStop(expeditionId: string, listener: TypingListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.typingStop.add(listener);

    return () => {
      subs.typingStop.delete(listener);
    };
  }

  /**
   * Subscribe to progress updates for a specific expedition
   */
  subscribeToProgressUpdates(expeditionId: string, listener: ProgressUpdateListener) {
    if (!this.subscriptions.has(expeditionId)) {
      this.subscriptions.set(expeditionId, {
        all: new Set(),
        statusChange: new Set(),
        taskUpdate: new Set(),
        message: new Set(),
        agentActivity: new Set(),
        progressUpdate: new Set(),
        typingStart: new Set(),
        typingStop: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.progressUpdate.add(listener);

    return () => {
      subs.progressUpdate.delete(listener);
    };
  }

  /**
   * Subscribe to global events (all expeditions)
   */
  subscribeToAllExpeditions(listener: ExpeditionEventListener) {
    this.globalSubscriptions.all.add(listener);
    return () => {
      this.globalSubscriptions.all.delete(listener);
    };
  }

  /**
   * Send a message via WebSocket
   */
  sendMessage(expeditionId: string, content: string, messageType: string = 'user-input', participantId?: string, enableStreaming: boolean = false): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socketClient.getSocket();
      if (!socket) {
        reject(new Error('Socket not connected'));
        return;
      }

      const messageData = {
        expeditionId,
        content: content.trim(),
        messageType,
        participantId,
        timestamp: new Date().toISOString(),
        enableStreaming
      };

      console.log('[EXPEDITION-SOCKET] Sending message with streaming:', enableStreaming);

      // Send message via WebSocket
      socket.emit('expedition:send-message', messageData, (response: any) => {
        if (response.success) {
          resolve();
        } else {
          reject(new Error(response.error || 'Failed to send message'));
        }
      });
    });
  }

  /**
   * Clean up all subscriptions
   */
  cleanup() {
    // Leave all expedition rooms
    this.expeditionRooms.forEach(roomId => {
      const expeditionId = roomId.replace('expedition:', '');
      this.leaveExpeditionRoom(expeditionId, '');
    });

    // Clear all subscriptions
    this.subscriptions.clear();
    this.globalSubscriptions = {
      all: new Set(),
      statusChange: new Set(),
      taskUpdate: new Set(),
      message: new Set(),
      agentActivity: new Set(),
      progressUpdate: new Set()
    };
  }
}

export const expeditionSocketAPI = ExpeditionSocketAPI.getInstance();
export default expeditionSocketAPI;