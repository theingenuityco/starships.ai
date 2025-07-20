/**
 * Task Execution Engine
 * 
 * Handles parallel task execution, progress monitoring, and coordination
 * between agents during expedition execution.
 */

import { Observable, Subject, BehaviorSubject, merge, timer } from 'rxjs';
import { map, filter, takeUntil, timeout, catchError } from 'rxjs/operators';
import { TaskBreakdown, ChatRequest } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { chat } from '../index';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import {
  TaskExecution,
  CompletedTask,
  AgentAssignment,
  TaskExecutionOptions,
  FirstOfficerConfig
} from './types';

export class TaskExecutor {
  private config: FirstOfficerConfig;
  private memoryStore: LangChainMemoryStore;
  private activeExecutions: Map<string, TaskExecution> = new Map();
  private executionSubjects: Map<string, Subject<TaskExecution>> = new Map();
  private completionSubject = new Subject<CompletedTask>();
  private stopSubject = new Subject<void>();

  constructor(config: FirstOfficerConfig, memoryStore: LangChainMemoryStore) {
    this.config = config;
    this.memoryStore = memoryStore;
  }

  /**
   * Execute tasks with assigned agents
   */
  async executeTasks(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions = {}
  ): Promise<Observable<CompletedTask>> {
    console.log(`🚀 [TASK-EXECUTOR] Starting execution of ${tasks.length} tasks`);

    // Create execution plan
    const executionPlan = this.createExecutionPlan(tasks, assignments);
    
    // Start task executions
    for (const execution of executionPlan) {
      if (options.parallelExecution || this.canExecuteInParallel(execution, tasks)) {
        this.startTaskExecution(execution, expeditionId, userId, options);
      } else {
        // Sequential execution - wait for dependencies
        this.scheduleTaskExecution(execution, tasks, expeditionId, userId, options);
      }
    }

    // Monitor progress
    this.startProgressMonitoring();

    return this.completionSubject.asObservable();
  }

