/**
 * Parallel Task Execution Framework
 * 
 * Advanced parallel execution system for agent tasks with:
 * - Concurrent task execution with dependency management
 * - Real-time progress tracking and WebSocket updates
 * - Resource pooling and allocation
 * - Failure isolation and recovery
 * - Performance monitoring and optimization
 */

import { Observable, Subject, BehaviorSubject, combineLatest, from, of, merge, EMPTY } from 'rxjs';
import { 
  map, 
  filter, 
  mergeMap, 
  concatMap, 
  catchError, 
  tap, 
  scan, 
  startWith,
  share,
  takeUntil,
  bufferTime,
  distinctUntilChanged,
  switchMap,
  timeout,
  retry,
  delay
} from 'rxjs/operators';
import { TaskBreakdown, TaskStatus, ChatRequest } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { 
  CompletedTask, 
  AgentAssignment,
  TaskExecutionOptions,
  FirstOfficerConfig,
  TaskDependency,
  ParallelExecutionGroup
} from '../types';
import { WebSocketEventEmitter } from './WebSocketEventEmitter';
import { DependencyResolver } from './DependencyResolver';
import { ResourceManager } from './ResourceManager';
import { TaskScheduler } from './TaskScheduler';
import { PerformanceMonitor } from './PerformanceMonitor';

/**
 * Parallel execution state
 */
export interface ParallelExecutionState {
  expeditionId: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  activeTasks: number;
  progress: number;
  estimatedTimeRemaining: number;
  throughput: number; // tasks per minute
  averageTaskDuration: number;
  resourceUtilization: Record<string, number>;
  criticalPath: string[];
  bottlenecks: string[];
}

/**
 * Task execution event
 */
export interface TaskExecutionEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'retry';
  taskId: string;
  agentId: string;
  timestamp: Date;
  data?: any;
  error?: Error;
}

/**
 * Execution group with parallel tasks
 */
export interface ExecutionGroup {
  id: string;
  tasks: TaskBreakdown[];
  dependencies: string[];
  maxConcurrency: number;
  priority: number;
  startTime?: Date;
  endTime?: Date;
}

/**
 * Task execution context
 */
export interface TaskExecutionContext {
  task: TaskBreakdown;
  agent: AgentAssignment;
  expeditionId: string;
  userId: string;
  attempt: number;
  startTime: Date;
  timeout: number;
}

/**
 * Parallel execution options
 */
export interface ParallelExecutionOptions extends TaskExecutionOptions {
  maxConcurrentTasks?: number;
  taskTimeout?: number;
  retryDelay?: number;
  progressUpdateInterval?: number;
  enableResourceOptimization?: boolean;
  enableAdaptiveScheduling?: boolean;
  enableFailureIsolation?: boolean;
}

export class ParallelExecutionFramework {
  private config: FirstOfficerConfig;
  private wsEmitter: WebSocketEventEmitter;
  private dependencyResolver: DependencyResolver;
  private resourceManager: ResourceManager;
  private taskScheduler: TaskScheduler;
  private performanceMonitor: PerformanceMonitor;
  
  // Execution state
  private executionState$ = new BehaviorSubject<ParallelExecutionState | null>(null);
  private taskEvents$ = new Subject<TaskExecutionEvent>();
  private stopExecution$ = new Subject<void>();
  
  // Active executions
  private activeExecutions = new Map<string, Observable<CompletedTask>>();
  private executionContexts = new Map<string, TaskExecutionContext>();
  
  constructor(
    config: FirstOfficerConfig,
    wsEmitter: WebSocketEventEmitter
  ) {
    this.config = config;
    this.wsEmitter = wsEmitter;
    this.dependencyResolver = new DependencyResolver();
    this.resourceManager = new ResourceManager();
    this.taskScheduler = new TaskScheduler();
    this.performanceMonitor = new PerformanceMonitor();
  }

