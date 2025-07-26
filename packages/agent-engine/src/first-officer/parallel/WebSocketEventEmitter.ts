/**
 * WebSocket Event Emitter for Parallel Execution
 * 
 * Handles real-time event emission for task execution updates
 */

import { EventEmitter } from 'events';
import { TaskStatus } from '@starships/protocol';

/**
 * WebSocket event types for parallel execution
 */
export interface ParallelExecutionEvents {
  // Expedition-level events
  'expedition:progress': {
    expeditionId: string;
    progress: number;
    completedTasks: number;
    totalTasks: number;
    throughput: number;
    estimatedTimeRemaining: number;
  };
  
  // Task group events
  'taskGroup:start': {
    expeditionId: string;
    groupId: string;
    taskCount: number;
    maxConcurrency: number;
  };
  
  'taskGroup:complete': {
    expeditionId: string;
    groupId: string;
    duration: number;
  };
  
  // Individual task events
  'task:start': {
    expeditionId: string;
    taskId: string;
    agentId: string;
    attempt: number;
  };
  
  'task:progress': {
    expeditionId: string;
    taskId: string;
    progress: number;
  };
  
  'task:complete': {
    expeditionId: string;
    taskId: string;
    result: string;
    duration: number;
  };
  
  'task:failed': {
    expeditionId: string;
    taskId: string;
    error: string;
  };
  
  'task:retry': {
    expeditionId: string;
    taskId: string;
    attempt: number;
    delay: number;
  };
  
  // Agent activity events
  'agent:activity': {
    expeditionId: string;
    agentId: string;
    activity: string;
    taskId?: string;
  };
  
  // Resource events
  'resource:allocated': {
    expeditionId: string;
    taskId: string;
    resources: Record<string, number>;
  };
  
  'resource:released': {
    expeditionId: string;
    taskId: string;
  };
  
  // Performance events
  'performance:bottleneck': {
    expeditionId: string;
    type: string;
    details: any;
  };
  
  'performance:optimization': {
    expeditionId: string;
    type: string;
    adjustment: any;
  };
}

/**
 * WebSocket event emitter for parallel execution
 */
export class WebSocketEventEmitter extends EventEmitter {
  private socketServer: any; // Socket.IO server instance
  
  constructor(socketServer?: any) {
    super();
    this.socketServer = socketServer;
  }

  /**
   * Set socket server instance
   */
  setSocketServer(socketServer: any): void {
    this.socketServer = socketServer;
  }

  /**
   * Emit expedition progress update
   */
  emitExpeditionProgress(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['expedition:progress'], 'expeditionId'>
  ): void {
    const event = 'expedition:progress';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit task group start
   */
  emitTaskGroupStart(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['taskGroup:start'], 'expeditionId'>
  ): void {
    const event = 'taskGroup:start';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit task group complete
   */
  emitTaskGroupComplete(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['taskGroup:complete'], 'expeditionId'>
  ): void {
    const event = 'taskGroup:complete';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit task start
   */
  emitTaskStart(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['task:start'], 'expeditionId'>
  ): void {
    const event = 'task:start';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
      
      // Also emit agent activity
      this.emitAgentActivity(expeditionId, {
        agentId: data.agentId,
        activity: `Started task ${data.taskId} (attempt ${data.attempt})`,
        taskId: data.taskId
      });
    }
  }

  /**
   * Emit task progress
   */
  emitTaskProgress(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['task:progress'], 'expeditionId'>
  ): void {
    const event = 'task:progress';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit task complete
   */
  emitTaskComplete(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['task:complete'], 'expeditionId'>
  ): void {
    const event = 'task:complete';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
      
      // Emit completion as task update
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit('task:updated', {
          expeditionId,
          taskId: data.taskId,
          status: 'completed' as TaskStatus,
          result: data.result
        });
    }
  }

  /**
   * Emit task failed
   */
  emitTaskFailed(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['task:failed'], 'expeditionId'>
  ): void {
    const event = 'task:failed';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
      
      // Emit failure as task update
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit('task:updated', {
          expeditionId,
          taskId: data.taskId,
          status: 'failed' as TaskStatus,
          error: data.error
        });
    }
  }

  /**
   * Emit task retry
   */
  emitTaskRetry(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['task:retry'], 'expeditionId'>
  ): void {
    const event = 'task:retry';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit agent activity
   */
  emitAgentActivity(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['agent:activity'], 'expeditionId'>
  ): void {
    const event = 'agent:activity';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit('expedition:agent-activity', payload);
    }
  }

  /**
   * Emit resource allocated
   */
  emitResourceAllocated(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['resource:allocated'], 'expeditionId'>
  ): void {
    const event = 'resource:allocated';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit resource released
   */
  emitResourceReleased(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['resource:released'], 'expeditionId'>
  ): void {
    const event = 'resource:released';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit performance bottleneck
   */
  emitPerformanceBottleneck(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['performance:bottleneck'], 'expeditionId'>
  ): void {
    const event = 'performance:bottleneck';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Emit performance optimization
   */
  emitPerformanceOptimization(
    expeditionId: string,
    data: Omit<ParallelExecutionEvents['performance:optimization'], 'expeditionId'>
  ): void {
    const event = 'performance:optimization';
    const payload = { expeditionId, ...data };
    
    this.emit(event, payload);
    
    if (this.socketServer) {
      this.socketServer
        .to(`expedition-${expeditionId}`)
        .emit(event, payload);
    }
  }

  /**
   * Batch emit multiple events
   */
  batchEmit(events: Array<{ type: string; expeditionId: string; data: any }>): void {
    events.forEach(({ type, expeditionId, data }) => {
      const methodName = `emit${type.charAt(0).toUpperCase() + type.slice(1)}`;
      if (typeof (this as any)[methodName] === 'function') {
        (this as any)[methodName](expeditionId, data);
      }
    });
  }
}