  /**
   * Create execution plan from tasks and assignments
   */
  private createExecutionPlan(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[]
  ): TaskExecution[] {
    const executions: TaskExecution[] = [];
    
    for (const assignment of assignments) {
      for (const taskId of assignment.assignedTasks) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          const execution: TaskExecution = {
            taskId: task.id,
            agentId: assignment.agentId,
            status: 'pending',
            startTime: new Date().toISOString(),
            estimatedCompletion: this.calculateEstimatedCompletion(task),
            progress: 0,
            intermediateResults: [],
            issues: []
          };
          
          executions.push(execution);
          this.activeExecutions.set(taskId, execution);
        }
      }
    }
    
    return executions;
  }

  /**
   * Check if task can be executed in parallel
   */
  private canExecuteInParallel(execution: TaskExecution, tasks: TaskBreakdown[]): boolean {
    const task = tasks.find(t => t.id === execution.taskId);
    if (!task) return false;
    
    // Check if all dependencies are completed
    return task.dependencies.every(depId => {
      const depExecution = this.activeExecutions.get(depId);
      return depExecution?.status === 'completed';
    });
  }

  /**
   * Start task execution immediately
   */
  private async startTaskExecution(
    execution: TaskExecution,
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`▶️ [TASK-EXECUTOR] Starting task: ${execution.taskId} with agent: ${execution.agentId}`);
    
    execution.status = 'in-progress';
    execution.startTime = new Date().toISOString();
    
    // Create execution subject for this task
    const executionSubject = new Subject<TaskExecution>();
    this.executionSubjects.set(execution.taskId, executionSubject);
    
    try {
      // Execute task with timeout
      const timeoutMs = (options.timeout || this.config.timeoutMinutes) * 60 * 1000;
      
      const result = await Promise.race([
        this.executeTaskWithAgent(execution, expeditionId, userId),
        this.createTimeoutPromise(timeoutMs)
      ]);
      
      // Handle successful completion
      await this.handleTaskCompletion(execution, result, expeditionId);
      
    } catch (error) {
      console.error(`❌ [TASK-EXECUTOR] Task execution failed:`, error);
      await this.handleTaskError(execution, error, options);
    }
  }

  /**
   * Schedule task execution after dependencies complete
   */
  private scheduleTaskExecution(
    execution: TaskExecution,
    tasks: TaskBreakdown[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): void {
    const task = tasks.find(t => t.id === execution.taskId);
    if (!task) return;
    
    // Wait for dependencies to complete
    const dependencyObservables = task.dependencies.map(depId =>
      this.completionSubject.pipe(
        filter((completed: CompletedTask) => completed.taskId === depId)
      )
    );
    
    if (dependencyObservables.length > 0) {
      merge(...dependencyObservables).pipe(
        takeUntil(this.stopSubject)
      ).subscribe(() => {
        if (this.canExecuteInParallel(execution, tasks)) {
          this.startTaskExecution(execution, expeditionId, userId, options);
        }
      });
    } else {
      // No dependencies, start immediately
      this.startTaskExecution(execution, expeditionId, userId, options);
    }
  }

  /**
   * Execute task with assigned agent
   */
  private async executeTaskWithAgent(
    execution: TaskExecution,
    expeditionId: string,
    userId: string
  ): Promise<string> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.findById(execution.taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${execution.taskId}`);
    }
    
    // Build task instruction for agent
    const taskInstruction = this.buildTaskInstruction(task, execution);
    
    // Create chat request
    const chatRequest: ChatRequest = {
      agent_id: execution.agentId,
      user_id: userId,
      channel_id: `expedition-${expeditionId}-task-${execution.taskId}`,
      message: taskInstruction,
      stream: false
    };
    
    // Execute task through agent
    console.log(`💬 [TASK-EXECUTOR] Sending task to agent: ${execution.agentId}`);
    const response = await chat(chatRequest, this.memoryStore);
    
    // Update task progress
    execution.progress = 100;
    execution.intermediateResults?.push(response.reply);
    
    return response.reply;
  }

  /**
   * Build task instruction for agent
   */
  private buildTaskInstruction(task: any, execution: TaskExecution): string {
    return `
EXPEDITION TASK ASSIGNMENT

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

REQUIREMENTS:
- Required Skills: ${task.requiredSkills.join(', ')}
- Expected Deliverable: ${task.deliverable}
- Estimated Effort: ${task.estimatedEffort || 'Not specified'} minutes

INSTRUCTIONS:
1. Carefully read and understand the task requirements
2. Apply your specialized skills to complete the task
3. Ensure your response matches the expected deliverable format
4. Provide a comprehensive and high-quality result
5. If you encounter any issues or need clarification, explain them clearly

Please complete this task to the best of your abilities. Your response will be evaluated for quality and completeness.
`;
  }

  /**
   * Handle successful task completion
   */
  private async handleTaskCompletion(
    execution: TaskExecution,
    result: string,
    expeditionId: string
  ): Promise<void> {
    console.log(`✅ [TASK-EXECUTOR] Task completed: ${execution.taskId}`);
    
    execution.status = 'completed';
    const completionTime = new Date().toISOString();
    const actualDuration = this.calculateActualDuration(execution.startTime, completionTime);
    
    // Update task in database
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    await taskRepo.updateStatus(execution.taskId, 'completed');
    await taskRepo.updateResult(execution.taskId, result);
    
    // Create completed task
    const completedTask: CompletedTask = {
      taskId: execution.taskId,
      agentId: execution.agentId,
      result,
      completionTime,
      actualDuration
    };
    
    // Notify completion
    this.completionSubject.next(completedTask);
    
    // Clean up
    this.activeExecutions.delete(execution.taskId);
    const subject = this.executionSubjects.get(execution.taskId);
    if (subject) {
      subject.complete();
      this.executionSubjects.delete(execution.taskId);
    }
  }

  /**
   * Handle task execution error
   */
  private async handleTaskError(
    execution: TaskExecution,
    error: any,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.error(`❌ [TASK-EXECUTOR] Task failed: ${execution.taskId}`, error);
    
    execution.status = 'failed';
    execution.issues?.push(error instanceof Error ? error.message : 'Unknown error');
    
    // Update task status in database
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    await taskRepo.updateStatus(execution.taskId, 'failed');
    
    // Check if retry is possible
    const retryLimit = options.retryLimit || this.config.maxRetries;
    const currentRetries = execution.issues?.length || 0;
    
    if (currentRetries < retryLimit) {
      console.log(`🔄 [TASK-EXECUTOR] Retrying task: ${execution.taskId} (attempt ${currentRetries + 1})`);
      // Reset execution for retry
      execution.status = 'pending';
      execution.progress = 0;
      // Note: Actual retry logic would be handled by the First Officer workflow
    }
    
    // Clean up if no more retries
    if (currentRetries >= retryLimit) {
      this.activeExecutions.delete(execution.taskId);
      const subject = this.executionSubjects.get(execution.taskId);
      if (subject) {
        subject.error(error);
        this.executionSubjects.delete(execution.taskId);
      }
    }
  }

  /**
   * Start progress monitoring
   */
  private startProgressMonitoring(): void {
    // Monitor progress every 30 seconds
    timer(0, 30000).pipe(
      takeUntil(this.stopSubject)
    ).subscribe(() => {
      this.updateExecutionProgress();
    });
  }

  /**
   * Update execution progress for all active tasks
   */
  private updateExecutionProgress(): void {
    for (const [taskId, execution] of this.activeExecutions) {
      if (execution.status === 'in-progress') {
        // Estimate progress based on elapsed time
        const elapsed = Date.now() - new Date(execution.startTime).getTime();
        const estimated = execution.estimatedCompletion ? 
          new Date(execution.estimatedCompletion).getTime() - new Date(execution.startTime).getTime() : 
          30 * 60 * 1000; // Default 30 minutes
        
        const progressEstimate = Math.min(90, (elapsed / estimated) * 100);
        execution.progress = Math.max(execution.progress || 0, progressEstimate);
        
        // Emit progress update
        const subject = this.executionSubjects.get(taskId);
        if (subject) {
          subject.next({ ...execution });
        }
      }
    }
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(task: TaskBreakdown): string {
    const estimatedMinutes = task.estimatedEffort || 30; // Default 30 minutes
    const completionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return completionTime.toISOString();
  }

  /**
   * Calculate actual duration in minutes
   */
  private calculateActualDuration(startTime: string, endTime: string): number {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Math.round((end - start) / (1000 * 60));
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task execution timeout after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): TaskExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Stop all task executions
   */
  stopAllExecutions(): void {
    console.log('🛑 [TASK-EXECUTOR] Stopping all task executions');
    this.stopSubject.next();
    
    // Complete all execution subjects
    for (const subject of this.executionSubjects.values()) {
      subject.complete();
    }
    
    this.activeExecutions.clear();
    this.executionSubjects.clear();
  }

  /**
   * Get execution observable for a specific task
   */
  getTaskExecutionObservable(taskId: string): Observable<TaskExecution> | null {
    const subject = this.executionSubjects.get(taskId);
    return subject ? subject.asObservable() : null;
  }
}