  /**
   * Execute tasks in parallel with dependency management
   */
  async executeParallel(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: ParallelExecutionOptions = {}
  ): Promise<Observable<CompletedTask>> {
    console.log(`🚀 [PARALLEL-EXECUTOR] Starting parallel execution of ${tasks.length} tasks`);
    
    // Initialize execution state
    this.initializeExecutionState(expeditionId, tasks);
    
    // Build dependency graph
    const dependencyGraph = await this.dependencyResolver.buildDependencyGraph(tasks);
    
    // Create execution groups based on dependencies
    const executionGroups = await this.createExecutionGroups(
      tasks, 
      dependencyGraph,
      assignments,
      options
    );
    
    // Initialize resource pool
    await this.resourceManager.initializePool(assignments);
    
    // Start performance monitoring
    this.startPerformanceMonitoring(expeditionId, options);
    
    // Execute groups in order
    const execution$ = this.executeGroups(
      executionGroups,
      assignments,
      expeditionId,
      userId,
      options
    );
    
    // Return completion stream
    return execution$.pipe(
      takeUntil(this.stopExecution$),
      share()
    );
  }

  /**
   * Create execution groups based on dependencies
   */
  private async createExecutionGroups(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>,
    assignments: AgentAssignment[],
    options: ParallelExecutionOptions
  ): Promise<ExecutionGroup[]> {
    // Identify parallel groups using topological sort
    const groups = this.dependencyResolver.identifyParallelGroups(tasks, dependencyGraph);
    
    // Create execution groups with optimal concurrency
    return groups.map((groupTasks, index) => ({
      id: `group-${index}`,
      tasks: groupTasks,
      dependencies: this.getGroupDependencies(groupTasks, dependencyGraph),
      maxConcurrency: this.calculateOptimalConcurrency(
        groupTasks,
        assignments,
        options.maxConcurrentTasks || 5
      ),
      priority: groups.length - index // Higher priority for earlier groups
    }));
  }

  /**
   * Execute groups in order with parallel task execution within each group
   */
  private executeGroups(
    groups: ExecutionGroup[],
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    return from(groups).pipe(
      concatMap(group => this.executeGroup(group, assignments, expeditionId, userId, options)),
      tap(completed => this.updateExecutionState(completed)),
      catchError(error => {
        console.error(`❌ [PARALLEL-EXECUTOR] Group execution failed:`, error);
        return this.handleGroupFailure(error, options);
      })
    );
  }

  /**
   * Execute a single group with parallel task execution
   */
  private executeGroup(
    group: ExecutionGroup,
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    console.log(`📦 [PARALLEL-EXECUTOR] Executing group ${group.id} with ${group.tasks.length} tasks`);
    
    group.startTime = new Date();
    
    // Emit group start event
    this.wsEmitter.emitTaskGroupStart(expeditionId, {
      groupId: group.id,
      taskCount: group.tasks.length,
      maxConcurrency: group.maxConcurrency
    });
    
    // Create task executions
    const taskExecutions = group.tasks.map(task => 
      this.createTaskExecution(task, assignments, expeditionId, userId, options)
    );
    
    // Execute tasks with controlled concurrency
    return from(taskExecutions).pipe(
      mergeMap(
        execution => execution,
        group.maxConcurrency // Limit concurrent executions
      ),
      tap({
        complete: () => {
          group.endTime = new Date();
          this.wsEmitter.emitTaskGroupComplete(expeditionId, {
            groupId: group.id,
            duration: group.endTime.getTime() - group.startTime!.getTime()
          });
        }
      })
    );
  }

