/**
 * Task Scheduler for Parallel Execution
 * 
 * Manages task scheduling, prioritization, and concurrency control
 */

import { TaskBreakdown } from '@starships/protocol';

interface ScheduledTask {
  task: TaskBreakdown;
  priority: number;
  scheduledAt: Date;
  startTime?: Date;
  dependencies: string[];
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
}

export class TaskScheduler {
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private taskQueue: ScheduledTask[] = [];
  private maxConcurrency: number = 5;
  private runningTasks: Set<string> = new Set();

  /**
   * Schedule tasks for execution
   */
  scheduleTasks(tasks: TaskBreakdown[], criticalPath: string[] = []): void {
    tasks.forEach(task => {
      const priority = this.calculatePriority(task, criticalPath);
      
      const scheduledTask: ScheduledTask = {
        task,
        priority,
        scheduledAt: new Date(),
        dependencies: task.dependencies || [],
        status: 'pending'
      };
      
      this.scheduledTasks.set(task.id, scheduledTask);
    });
    
    // Update task queue
    this.updateTaskQueue();
    
    console.log(`📅 [TASK-SCHEDULER] Scheduled ${tasks.length} tasks`);
  }

  /**
   * Get next available tasks that can be executed
   */
  getNextTasks(limit: number = this.maxConcurrency): TaskBreakdown[] {
    this.updateTaskQueue();
    
    const availableSlots = Math.max(0, limit - this.runningTasks.size);
    const readyTasks: TaskBreakdown[] = [];
    
    for (const scheduledTask of this.taskQueue) {
      if (readyTasks.length >= availableSlots) break;
      
      if (scheduledTask.status === 'ready' && !this.runningTasks.has(scheduledTask.task.id)) {
        readyTasks.push(scheduledTask.task);
        this.markTaskRunning(scheduledTask.task.id);
      }
    }
    
    return readyTasks;
  }

  /**
   * Mark task as running
   */
  markTaskRunning(taskId: string): void {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.status = 'running';
      scheduledTask.startTime = new Date();
      this.runningTasks.add(taskId);
    }
  }

  /**
   * Mark task as completed
   */
  markTaskCompleted(taskId: string): void {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.status = 'completed';
      this.runningTasks.delete(taskId);
      
      // Update dependent tasks
      this.updateDependentTasks(taskId);
      this.updateTaskQueue();
    }
  }

  /**
   * Mark task as failed
   */
  markTaskFailed(taskId: string): void {
    const scheduledTask = this.scheduledTasks.get(taskId);
    if (scheduledTask) {
      scheduledTask.status = 'failed';
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Increase concurrency limit
   */
  increaseConcurrency(increment: number): void {
    this.maxConcurrency += increment;
    console.log(`📈 [TASK-SCHEDULER] Increased concurrency to ${this.maxConcurrency}`);
  }

  /**
   * Adjust task priorities based on critical path
   */
  adjustPriorities(criticalPath: string[]): void {
    // Boost priority for critical path tasks
    criticalPath.forEach((taskId, index) => {
      const scheduledTask = this.scheduledTasks.get(taskId);
      if (scheduledTask) {
        scheduledTask.priority = 1000 - index; // Higher priority for earlier critical path tasks
      }
    });
    
    this.updateTaskQueue();
    console.log(`🎯 [TASK-SCHEDULER] Adjusted priorities for ${criticalPath.length} critical path tasks`);
  }

  /**
   * Calculate task priority
   */
  private calculatePriority(task: TaskBreakdown, criticalPath: string[]): number {
    let priority = 100; // Base priority
    
    // Critical path tasks get highest priority
    if (criticalPath.includes(task.id)) {
      priority += 500;
    }
    
    // Tasks with no dependencies get higher priority
    if (!task.dependencies || task.dependencies.length === 0) {
      priority += 200;
    }
    
    // Adjust based on estimated effort (shorter tasks first)
    const effort = task.estimatedEffort || 30;
    priority += Math.max(0, 100 - effort);
    
    return priority;
  }

  /**
   * Update task queue based on current state
   */
  private updateTaskQueue(): void {
    // Update task statuses
    this.scheduledTasks.forEach(scheduledTask => {
      if (scheduledTask.status === 'pending') {
        // Check if all dependencies are completed
        const allDependenciesCompleted = scheduledTask.dependencies.every(depId => {
          const dep = this.scheduledTasks.get(depId);
          return dep && dep.status === 'completed';
        });
        
        if (allDependenciesCompleted) {
          scheduledTask.status = 'ready';
        }
      }
    });
    
    // Sort tasks by priority and status
    this.taskQueue = Array.from(this.scheduledTasks.values())
      .filter(t => t.status === 'ready' || t.status === 'pending')
      .sort((a, b) => {
        // Ready tasks before pending
        if (a.status === 'ready' && b.status === 'pending') return -1;
        if (a.status === 'pending' && b.status === 'ready') return 1;
        
        // Then by priority
        return b.priority - a.priority;
      });
  }

  /**
   * Update dependent tasks when a task completes
   */
  private updateDependentTasks(completedTaskId: string): void {
    this.scheduledTasks.forEach(scheduledTask => {
      if (scheduledTask.dependencies.includes(completedTaskId)) {
        // Re-check if this task is now ready
        const allDependenciesCompleted = scheduledTask.dependencies.every(depId => {
          const dep = this.scheduledTasks.get(depId);
          return dep && dep.status === 'completed';
        });
        
        if (allDependenciesCompleted && scheduledTask.status === 'pending') {
          scheduledTask.status = 'ready';
          console.log(`✅ [TASK-SCHEDULER] Task ${scheduledTask.task.id} is now ready (dependencies met)`);
        }
      }
    });
  }

  /**
   * Get scheduler statistics
   */
  getStats() {
    const stats = {
      totalTasks: this.scheduledTasks.size,
      pending: 0,
      ready: 0,
      running: this.runningTasks.size,
      completed: 0,
      failed: 0,
      concurrency: `${this.runningTasks.size}/${this.maxConcurrency}`
    };
    
    this.scheduledTasks.forEach(task => {
      stats[task.status]++;
    });
    
    return stats;
  }

  /**
   * Get execution timeline
   */
  getExecutionTimeline() {
    return Array.from(this.scheduledTasks.values())
      .filter(t => t.startTime)
      .map(t => ({
        taskId: t.task.id,
        status: t.status,
        scheduledAt: t.scheduledAt,
        startTime: t.startTime,
        priority: t.priority
      }))
      .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime());
  }
}