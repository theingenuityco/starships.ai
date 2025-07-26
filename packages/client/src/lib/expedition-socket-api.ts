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
}

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
    progressUpdate: new Set()
  };
  private expeditionRooms: Set<string> = new Set();

  private constructor() {
    this.socketClient = SocketClient.getInstance();
    this.setupEventHandlers();
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
    const socket = this.socketClient.getSocket();
    if (!socket) return;

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
    
    // Handle message events
    socket.on('message:sent', this.handleExpeditionEvent.bind(this, 'message:sent'));
    
    // Handle agent events
    socket.on('agent:assigned', this.handleExpeditionEvent.bind(this, 'agent:assigned'));
    
    // Handle progress updates
    socket.on('expedition:progress', this.handleProgressUpdate.bind(this));
    
    // Handle agent activities
    socket.on('expedition:agent-activity', this.handleAgentActivity.bind(this));
    
    // Handle tool usage
    socket.on('expedition:tool-usage', this.handleToolUsage.bind(this));
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

    console.log('[EXPEDITION-SOCKET] Received event:', event);

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
        this.notifyMessage(data.message);
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
   * Join an expedition room for real-time updates
   */
  joinExpeditionRoom(expeditionId: string, userId: string) {
    const socket = this.socketClient.getSocket();
    if (!socket) {
      console.warn('[EXPEDITION-SOCKET] Cannot join room - not connected');
      return;
    }

    const roomId = `expedition:${expeditionId}`;
    if (!this.expeditionRooms.has(roomId)) {
      socket.emit('expedition:join-room', { expeditionId, userId });
      this.expeditionRooms.add(roomId);
      console.log(`[EXPEDITION-SOCKET] Joined expedition room: ${roomId}`);
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
        progressUpdate: new Set()
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
        progressUpdate: new Set()
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
        progressUpdate: new Set()
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
        progressUpdate: new Set()
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
        progressUpdate: new Set()
      });
    }
    
    const subs = this.subscriptions.get(expeditionId)!;
    subs.agentActivity.add(listener);

    return () => {
      subs.agentActivity.delete(listener);
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
        progressUpdate: new Set()
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