  /**
   * Create individual task execution with monitoring
   */
  private createTaskExecution(
    task: TaskBreakdown,
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    const assignment = assignments.find(a => a.assignedTasks.includes(task.id));
    if (!assignment) {
      return of({
        taskId: task.id,
        agentId: 'unknown',
        result: 'Task not assigned to any agent',
        completionTime: new Date().toISOString(),
        actualDuration: 0
      });
    }
    
    // Create execution context
    const context: TaskExecutionContext = {
      task,
      agent: assignment,
      expeditionId,
      userId,
      attempt: 1,
      startTime: new Date(),
      timeout: options.taskTimeout || 300000 // 5 minutes default
    };
    
    this.executionContexts.set(task.id, context);
    
    // Create execution observable with retry and timeout
    const execution$ = this.executeTaskWithAgent(context, options).pipe(
      timeout(context.timeout),
      retry({
        count: options.retryLimit || this.config.maxRetries,
        delay: (error, retryCount) => {
          context.attempt = retryCount + 1;
          const retryDelayMs = this.calculateRetryDelay(retryCount, options.retryDelay);
          
          this.emitTaskEvent({
            type: 'retry',
            taskId: task.id,
            agentId: assignment.agentId,
            timestamp: new Date(),
            data: { attempt: context.attempt, delay: retryDelayMs },
            error
          });
          
          return of(null).pipe(delay(retryDelayMs));
        }
      }),
      catchError(error => this.handleTaskFailure(task, assignment, error, options)),
      tap(completed => {
        this.executionContexts.delete(task.id);
        this.activeExecutions.delete(task.id);
      })
    );
    
    this.activeExecutions.set(task.id, execution$);
    return execution$;
  }

  /**
   * Execute task with assigned agent
   */
  private executeTaskWithAgent(
    context: TaskExecutionContext,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    const { task, agent, expeditionId, userId } = context;
    
    // Emit task start event
    this.emitTaskEvent({
      type: 'started',
      taskId: task.id,
      agentId: agent.agentId,
      timestamp: new Date(),
      data: { attempt: context.attempt }
    });
    
    // Allocate resources
    return from(this.resourceManager.allocateResources(task.id, agent.agentId)).pipe(
      switchMap(resources => {
        // Build task prompt
        const prompt = this.buildTaskPrompt(task, context);
        
        // Create chat request
        const chatRequest: ChatRequest = {
          agent_id: agent.agentId,
          user_id: userId,
          channel_id: `expedition-${expeditionId}-task-${task.id}`,
          message: prompt,
          stream: false
        };
        
        // Execute task
        return from(this.executeChat(chatRequest)).pipe(
          map(response => ({
            taskId: task.id,
            agentId: agent.agentId,
            result: response.reply,
            completionTime: new Date().toISOString(),
            actualDuration: (Date.now() - context.startTime.getTime()) / 60000
          })),
          tap(completed => {
            // Release resources
            this.resourceManager.releaseResources(task.id);
            
            // Emit completion event
            this.emitTaskEvent({
              type: 'completed',
              taskId: task.id,
              agentId: agent.agentId,
              timestamp: new Date(),
              data: completed
            });
          })
        );
      })
    );
  }

  /**
   * Build task prompt with context
   */
  private buildTaskPrompt(task: TaskBreakdown, context: TaskExecutionContext): string {
    const { attempt } = context;
    
    const retryContext = attempt > 1 ? `
RETRY INFORMATION:
- This is attempt ${attempt} for this task
- Please ensure high quality output
` : '';
    
    return `
PARALLEL EXECUTION TASK

Task ID: ${task.id}
Description: ${task.description}

REQUIREMENTS:
- Required Skills: ${task.requiredSkills.join(', ')}
- Expected Deliverable: ${task.deliverable}
- Dependencies: ${task.dependencies.join(', ') || 'None'}

${retryContext}

EXECUTION CONTEXT:
- This task is part of a parallel execution group
- Other agents are working on related tasks simultaneously
- Focus on your specific task requirements
- Ensure output is self-contained and complete

Please complete this task efficiently while maintaining high quality standards.
`;
  }

  /**
   * Execute chat request (stub - should integrate with actual chat system)
   */
  private async executeChat(request: ChatRequest): Promise<{ reply: string }> {
    // This should integrate with your actual chat execution system
    // For now, returning a placeholder
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { reply: `Completed task for ${request.message}` };
  }

  /**
   * Handle task failure
   */
  private handleTaskFailure(
    task: TaskBreakdown,
    assignment: AgentAssignment,
    error: any,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    console.error(`❌ [PARALLEL-EXECUTOR] Task ${task.id} failed:`, error);
    
    // Emit failure event
    this.emitTaskEvent({
      type: 'failed',
      taskId: task.id,
      agentId: assignment.agentId,
      timestamp: new Date(),
      error
    });
    
    // Update task status
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    taskRepo.updateStatus(task.id, 'failed').catch(console.error);
    
    if (options.enableFailureIsolation) {
      // Return partial result to allow other tasks to continue
      return of({
        taskId: task.id,
        agentId: assignment.agentId,
        result: `Task failed: ${error.message}`,
        completionTime: new Date().toISOString(),
        actualDuration: 0,
        qualityScore: 0
      });
    }
    
    // Propagate error if failure isolation is disabled
    throw error;
  }

  /**
   * Handle group failure
   */
  private handleGroupFailure(
    error: any,
    options: ParallelExecutionOptions
  ): Observable<CompletedTask> {
    if (options.enableFailureIsolation) {
      // Continue with empty result
      return EMPTY;
    }
    throw error;
  }

  /**
   * Initialize execution state
   */
  private initializeExecutionState(expeditionId: string, tasks: TaskBreakdown[]): void {
    const initialState: ParallelExecutionState = {
      expeditionId,
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      activeTasks: 0,
      progress: 0,
      estimatedTimeRemaining: tasks.reduce((sum, t) => sum + (t.estimatedEffort || 30), 0),
      throughput: 0,
      averageTaskDuration: 0,
      resourceUtilization: {},
      criticalPath: [],
      bottlenecks: []
    };
    
    this.executionState$.next(initialState);
  }

  /**
   * Update execution state
   */
  private updateExecutionState(completed: CompletedTask): void {
    const currentState = this.executionState$.value;
    if (!currentState) return;
    
    const newState: ParallelExecutionState = {
      ...currentState,
      completedTasks: currentState.completedTasks + 1,
      activeTasks: this.activeExecutions.size,
      progress: ((currentState.completedTasks + 1) / currentState.totalTasks) * 100,
      averageTaskDuration: this.calculateAverageTaskDuration(completed.actualDuration)
    };
    
    // Calculate throughput
    const elapsedMinutes = (Date.now() - this.performanceMonitor.getStartTime().getTime()) / 60000;
    newState.throughput = elapsedMinutes > 0 ? newState.completedTasks / elapsedMinutes : 0;
    
    // Update estimated time remaining
    const remainingTasks = newState.totalTasks - newState.completedTasks;
    newState.estimatedTimeRemaining = remainingTasks * newState.averageTaskDuration;
    
    // Update resource utilization
    newState.resourceUtilization = this.resourceManager.getUtilization();
    
    // Update bottlenecks
    newState.bottlenecks = this.performanceMonitor.identifyBottlenecks();
    
    this.executionState$.next(newState);
    
    // Emit progress update via WebSocket
    this.wsEmitter.emitExpeditionProgress(currentState.expeditionId, {
      progress: newState.progress,
      completedTasks: newState.completedTasks,
      totalTasks: newState.totalTasks,
      throughput: newState.throughput,
      estimatedTimeRemaining: newState.estimatedTimeRemaining
    });
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(
    expeditionId: string,
    options: ParallelExecutionOptions
  ): void {
    const updateInterval = options.progressUpdateInterval || 5000; // 5 seconds
    
    // Monitor execution state changes
    this.executionState$.pipe(
      filter(state => state !== null),
      bufferTime(updateInterval),
      filter(states => states.length > 0),
      map(states => states[states.length - 1]), // Take latest state
      distinctUntilChanged((a, b) => 
        a!.completedTasks === b!.completedTasks && 
        a!.activeTasks === b!.activeTasks
      ),
      takeUntil(this.stopExecution$)
    ).subscribe(state => {
      if (state) {
        this.performanceMonitor.recordMetrics({
          timestamp: new Date(),
          activeTasks: state.activeTasks,
          completedTasks: state.completedTasks,
          throughput: state.throughput,
          resourceUtilization: state.resourceUtilization
        });
        
        // Check for optimization opportunities
        if (options.enableAdaptiveScheduling) {
          this.optimizeExecution(state);
        }
      }
    });
  }

  /**
   * Optimize execution based on current state
   */
  private optimizeExecution(state: ParallelExecutionState): void {
    // Identify optimization opportunities
    const optimizations = this.performanceMonitor.suggestOptimizations(state);
    
    optimizations.forEach(optimization => {
      switch (optimization.type) {
        case 'increase-concurrency':
          // Increase concurrency if resources allow
          this.taskScheduler.increaseConcurrency(optimization.value);
          break;
        case 'rebalance-load':
          // Rebalance load across agents
          this.resourceManager.rebalanceLoad();
          break;
        case 'priority-adjustment':
          // Adjust task priorities based on critical path
          this.taskScheduler.adjustPriorities(state.criticalPath);
          break;
      }
    });
  }

  /**
   * Calculate optimal concurrency for a group
   */
  private calculateOptimalConcurrency(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    maxConcurrency: number
  ): number {
    // Consider available agents
    const availableAgents = new Set(assignments.map(a => a.agentId)).size;
    
    // Consider task complexity
    const avgComplexity = tasks.reduce((sum, t) => 
      sum + (t.requiredSkills.length + (t.estimatedEffort || 30) / 30), 0
    ) / tasks.length;
    
    // Calculate optimal concurrency
    const optimal = Math.min(
      maxConcurrency,
      availableAgents,
      Math.max(1, Math.floor(tasks.length / avgComplexity))
    );
    
    return optimal;
  }

  /**
   * Get group dependencies
   */
  private getGroupDependencies(
    tasks: TaskBreakdown[],
    dependencyGraph: Map<string, string[]>
  ): string[] {
    const taskIds = new Set(tasks.map(t => t.id));
    const dependencies = new Set<string>();
    
    tasks.forEach(task => {
      const taskDeps = dependencyGraph.get(task.id) || [];
      taskDeps.forEach(dep => {
        if (!taskIds.has(dep)) {
          dependencies.add(dep);
        }
      });
    });
    
    return Array.from(dependencies);
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number, baseDelay?: number): number {
    const base = baseDelay || 1000; // 1 second default
    return Math.min(30000, base * Math.pow(2, retryCount)); // Max 30 seconds
  }

  /**
   * Calculate average task duration
   */
  private calculateAverageTaskDuration(newDuration: number): number {
    const state = this.executionState$.value;
    if (!state || state.completedTasks === 0) return newDuration;
    
    const currentAvg = state.averageTaskDuration;
    const currentTotal = currentAvg * (state.completedTasks - 1);
    return (currentTotal + newDuration) / state.completedTasks;
  }

  /**
   * Emit task event
   */
  private emitTaskEvent(event: TaskExecutionEvent): void {
    this.taskEvents$.next(event);
    
    // Emit via WebSocket based on event type
    const state = this.executionState$.value;
    if (!state) return;
    
    switch (event.type) {
      case 'started':
        this.wsEmitter.emitTaskStart(state.expeditionId, {
          taskId: event.taskId,
          agentId: event.agentId,
          attempt: event.data?.attempt || 1
        });
        break;
      case 'progress':
        this.wsEmitter.emitTaskProgress(state.expeditionId, {
          taskId: event.taskId,
          progress: event.data?.progress || 0
        });
        break;
      case 'completed':
        this.wsEmitter.emitTaskComplete(state.expeditionId, {
          taskId: event.taskId,
          result: event.data?.result,
          duration: event.data?.actualDuration
        });
        break;
      case 'failed':
        this.wsEmitter.emitTaskFailed(state.expeditionId, {
          taskId: event.taskId,
          error: event.error?.message || 'Unknown error'
        });
        break;
    }
  }

  /**
   * Get execution state observable
   */
  getExecutionState(): Observable<ParallelExecutionState | null> {
    return this.executionState$.asObservable();
  }

  /**
   * Get task events observable
   */
  getTaskEvents(): Observable<TaskExecutionEvent> {
    return this.taskEvents$.asObservable();
  }

  /**
   * Stop all executions
   */
  stopExecution(): void {
    console.log('🛑 [PARALLEL-EXECUTOR] Stopping all parallel executions');
    this.stopExecution$.next();
    
    // Clear active executions
    this.activeExecutions.clear();
    this.executionContexts.clear();
    
    // Reset state
    this.executionState$.next(null);
  }

  /**
   * Get active task count
   */
  getActiveTaskCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics() {
    return this.performanceMonitor.getMetrics();
  }
}