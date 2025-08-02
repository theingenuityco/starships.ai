/**
 * Enhanced Task Execution Engine
 * 
 * Handles advanced parallel task execution with:
 * - Robust dependency management and conflict resolution
 * - Resource allocation and optimization
 * - Task prioritization and intelligent scheduling
 * - Progress tracking with time estimation
 * - Intelligent retry mechanisms with backoff
 * - Performance monitoring and optimization
 * - Real-time progress reporting via WebSocket events
 */

import { Observable, Subject, BehaviorSubject, merge, timer, from, EMPTY, throwError } from 'rxjs';
import { map, filter, takeUntil, timeout, catchError, retry, delay, mergeMap, concatMap, switchMap } from 'rxjs/operators';
import { TaskBreakdown, ChatRequest, AgentActivity, AgentActivityType } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { chat, chatWithMCP } from '../index';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';
import {
  TaskExecution,
  CompletedTask,
  AgentAssignment,
  TaskExecutionOptions,
  FirstOfficerConfig,
  ParallelExecutionGroup,
  TaskDependency
} from './types';

/**
 * Enhanced task execution with resource management
 */
export interface EnhancedTaskExecution extends TaskExecution {
  expeditionId: string;
  resourceRequirements?: ResourceRequirement[];
  allocatedResources?: AllocatedResource[];
  priority: TaskPriority;
  retryCount: number;
  lastRetryAt?: string;
  performanceMetrics?: TaskPerformanceMetrics;
  conflictResolution?: ConflictResolution[];
  scheduledStartTime?: string;
  actualStartTime?: string;
  estimatedEndTime?: string;
  actualEndTime?: string;
  metadata?: {
    reviewFeedback?: string;
    reviewStatus?: 'pending' | 'approved' | 'rejected';
    reviewedBy?: string;
    reviewedAt?: string;
  };
}

/**
 * Resource requirement for task execution
 */
export interface ResourceRequirement {
  type: 'agent' | 'memory' | 'compute' | 'network' | 'storage';
  amount: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  duration?: number; // in minutes
  constraints?: Record<string, any>;
}

/**
 * Allocated resource for task execution
 */
export interface AllocatedResource {
  id: string;
  type: ResourceRequirement['type'];
  amount: number;
  allocatedAt: string;
  releaseAt?: string;
  utilizationRate?: number;
}

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent';

/**
 * Performance metrics for task execution
 */
export interface TaskPerformanceMetrics {
  executionTime: number; // actual time taken in minutes
  resourceUtilization: Record<string, number>; // utilization rates by resource type
  throughput: number; // tasks per hour
  errorRate: number; // percentage of failed executions
  retryRate: number; // percentage of tasks that needed retries
  qualityScore?: number; // from quality validator
  efficiency: number; // actual vs estimated time ratio
  bottlenecks: string[]; // identified performance bottlenecks
}

/**
 * Conflict resolution information
 */
export interface ConflictResolution {
  conflictType: 'resource' | 'dependency' | 'priority' | 'timing';
  description: string;
  resolution: string;
  resolvedAt: string;
  impact: 'low' | 'medium' | 'high';
}

/**
 * Resource pool for managing available resources
 */
export interface ResourcePool {
  agents: Map<string, AgentResource>;
  memory: number; // available memory in MB
  compute: number; // available compute units
  network: number; // available network bandwidth
  storage: number; // available storage in GB
}

/**
 * Agent resource information
 */
export interface AgentResource {
  agentId: string;
  agentName: string;
  category: string;
  availability: 'available' | 'busy' | 'overloaded' | 'offline';
  currentLoad: number; // 0-100 percentage
  maxConcurrentTasks: number;
  currentTasks: string[];
  performanceRating: number; // 0-100
  specializations: string[];
}

/**
 * Execution strategy for parallel processing
 */
export interface ExecutionStrategy {
  type: 'sequential' | 'parallel' | 'pipeline' | 'adaptive';
  maxConcurrency: number;
  resourceAllocation: 'balanced' | 'priority-based' | 'performance-optimized';
  conflictResolution: 'queue' | 'preempt' | 'negotiate';
  retryStrategy: 'immediate' | 'exponential-backoff' | 'scheduled';
}

/**
 * Task scheduling information
 */
export interface TaskSchedule {
  taskId: string;
  scheduledStart: string;
  estimatedDuration: number;
  dependencies: string[];
  resourceRequirements: ResourceRequirement[];
  priority: TaskPriority;
  flexibility: number; // 0-1, how flexible the scheduling is
}

/**
 * Execution group for parallel processing
 */
export interface ExecutionGroup {
  groupId: string;
  tasks: string[];
  maxConcurrency: number;
  dependencies: string[];
}

/**
 * Performance monitor for adaptive execution
 */
export interface PerformanceMonitor {
  getCurrentMetrics(): SystemMetrics;
  getResourceUtilization(): Record<string, number>;
  getBottlenecks(): string[];
}

/**
 * System performance metrics
 */
export interface SystemMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  taskThroughput: number;
  errorRate: number;
  averageResponseTime: number;
}

export class TaskExecutor {
  private config: FirstOfficerConfig;
  private memoryStore: LangChainMemoryStore;
  private activeExecutions: Map<string, EnhancedTaskExecution> = new Map();
  private executionSubjects: Map<string, Subject<EnhancedTaskExecution>> = new Map();
  private completionSubject = new Subject<CompletedTask>();
  private stopSubject = new Subject<void>();
  private resourcePool!: ResourcePool;
  private executionStrategy!: ExecutionStrategy;
  private taskQueue: TaskSchedule[] = [];
  private performanceHistory: Map<string, TaskPerformanceMetrics[]> = new Map();
  private webSocketEmitter: WebSocketEventEmitter;
  private agentNames: Map<string, string> = new Map();
  private mcpEnabled: boolean = false;
  private starshipId: string | null = null;

  constructor(config: FirstOfficerConfig, memoryStore: LangChainMemoryStore, webSocketEmitter?: WebSocketEventEmitter) {
    this.config = config;
    this.memoryStore = memoryStore;
    this.webSocketEmitter = webSocketEmitter || new WebSocketEventEmitter();
    this.initializeResourcePool();
    this.initializeExecutionStrategy();
  }

  /**
   * Enable MCP tools for this task executor
   */
  enableMCP(starshipId: string): void {
    this.mcpEnabled = true;
    this.starshipId = starshipId;
    console.log(`🔧 [TASK-EXECUTOR] MCP enabled for starship: ${starshipId}`);
  }

  /**
   * Execute chat with MCP context, ensuring agent has correct starshipId
   */
  private async executeWithMCPContext(chatRequest: ChatRequest, starshipId: string): Promise<any> {
    try {
      console.log(`🔧 [TASK-EXECUTOR] Executing with MCP context for agent ${chatRequest.agent_id}, starshipId: ${starshipId}`);
      
      // Execute with MCP tools using starshipId override (no database changes needed)
      const response = await chatWithMCP(chatRequest, this.memoryStore, { 
        overrideStarshipId: starshipId 
      });
      
      console.log(`✅ [TASK-EXECUTOR] MCP execution successful for agent ${chatRequest.agent_id}`);
      return response;
    } catch (error) {
      console.error(`❌ [TASK-EXECUTOR] Error in executeWithMCPContext:`, error);
      // Fallback to regular chat if MCP fails
      console.log(`🔄 [TASK-EXECUTOR] Falling back to regular chat for agent ${chatRequest.agent_id}`);
      return await chat(chatRequest, this.memoryStore);
    }
  }

  /**
   * Execute tasks with enhanced parallel processing and resource management
   */
  async executeTasks(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions = {}
  ): Promise<Observable<CompletedTask>> {
    console.log(`🚀 [TASK-EXECUTOR] Starting enhanced execution of ${tasks.length} tasks`);

    try {
      // Load agent details for activity tracking
      await this.loadAgentDetails(assignments);
      
      // Create enhanced execution plan with resource allocation
      const executionPlan = await this.createEnhancedExecutionPlan(tasks, assignments, expeditionId, options);
      
      // Optimize execution strategy based on task characteristics
      this.optimizeExecutionStrategy(executionPlan, options);
      
      // Schedule tasks with dependency resolution
      const schedule = await this.createOptimalSchedule(executionPlan);
      
      // Start execution based on strategy
      await this.startEnhancedExecution(schedule, expeditionId, userId, options);

      // Monitor progress and performance
      this.startAdvancedProgressMonitoring();

      // Start resource optimization
      this.startResourceOptimization();

      return this.completionSubject.asObservable();
    } catch (error) {
      console.error(`❌ [TASK-EXECUTOR] Enhanced execution failed:`, error);
      throw error;
    }
  }

  /**
   * Create enhanced execution plan with resource allocation
   */
  private async createEnhancedExecutionPlan(
    tasks: TaskBreakdown[],
    assignments: AgentAssignment[],
    expeditionId: string,
    options: TaskExecutionOptions
  ): Promise<EnhancedTaskExecution[]> {
    const executions: EnhancedTaskExecution[] = [];
    
    for (const assignment of assignments) {
      for (const taskId of assignment.assignedTasks) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          // Analyze resource requirements
          const resourceRequirements = await this.analyzeResourceRequirements(task, assignment.agentId);
          
          // Calculate priority based on task characteristics
          const priority = this.calculateTaskPriority(task, tasks);
          
          // Estimate performance metrics
          const estimatedMetrics = this.estimatePerformanceMetrics(task, assignment.agentId);

          const execution: EnhancedTaskExecution = {
            taskId: task.id,
            agentId: assignment.agentId,
            status: 'pending',
            startTime: new Date().toISOString(),
            estimatedCompletion: this.calculateEstimatedCompletion(task),
            progress: 0,
            intermediateResults: [],
            issues: [],
            expeditionId,
            resourceRequirements,
            priority,
            retryCount: 0,
            performanceMetrics: estimatedMetrics,
            conflictResolution: [],
            scheduledStartTime: new Date().toISOString()
          };
          
          executions.push(execution);
          this.activeExecutions.set(taskId, execution);
        }
      }
    }
    
    return executions;
  }

  /**
   * Optimize execution strategy based on task characteristics
   */
  private optimizeExecutionStrategy(executions: EnhancedTaskExecution[], options: TaskExecutionOptions): void {
    const totalTasks = executions.length;
    const highPriorityTasks = executions.filter(e => e.priority === 'critical' || e.priority === 'urgent').length;
    const resourceIntensiveTasks = executions.filter(e => 
      e.resourceRequirements?.some(r => r.amount > 50)
    ).length;

    // Adaptive strategy selection
    if (highPriorityTasks > totalTasks * 0.3) {
      this.executionStrategy.resourceAllocation = 'priority-based';
    } else if (resourceIntensiveTasks > totalTasks * 0.4) {
      this.executionStrategy.type = 'sequential';
      this.executionStrategy.resourceAllocation = 'performance-optimized';
    } else {
      this.executionStrategy.type = options.parallelExecution ? 'parallel' : 'adaptive';
      this.executionStrategy.resourceAllocation = 'balanced';
    }

    // Adjust concurrency based on available resources
    const availableAgents = Array.from(this.resourcePool.agents.values())
      .filter(a => a.availability === 'available').length;
    
    this.executionStrategy.maxConcurrency = Math.min(
      this.config.maxRetries,
      availableAgents,
      Math.ceil(totalTasks / 3)
    );

    console.log(`📊 [TASK-EXECUTOR] Optimized execution strategy:`, {
      type: this.executionStrategy.type,
      maxConcurrency: this.executionStrategy.maxConcurrency,
      resourceAllocation: this.executionStrategy.resourceAllocation,
      totalTasks,
      highPriorityTasks,
      resourceIntensiveTasks
    });
  }

  /**
   * Create optimal schedule for task execution
   */
  private async createOptimalSchedule(executions: EnhancedTaskExecution[]): Promise<TaskSchedule[]> {
    const schedule: TaskSchedule[] = [];
    
    for (const execution of executions) {
      const taskSchedule: TaskSchedule = {
        taskId: execution.taskId,
        scheduledStart: execution.scheduledStartTime || new Date().toISOString(),
        estimatedDuration: execution.performanceMetrics?.executionTime || 30,
        dependencies: [], // Would be populated from task dependencies
        resourceRequirements: execution.resourceRequirements || [],
        priority: execution.priority,
        flexibility: this.calculateSchedulingFlexibility(execution)
      };
      
      schedule.push(taskSchedule);
    }
    
    // Sort by priority and dependencies
    return this.optimizeScheduleOrder(schedule);
  }

  /**
   * Start enhanced execution with advanced scheduling
   */
  private async startEnhancedExecution(
    schedule: TaskSchedule[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`⚡ [TASK-EXECUTOR] Starting enhanced execution with ${schedule.length} scheduled tasks`);

    // Execute based on strategy
    switch (this.executionStrategy.type) {
      case 'parallel':
        await this.executeParallel(schedule, expeditionId, userId, options);
        break;
      case 'sequential':
        await this.executeSequential(schedule, expeditionId, userId, options);
        break;
      case 'pipeline':
        await this.executePipeline(schedule, expeditionId, userId, options);
        break;
      case 'adaptive':
      default:
        await this.executeAdaptive(schedule, expeditionId, userId, options);
        break;
    }
  }

  /**
   * Execute tasks in parallel with resource management
   */
  private async executeParallel(
    schedule: TaskSchedule[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    const concurrency = this.executionStrategy.maxConcurrency;
    console.log(`🔄 [TASK-EXECUTOR] Executing ${schedule.length} tasks in parallel (concurrency: ${concurrency})`);

    // Create execution groups based on dependencies and resources
    const executionGroups = this.createExecutionGroups(schedule, concurrency);

    for (const group of executionGroups) {
      // Execute group in parallel
      const groupExecutions = group.tasks.map((taskId: string) => {
        const execution = this.activeExecutions.get(taskId);
        if (execution) {
          return this.executeTaskWithResourceManagement(execution, expeditionId, userId, options);
        }
        return Promise.resolve();
      });

      // Wait for group completion before starting next group
      await Promise.allSettled(groupExecutions);
    }
  }

  /**
   * Execute tasks sequentially with optimization
   */
  private async executeSequential(
    schedule: TaskSchedule[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`➡️ [TASK-EXECUTOR] Executing ${schedule.length} tasks sequentially`);

    for (const taskSchedule of schedule) {
      const execution = this.activeExecutions.get(taskSchedule.taskId);
      if (execution) {
        await this.executeTaskWithResourceManagement(execution, expeditionId, userId, options);
      }
    }
  }

  /**
   * Execute tasks in pipeline mode
   */
  private async executePipeline(
    schedule: TaskSchedule[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`🔗 [TASK-EXECUTOR] Executing ${schedule.length} tasks in pipeline mode`);

    // Create pipeline stages based on dependencies
    const stages = this.createPipelineStages(schedule);

    for (const stage of stages) {
      // Execute stage tasks in parallel
      const stageExecutions = stage.map((taskId: string) => {
        const execution = this.activeExecutions.get(taskId);
        if (execution) {
          return this.executeTaskWithResourceManagement(execution, expeditionId, userId, options);
        }
        return Promise.resolve();
      });

      await Promise.allSettled(stageExecutions);
    }
  }

  /**
   * Execute tasks with adaptive strategy
   */
  private async executeAdaptive(
    schedule: TaskSchedule[],
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`🧠 [TASK-EXECUTOR] Executing ${schedule.length} tasks with adaptive strategy`);

    // Monitor system performance and adjust strategy dynamically
    const performanceMonitor = this.createPerformanceMonitor();
    
    let currentStrategy: 'parallel' | 'sequential' = 'parallel';
    let processedTasks = 0;

    for (let i = 0; i < schedule.length; i += this.executionStrategy.maxConcurrency) {
      // Get current batch
      const batch = schedule.slice(i, i + this.executionStrategy.maxConcurrency);
      
      // Check if we should switch strategy
      if (processedTasks > 0 && processedTasks % 5 === 0) {
        const metrics = performanceMonitor.getCurrentMetrics();
        currentStrategy = this.shouldSwitchStrategy(metrics) ? 
          (currentStrategy === 'parallel' ? 'sequential' : 'parallel') : 
          currentStrategy;
      }

      // Execute batch based on current strategy
      if (currentStrategy === 'parallel') {
        const batchExecutions = batch.map(taskSchedule => {
          const execution = this.activeExecutions.get(taskSchedule.taskId);
          if (execution) {
            return this.executeTaskWithResourceManagement(execution, expeditionId, userId, options);
          }
          return Promise.resolve();
        });
        await Promise.allSettled(batchExecutions);
      } else {
        for (const taskSchedule of batch) {
          const execution = this.activeExecutions.get(taskSchedule.taskId);
          if (execution) {
            await this.executeTaskWithResourceManagement(execution, expeditionId, userId, options);
          }
        }
      }

      processedTasks += batch.length;
    }
  }

  /**
   * Execute individual task with comprehensive resource management
   */
  private async executeTaskWithResourceManagement(
    execution: EnhancedTaskExecution,
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<void> {
    console.log(`▶️ [TASK-EXECUTOR] Starting enhanced task execution: ${execution.taskId}`);
    
    const startTime = Date.now();
    execution.actualStartTime = new Date().toISOString();
    execution.status = 'in-progress';
    
    // Get task details for activity tracking
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.findById(execution.taskId);
    const taskTitle = task?.title || 'Unknown Task';
    
    // Emit task started activity
    this.emitAgentActivity(
      expeditionId,
      execution.agentId,
      'task_started',
      `Started working on "${taskTitle}"`,
      execution.taskId,
      taskTitle,
      { priority: execution.priority }
    );
    
    // Emit WebSocket task start event for real-time updates
    this.webSocketEmitter.emitTaskStart(expeditionId, {
      taskId: execution.taskId,
      agentId: execution.agentId,
      attempt: execution.retryCount + 1
    });
    
    try {
      // Allocate resources
      const allocatedResources = await this.allocateResources(
        execution.resourceRequirements || [],
        execution.taskId
      );
      execution.allocatedResources = allocatedResources;

      // Resolve any conflicts
      const conflicts = await this.detectConflicts(execution);
      if (conflicts.length > 0) {
        const resolutions = await this.resolveConflicts(conflicts, execution);
        execution.conflictResolution = resolutions;
      }

      // Execute task with retry logic
      const result = await this.executeWithIntelligentRetry(execution, expeditionId, userId, options);
      
      // Calculate performance metrics
      const endTime = Date.now();
      const actualDuration = (endTime - startTime) / (1000 * 60); // in minutes
      
      execution.performanceMetrics = {
        executionTime: actualDuration,
        resourceUtilization: this.calculateResourceUtilization(execution.allocatedResources || []),
        throughput: 1 / actualDuration * 60, // tasks per hour
        errorRate: execution.retryCount > 0 ? (execution.retryCount / (execution.retryCount + 1)) * 100 : 0,
        retryRate: execution.retryCount > 0 ? 100 : 0,
        efficiency: (execution.estimatedCompletion ? 
          (new Date(execution.estimatedCompletion).getTime() - new Date(execution.startTime).getTime()) / (1000 * 60) : 30) / actualDuration,
        bottlenecks: this.identifyBottlenecks(execution)
      };

      // Handle successful completion
      await this.handleEnhancedTaskCompletion(execution, result, expeditionId);

    } catch (error) {
      console.error(`❌ [TASK-EXECUTOR] Enhanced task execution failed:`, error);
      await this.handleEnhancedTaskError(execution, error, options, expeditionId, taskTitle);
    } finally {
      // Release allocated resources
      if (execution.allocatedResources) {
        await this.releaseResources(execution.allocatedResources, execution.taskId);
      }
    }
  }

  /**
   * Execute task with intelligent retry mechanism
   */
  private async executeWithIntelligentRetry(
    execution: EnhancedTaskExecution,
    expeditionId: string,
    userId: string,
    options: TaskExecutionOptions
  ): Promise<string> {
    const maxRetries = options.retryLimit || this.config.maxRetries;
    let lastError: Error | null = null;

    // Get task details for activity tracking
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.findById(execution.taskId);
    const taskTitle = task?.title || 'Unknown Task';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Apply intelligent backoff strategy
          const backoffDelay = this.calculateBackoffDelay(attempt, execution.priority);
          console.log(`🔄 [TASK-EXECUTOR] Retrying task ${execution.taskId} (attempt ${attempt + 1}/${maxRetries + 1}) after ${backoffDelay}ms delay`);
          
          // Emit retry activity
          this.emitAgentActivity(
            expeditionId,
            execution.agentId,
            'retry_attempt',
            `Retrying "${taskTitle}" (attempt ${attempt + 1}/${maxRetries + 1})`,
            execution.taskId,
            taskTitle,
            { retryCount: attempt, delay: backoffDelay }
          );
          
          // Emit WebSocket task retry event for real-time updates
          this.webSocketEmitter.emitTaskRetry(expeditionId, {
            taskId: execution.taskId,
            attempt: attempt + 1,
            delay: backoffDelay
          });
          
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          execution.retryCount = attempt;
          execution.lastRetryAt = new Date().toISOString();
        }

        // Emit thinking activity before execution
        this.emitAgentActivity(
          expeditionId,
          execution.agentId,
          'agent_thinking',
          `Processing "${taskTitle}"`,
          execution.taskId,
          taskTitle
        );

        // Add 7-second delay for natural conversation flow
        console.log(`⏱️ [TASK-EXECUTOR] Adding 7-second delay for natural conversation flow...`);
        await new Promise(resolve => setTimeout(resolve, 7000));

        // Execute the actual task
        const result = await this.executeTaskWithAgent(execution, expeditionId, userId);
        
        // Update progress
        execution.progress = 100;
        
        // Emit WebSocket task progress event for real-time updates
        this.webSocketEmitter.emitTaskProgress(expeditionId, {
          taskId: execution.taskId,
          progress: 100
        });
        
        return result;

      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ [TASK-EXECUTOR] Task execution attempt ${attempt + 1} failed:`, error);
        
        // Check if error is retryable
        if (!this.isRetryableError(error as Error)) {
          console.log(`🚫 [TASK-EXECUTOR] Non-retryable error, stopping retries for task ${execution.taskId}`);
          break;
        }
      }
    }

    throw lastError || new Error('Task execution failed after all retry attempts');
  }

  /**
   * Execute task with assigned agent (enhanced version)
   */
  private async executeTaskWithAgent(
    execution: EnhancedTaskExecution,
    expeditionId: string,
    userId: string
  ): Promise<string> {
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    const task = await taskRepo.findById(execution.taskId);
    
    if (!task) {
      throw new Error(`Task not found: ${execution.taskId}`);
    }
    
    // Build enhanced task instruction with context
    const taskInstruction = this.buildEnhancedTaskInstruction(task, execution);
    
    // Create chat request with timeout
    const chatRequest: ChatRequest = {
      agent_id: execution.agentId,
      user_id: userId,
      channel_id: `expedition-${expeditionId}-task-${execution.taskId}`,
      message: taskInstruction,
      stream: false
    };
    
    // Execute task through agent with timeout
    console.log(`💬 [TASK-EXECUTOR] Sending enhanced task to agent: ${execution.agentId}`);
    console.log(`🔧 [TASK-EXECUTOR] MCP enabled: ${this.mcpEnabled}, Starship: ${this.starshipId}`);
    
    // Emit typing start
    if (this.webSocketEmitter) {
      const agentName = this.agentNames.get(execution.agentId) || 'Agent';
      this.webSocketEmitter.emitTypingStart(expeditionId, execution.agentId, agentName);
    }
    
    const timeoutMs = (this.config.timeoutMinutes || 30) * 60 * 1000;
    const chatFunction = this.mcpEnabled && this.starshipId ? chatWithMCP : chat;
    console.log(`🔧 [TASK-EXECUTOR] Using ${this.mcpEnabled ? 'MCP-enabled' : 'regular'} chat function`);
    console.log(`🔧 [TASK-EXECUTOR] [FIX-v2] MCP override starshipId fix is ACTIVE`);
    
    // For MCP-enabled execution, temporarily override the agent's starshipId if needed
    let originalResponse;
    if (this.mcpEnabled && this.starshipId) {
      // We need to ensure the agent has the correct starshipId for MCP tool loading
      console.log(`🔧 [TASK-EXECUTOR] Ensuring agent ${execution.agentId} has starshipId: ${this.starshipId}`);
      originalResponse = await Promise.race([
        this.executeWithMCPContext(chatRequest, this.starshipId),
        this.createTimeoutPromise(timeoutMs)
      ]);
    } else {
      originalResponse = await Promise.race([
        chatFunction(chatRequest, this.memoryStore),
        this.createTimeoutPromise(timeoutMs)
      ]);
    }
    
    const response = originalResponse;
    
    // Parse and emit chain of thought message
    if (this.webSocketEmitter) {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      
      // Extract chain of thought from response
      const chainOfThought = this.extractChainOfThought(response.reply);
      
      // Create a formatted chain of thought message
      const formattedContent = this.formatChainOfThoughtMessage(task.title, chainOfThought);
      
      const chainOfThoughtMessage = await messageRepo.create({
        expeditionId,
        role: 'agent' as const,
        agentId: execution.agentId,
        content: formattedContent,
        messageType: 'chain-of-thought' as const,
        timestamp: new Date().toISOString(),
        chainOfThought
      });
      
      this.webSocketEmitter.emitExpeditionMessage(expeditionId, chainOfThoughtMessage);
      
      // Also emit the actual task result separately
      const taskResultMessage = await messageRepo.create({
        expeditionId,
        role: 'agent' as const,
        agentId: execution.agentId,
        content: `📝 **Task Result for "${task.title}"**\n\n${this.extractExecutionResult(response.reply)}`,
        messageType: 'task-work' as const,
        timestamp: new Date().toISOString(),
        metadata: {
          taskId: execution.taskId,
          taskTitle: task.title
        }
      });
      
      this.webSocketEmitter.emitExpeditionMessage(expeditionId, taskResultMessage);
      
      // Stop typing indicator
      this.webSocketEmitter.emitTypingStop(expeditionId, execution.agentId);
    }
    
    // Update intermediate results
    execution.intermediateResults?.push(response.reply);
    
    return response.reply;
  }

  /**
   * Build enhanced task instruction with performance context
   */
  private buildEnhancedTaskInstruction(task: any, execution: EnhancedTaskExecution): string {
    // Check if there's review feedback for this task
    const reviewFeedback = execution.metadata?.reviewFeedback;
    const reviewContext = reviewFeedback ? `
FIRST OFFICER REVIEW FEEDBACK:
${reviewFeedback}

Please carefully address the feedback above in your revised response.
` : '';
    
    const performanceContext = execution.retryCount > 0 ? `
PERFORMANCE CONTEXT:
- This is retry attempt #${execution.retryCount}
- Previous attempts encountered issues: ${execution.issues?.join(', ') || 'Unknown'}
- Please focus on addressing these specific issues in your response
- Priority level: ${execution.priority}
${reviewContext}
` : `
PERFORMANCE CONTEXT:
- Priority level: ${execution.priority}
- Estimated completion time: ${execution.estimatedCompletion}
- Resource allocation: ${execution.allocatedResources?.length || 0} resources allocated
`;

    const resourceContext = execution.allocatedResources?.length ? `
RESOURCE ALLOCATION:
${execution.allocatedResources.map(r => `- ${r.type}: ${r.amount} units allocated`).join('\n')}
` : '';

    return `
ENHANCED EXPEDITION TASK ASSIGNMENT

Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description}

REQUIREMENTS:
- Required Skills: ${task.requiredSkills.join(', ')}
- Expected Deliverable: ${task.deliverable}
- Estimated Effort: ${task.estimatedEffort || 'Not specified'} minutes
- Dependencies: ${task.dependencies?.join(', ') || 'None'}

${performanceContext}

${resourceContext}

CRITICAL EXECUTION INSTRUCTIONS:
⚠️ **YOU MUST ACTUALLY PERFORM THE WORK - NOT JUST EXPLAIN WHAT YOU WOULD DO** ⚠️

1. **DO THE ACTUAL WORK**: Execute the task completely, don't just describe your approach
2. **USE YOUR TOOLS**: If you have access to tools (web search, code execution, file access, etc.), USE THEM to complete the task
3. **PROVIDE REAL RESULTS**: Give actual findings, data, code, documents - not just explanations
4. **BE COMPREHENSIVE**: Complete the entire deliverable as specified
5. **TAKE ACTION**: If the task requires research, actually research. If it requires writing, actually write. If it requires analysis, actually analyze.

**EXECUTION FORMAT:**
Provide your actual work output directly. Structure it as:

**IMPLEMENTATION PHASE:**
[Put your actual completed work here - real data, actual analysis, working code, concrete deliverables]

**BRIEF SUMMARY:**
[One paragraph explaining what you accomplished and any key insights]

**EXAMPLE - WRONG APPROACH:**
❌ "Implementation phase: I would collect and analyze data on each competitor's market share by researching industry reports..."

**EXAMPLE - CORRECT APPROACH:**
✅ "Implementation phase: 
COMPETITOR ANALYSIS RESULTS:

Company A: 
- Market Share: 23.5% (Source: Industry Report 2024)
- Pricing: Premium tier ($199/month)
- Customer Base: 50,000+ enterprise clients
- Service Quality: 4.2/5 average rating

Company B:
- Market Share: 18.2% (Source: MarketAnalytics.com)
- Pricing: Mid-tier ($99/month)
- Customer Base: 125,000+ SMB clients  
- Service Quality: 3.8/5 average rating

[Complete analysis with actual data continues...]"

QUALITY EXPECTATIONS:
- **EXECUTION OVER EXPLANATION**: Focus 90% on doing the work, 10% on explaining
- **CONCRETE DELIVERABLES**: Provide tangible outputs, not theoretical approaches
- **USE AVAILABLE TOOLS**: Leverage any tools you have access to for better results
- **COMPLETENESS**: Deliver the full requirement, not partial explanations
- **ACTIONABLE RESULTS**: Ensure your output can be directly used or implemented

⚠️ **REMINDER: Your response will be evaluated on the actual work completed, not on the quality of your explanations about what you might do.** ⚠️
`;
  }

  /**
   * Handle enhanced task completion with performance tracking
   */
  private async handleEnhancedTaskCompletion(
    execution: EnhancedTaskExecution,
    result: string,
    expeditionId: string
  ): Promise<void> {
    console.log(`✅ [TASK-EXECUTOR] Task completed: ${execution.taskId}`);
    
    execution.status = 'completed';
    execution.actualEndTime = new Date().toISOString();
    const actualDuration = execution.actualStartTime ? 
      (new Date(execution.actualEndTime).getTime() - new Date(execution.actualStartTime).getTime()) / (1000 * 60) : 0;
    
    // Update task status to completed directly (no review needed)
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    await taskRepo.updateStatus(execution.taskId, 'completed');
    await taskRepo.updateResult(execution.taskId, result);
    
    // Emit WebSocket task completion event for real-time updates
    this.webSocketEmitter.emitTaskComplete(expeditionId, {
      taskId: execution.taskId,
      result,
      duration: actualDuration
    });
    
    // Get task details for activity tracking
    const task = await taskRepo.findById(execution.taskId);
    const taskTitle = task?.title || 'Unknown Task';
    
    // Emit task completion message
    if (this.webSocketEmitter) {
      const messageRepo = RepositoryFactory.getExpeditionMessageRepository();
      const completionMessage = await messageRepo.create({
        expeditionId,
        role: 'agent' as const,
        agentId: execution.agentId,
        content: `✅ **Task Completed**\n\n**Task:** ${taskTitle}\n**Agent:** ${this.agentNames.get(execution.agentId) || execution.agentId}\n\n**Result:**\n${result}`,
        messageType: 'task-work' as const,
        timestamp: new Date().toISOString(),
        metadata: {
          taskId: execution.taskId,
          agentId: execution.agentId,
          duration: Math.round(actualDuration),
          qualityScore: execution.performanceMetrics?.qualityScore,
          retryCount: execution.retryCount
        }
      });
      
      this.webSocketEmitter.emitExpeditionMessage(expeditionId, completionMessage);
    }
    
    // Store performance metrics
    if (execution.performanceMetrics) {
      const agentHistory = this.performanceHistory.get(execution.agentId) || [];
      agentHistory.push(execution.performanceMetrics);
      this.performanceHistory.set(execution.agentId, agentHistory);
    }
    
    // Emit task completion activity
    this.emitAgentActivity(
      expeditionId,
      execution.agentId,
      'task_completed',
      `Completed "${taskTitle}"`,
      execution.taskId,
      taskTitle,
      { 
        duration: actualDuration,
        qualityScore: execution.performanceMetrics?.qualityScore 
      }
    );
    
    const completedTask: CompletedTask = {
      taskId: execution.taskId,
      agentId: execution.agentId,
      result,
      completionTime: execution.actualEndTime,
      actualDuration,
      qualityScore: execution.performanceMetrics?.qualityScore
    };
    
    // Emit completion and clean up
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
   * Handle enhanced task error with intelligent recovery
   */
  private async handleEnhancedTaskError(
    execution: EnhancedTaskExecution,
    error: any,
    options: TaskExecutionOptions,
    expeditionId: string,
    taskTitle: string
  ): Promise<void> {
    console.error(`❌ [TASK-EXECUTOR] Enhanced task failed: ${execution.taskId}`, error);
    
    execution.status = 'failed';
    execution.issues?.push(error instanceof Error ? error.message : 'Unknown error');
    
    // Update task status in database
    const taskRepo = RepositoryFactory.getExpeditionTaskRepository();
    await taskRepo.updateStatus(execution.taskId, 'failed');
    
    // Check if retry is possible
    const retryLimit = options.retryLimit || this.config.maxRetries;
    const isFinalFailure = execution.retryCount >= retryLimit || !this.isRetryableError(error);
    
    // Emit WebSocket task failure event for real-time updates (only for final failures)
    if (isFinalFailure) {
      this.webSocketEmitter.emitTaskFailed(expeditionId, {
        taskId: execution.taskId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    if (execution.retryCount < retryLimit && this.isRetryableError(error)) {
      console.log(`🔄 [TASK-EXECUTOR] Task will be retried: ${execution.taskId} (attempt ${execution.retryCount + 1})`);
      execution.status = 'pending';
      execution.progress = 0;
      // Retry will be handled by the intelligent retry mechanism
    } else {
      // Final failure - emit task failed activity
      this.emitAgentActivity(
        expeditionId,
        execution.agentId,
        'task_failed',
        `Failed to complete "${taskTitle}"`,
        execution.taskId,
        taskTitle,
        { 
          error: error instanceof Error ? error.message : 'Unknown error',
          retryCount: execution.retryCount
        }
      );
      
      // Clean up
      this.activeExecutions.delete(execution.taskId);
      const subject = this.executionSubjects.get(execution.taskId);
      if (subject) {
        subject.error(error);
        this.executionSubjects.delete(execution.taskId);
      }
    }
  }

  /**
   * Start advanced progress monitoring with performance tracking
   */
  private startAdvancedProgressMonitoring(): void {
    // Monitor progress every 15 seconds for more responsive updates
    timer(0, 15000).pipe(
      takeUntil(this.stopSubject)
    ).subscribe(() => {
      this.updateAdvancedExecutionProgress();
      this.monitorPerformanceMetrics();
      this.detectAndResolveBottlenecks();
    });
  }

  /**
   * Start resource optimization monitoring
   */
  private startResourceOptimization(): void {
    // Optimize resources every 30 seconds
    timer(0, 30000).pipe(
      takeUntil(this.stopSubject)
    ).subscribe(() => {
      this.optimizeResourceAllocation();
      this.rebalanceWorkload();
    });
  }

  /**
   * Update advanced execution progress with performance insights
   */
  private updateAdvancedExecutionProgress(): void {
    for (const [taskId, execution] of this.activeExecutions) {
      if (execution.status === 'in-progress') {
        // Calculate progress based on multiple factors
        const timeProgress = this.calculateTimeBasedProgress(execution);
        const resourceProgress = this.calculateResourceBasedProgress(execution);
        const agentProgress = this.calculateAgentBasedProgress(execution);
        
        // Weighted average of different progress indicators
        const combinedProgress = Math.min(95, Math.max(execution.progress || 0, 
          (timeProgress * 0.4) + (resourceProgress * 0.3) + (agentProgress * 0.3)
        ));
        
        execution.progress = combinedProgress;
        
        // Update estimated completion time based on current progress
        if (execution.actualStartTime && combinedProgress > 10) {
          const elapsed = Date.now() - new Date(execution.actualStartTime).getTime();
          const estimatedTotal = (elapsed / (combinedProgress / 100));
          execution.estimatedEndTime = new Date(Date.now() + (estimatedTotal - elapsed)).toISOString();
        }
        
        // Emit progress update
        const subject = this.executionSubjects.get(taskId);
        if (subject) {
          subject.next({ ...execution });
        }
      }
    }
  }

  /**
   * Get current execution status
   */
  getExecutionStatus(): EnhancedTaskExecution[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Stop all task executions
   */
  stopAllExecutions(): void {
    console.log('🛑 [TASK-EXECUTOR] Stopping all enhanced task executions');
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
  getTaskExecutionObservable(taskId: string): Observable<EnhancedTaskExecution> | null {
    const subject = this.executionSubjects.get(taskId);
    return subject ? subject.asObservable() : null;
  }

  /**
   * Get performance analytics
   */
  getPerformanceAnalytics(): {
    totalExecutions: number;
    averageExecutionTime: number;
    successRate: number;
    averageRetryRate: number;
    resourceUtilization: Record<string, number>;
    topPerformingAgents: Array<{ agentId: string; averageTime: number; successRate: number }>;
  } {
    const allMetrics: TaskPerformanceMetrics[] = [];
    this.performanceHistory.forEach(metrics => allMetrics.push(...metrics));

    if (allMetrics.length === 0) {
      return {
        totalExecutions: 0,
        averageExecutionTime: 0,
        successRate: 0,
        averageRetryRate: 0,
        resourceUtilization: {},
        topPerformingAgents: []
      };
    }

    const totalTime = allMetrics.reduce((sum, m) => sum + m.executionTime, 0);
    const successfulExecutions = allMetrics.filter(m => m.errorRate === 0).length;
    const totalRetryRate = allMetrics.reduce((sum, m) => sum + m.retryRate, 0);

    // Calculate resource utilization
    const resourceUtil: Record<string, number> = {};
    allMetrics.forEach(m => {
      Object.entries(m.resourceUtilization).forEach(([type, util]) => {
        resourceUtil[type] = (resourceUtil[type] || 0) + util;
      });
    });
    Object.keys(resourceUtil).forEach(key => {
      resourceUtil[key] = resourceUtil[key] / allMetrics.length;
    });

    // Calculate top performing agents
    const agentPerformance = new Map<string, { times: number[]; errors: number[] }>();
    this.performanceHistory.forEach((metrics, agentId) => {
      const times = metrics.map(m => m.executionTime);
      const errors = metrics.map(m => m.errorRate);
      agentPerformance.set(agentId, { times, errors });
    });

    const topPerformingAgents = Array.from(agentPerformance.entries())
      .map(([agentId, data]) => ({
        agentId,
        averageTime: data.times.reduce((a, b) => a + b, 0) / data.times.length,
        successRate: (data.errors.filter(e => e === 0).length / data.errors.length) * 100
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    return {
      totalExecutions: allMetrics.length,
      averageExecutionTime: totalTime / allMetrics.length,
      successRate: (successfulExecutions / allMetrics.length) * 100,
      averageRetryRate: totalRetryRate / allMetrics.length,
      resourceUtilization: resourceUtil,
      topPerformingAgents
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Load agent details for activity tracking
   */
  private async loadAgentDetails(assignments: AgentAssignment[]): Promise<void> {
    const agentIds = [...new Set(assignments.map(a => a.agentId))];
    const agentRepo = RepositoryFactory.getAgentRepository();
    
    for (const agentId of agentIds) {
      try {
        const agent = await agentRepo.findById(agentId);
        if (agent) {
          this.agentNames.set(agentId, agent.name);
        }
      } catch (error) {
        console.warn(`Failed to load agent details for ${agentId}:`, error);
        this.agentNames.set(agentId, agentId.slice(0, 8));
      }
    }
  }

  /**
   * Emit agent activity event
   */
  private emitAgentActivity(
    expeditionId: string,
    agentId: string,
    type: AgentActivityType,
    message: string,
    taskId?: string,
    taskTitle?: string,
    metadata?: any
  ): void {
    const agentName = this.agentNames.get(agentId) || agentId.slice(0, 8);
    
    const activity: AgentActivity = {
      id: `activity-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      expeditionId,
      agentId,
      agentName,
      type,
      taskId,
      taskTitle,
      message,
      timestamp: new Date().toISOString(),
      metadata
    };

    // Emit via WebSocket if available
    if (this.webSocketEmitter) {
      this.webSocketEmitter.emitAgentActivity(expeditionId, {
        agentId: activity.agentId,
        activity: `${activity.type}: ${activity.message}`,
        taskId: activity.taskId
      });

      // Also emit as a specific activity event
      // Note: The socketServer property is private, so we rely on the emitAgentActivity method
      // to handle the emission internally
    }
  }


  /**
   * Initialize resource pool
   */
  private initializeResourcePool(): void {
    this.resourcePool = {
      agents: new Map(),
      memory: 8192, // 8GB default
      compute: 100, // 100 compute units
      network: 1000, // 1Gbps
      storage: 1024 // 1TB
    };
  }

  /**
   * Initialize execution strategy
   */
  private initializeExecutionStrategy(): void {
    this.executionStrategy = {
      type: 'adaptive',
      maxConcurrency: 3,
      resourceAllocation: 'balanced',
      conflictResolution: 'negotiate',
      retryStrategy: 'exponential-backoff'
    };
  }

  /**
   * Analyze resource requirements for a task
   */
  private async analyzeResourceRequirements(task: TaskBreakdown, agentId: string): Promise<ResourceRequirement[]> {
    const requirements: ResourceRequirement[] = [];

    // Agent resource requirement
    requirements.push({
      type: 'agent',
      amount: 1,
      priority: 'high',
      duration: task.estimatedEffort || 30
    });

    // Memory requirement based on task complexity
    const memoryAmount = Math.min(1024, (task.requiredSkills.length * 128) + (task.description.length / 10));
    requirements.push({
      type: 'memory',
      amount: memoryAmount,
      priority: 'medium',
      duration: task.estimatedEffort || 30
    });

    // Compute requirement based on estimated effort
    const computeAmount = Math.min(50, (task.estimatedEffort || 30) / 2);
    requirements.push({
      type: 'compute',
      amount: computeAmount,
      priority: 'medium',
      duration: task.estimatedEffort || 30
    });

    return requirements;
  }

  /**
   * Calculate task priority based on characteristics
   */
  private calculateTaskPriority(task: TaskBreakdown, allTasks: TaskBreakdown[]): TaskPriority {
    let priorityScore = 0;

    // Factor in dependencies
    const dependents = allTasks.filter(t => t.dependencies.includes(task.id));
    priorityScore += dependents.length * 2;

    // Factor in required skills complexity
    priorityScore += task.requiredSkills.length;

    // Factor in estimated effort
    if (task.estimatedEffort) {
      if (task.estimatedEffort > 120) priorityScore += 3;
      else if (task.estimatedEffort > 60) priorityScore += 2;
      else if (task.estimatedEffort > 30) priorityScore += 1;
    }

    // Convert score to priority
    if (priorityScore >= 8) return 'urgent';
    if (priorityScore >= 6) return 'critical';
    if (priorityScore >= 4) return 'high';
    if (priorityScore >= 2) return 'medium';
    return 'low';
  }

  /**
   * Estimate performance metrics for a task
   */
  private estimatePerformanceMetrics(task: TaskBreakdown, agentId: string): TaskPerformanceMetrics {
    // Get historical performance for this agent
    const agentHistory = this.performanceHistory.get(agentId) || [];
    const avgExecutionTime = agentHistory.length > 0 ?
      agentHistory.reduce((sum, m) => sum + m.executionTime, 0) / agentHistory.length :
      task.estimatedEffort || 30;

    return {
      executionTime: avgExecutionTime,
      resourceUtilization: {
        agent: 80,
        memory: 60,
        compute: 70,
        network: 40,
        storage: 30
      },
      throughput: 60 / avgExecutionTime,
      errorRate: agentHistory.length > 0 ?
        agentHistory.reduce((sum, m) => sum + m.errorRate, 0) / agentHistory.length : 5,
      retryRate: 10,
      efficiency: 0.85,
      bottlenecks: []
    };
  }

  /**
   * Calculate estimated completion time
   */
  private calculateEstimatedCompletion(task: TaskBreakdown): string {
    const estimatedMinutes = task.estimatedEffort || 30;
    const completionTime = new Date(Date.now() + estimatedMinutes * 60 * 1000);
    return completionTime.toISOString();
  }

  /**
   * Calculate scheduling flexibility
   */
  private calculateSchedulingFlexibility(execution: EnhancedTaskExecution): number {
    let flexibility = 1.0;

    // Reduce flexibility for high priority tasks
    if (execution.priority === 'urgent' || execution.priority === 'critical') {
      flexibility *= 0.3;
    } else if (execution.priority === 'high') {
      flexibility *= 0.6;
    }

    // Reduce flexibility for resource-intensive tasks
    const resourceIntensive = execution.resourceRequirements?.some(r => r.amount > 50);
    if (resourceIntensive) {
      flexibility *= 0.7;
    }

    return Math.max(0.1, flexibility);
  }

  /**
   * Optimize schedule order
   */
  private optimizeScheduleOrder(schedule: TaskSchedule[]): TaskSchedule[] {
    return schedule.sort((a, b) => {
      // Sort by priority first
      const priorityOrder = { urgent: 5, critical: 4, high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Then by dependencies (tasks with fewer dependencies first)
      const depDiff = a.dependencies.length - b.dependencies.length;
      if (depDiff !== 0) return depDiff;

      // Finally by estimated duration (shorter tasks first)
      return a.estimatedDuration - b.estimatedDuration;
    });
  }

  /**
   * Create execution groups for parallel processing
   */
  private createExecutionGroups(schedule: TaskSchedule[], maxConcurrency: number): ExecutionGroup[] {
    const groups: ExecutionGroup[] = [];
    const processed = new Set<string>();
    let groupId = 0;

    for (const task of schedule) {
      if (processed.has(task.taskId)) continue;

      const group: ExecutionGroup = {
        groupId: `group-${groupId++}`,
        tasks: [task.taskId],
        maxConcurrency: Math.min(maxConcurrency, 3),
        dependencies: task.dependencies
      };

      // Find other tasks that can run in parallel
      for (const otherTask of schedule) {
        if (processed.has(otherTask.taskId) || otherTask.taskId === task.taskId) continue;
        
        // Check if tasks can run in parallel (no dependencies between them)
        const canRunInParallel = !task.dependencies.includes(otherTask.taskId) &&
                                !otherTask.dependencies.includes(task.taskId) &&
                                group.tasks.length < group.maxConcurrency;
        
        if (canRunInParallel) {
          group.tasks.push(otherTask.taskId);
        }
      }

      // Mark all tasks in group as processed
      group.tasks.forEach(taskId => processed.add(taskId));
      groups.push(group);
    }

    return groups;
  }

  /**
   * Create pipeline stages
   */
  private createPipelineStages(schedule: TaskSchedule[]): string[][] {
    const stages: string[][] = [];
    const processed = new Set<string>();
    
    // Create stages based on dependency levels
    while (processed.size < schedule.length) {
      const currentStage: string[] = [];
      
      for (const task of schedule) {
        if (processed.has(task.taskId)) continue;
        
        // Check if all dependencies are processed
        const dependenciesProcessed = task.dependencies.every(dep => processed.has(dep));
        
        if (dependenciesProcessed) {
          currentStage.push(task.taskId);
        }
      }
      
      if (currentStage.length === 0) break; // Prevent infinite loop
      
      currentStage.forEach(taskId => processed.add(taskId));
      stages.push(currentStage);
    }
    
    return stages;
  }

  /**
   * Create performance monitor
   */
  private createPerformanceMonitor(): PerformanceMonitor {
    return {
      getCurrentMetrics: (): SystemMetrics => ({
        cpuUtilization: Math.random() * 100, // Mock data
        memoryUtilization: Math.random() * 100,
        taskThroughput: this.activeExecutions.size,
        errorRate: 5,
        averageResponseTime: 2000
      }),
      getResourceUtilization: (): Record<string, number> => ({
        agent: 75,
        memory: 60,
        compute: 80,
        network: 45,
        storage: 30
      }),
      getBottlenecks: (): string[] => ['memory', 'agent_availability']
    };
  }

  /**
   * Should switch execution strategy
   */
  private shouldSwitchStrategy(metrics: SystemMetrics): boolean {
    return metrics.errorRate > 10 || metrics.cpuUtilization > 90 || metrics.averageResponseTime > 5000;
  }

  /**
   * Allocate resources for task execution
   */
  private async allocateResources(requirements: ResourceRequirement[], taskId: string): Promise<AllocatedResource[]> {
    const allocated: AllocatedResource[] = [];
    const now = new Date().toISOString();

    for (const req of requirements) {
      // Simple allocation logic - in production this would be more sophisticated
      const resource: AllocatedResource = {
        id: `${req.type}-${taskId}-${Date.now()}`,
        type: req.type,
        amount: req.amount,
        allocatedAt: now,
        utilizationRate: 0
      };

      allocated.push(resource);
    }

    return allocated;
  }

  /**
   * Release allocated resources
   */
  private async releaseResources(resources: AllocatedResource[], taskId: string): Promise<void> {
    console.log(`🔓 [TASK-EXECUTOR] Releasing ${resources.length} resources for task: ${taskId}`);
    // In production, this would update the resource pool
  }

  /**
   * Detect conflicts in task execution
   */
  private async detectConflicts(execution: EnhancedTaskExecution): Promise<ConflictResolution[]> {
    const conflicts: ConflictResolution[] = [];
    
    // Check for resource conflicts
    const resourceConflicts = this.detectResourceConflicts(execution);
    conflicts.push(...resourceConflicts);
    
    return conflicts;
  }

  /**
   * Detect resource conflicts
   */
  private detectResourceConflicts(execution: EnhancedTaskExecution): ConflictResolution[] {
    const conflicts: ConflictResolution[] = [];
    
    // Simple conflict detection - check if agent is overloaded
    const agentResource = this.resourcePool.agents.get(execution.agentId);
    if (agentResource && agentResource.currentLoad > 80) {
      conflicts.push({
        conflictType: 'resource',
        description: `Agent ${execution.agentId} is overloaded (${agentResource.currentLoad}% load)`,
        resolution: 'Queued for later execution',
        resolvedAt: new Date().toISOString(),
        impact: 'medium'
      });
    }
    
    return conflicts;
  }

  /**
   * Resolve conflicts
   */
  private async resolveConflicts(conflicts: ConflictResolution[], execution: EnhancedTaskExecution): Promise<ConflictResolution[]> {
    // Simple resolution - just log and return
    console.log(`⚖️ [TASK-EXECUTOR] Resolving ${conflicts.length} conflicts for task: ${execution.taskId}`);
    return conflicts;
  }

  /**
   * Calculate resource utilization
   */
  private calculateResourceUtilization(resources: AllocatedResource[]): Record<string, number> {
    const utilization: Record<string, number> = {};
    
    resources.forEach(resource => {
      utilization[resource.type] = resource.utilizationRate || Math.random() * 100;
    });
    
    return utilization;
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(execution: EnhancedTaskExecution): string[] {
    const bottlenecks: string[] = [];
    
    // Check for common bottlenecks
    if (execution.retryCount > 0) {
      bottlenecks.push('task_reliability');
    }
    
    if (execution.allocatedResources?.some(r => r.utilizationRate && r.utilizationRate > 90)) {
      bottlenecks.push('resource_saturation');
    }
    
    return bottlenecks;
  }

  /**
   * Calculate backoff delay for retries
   */
  private calculateBackoffDelay(attempt: number, priority: TaskPriority): number {
    const baseDelay = 1000; // 1 second
    const priorityMultiplier = {
      urgent: 0.5,
      critical: 0.7,
      high: 1.0,
      medium: 1.5,
      low: 2.0
    };
    
    const multiplier = priorityMultiplier[priority] || 1.0;
    return Math.min(30000, baseDelay * Math.pow(2, attempt - 1) * multiplier);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'timeout',
      'network',
      'temporary',
      'rate limit',
      'service unavailable'
    ];
    
    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(retryable => errorMessage.includes(retryable));
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
   * Monitor performance metrics
   */
  private monitorPerformanceMetrics(): void {
    // Log current performance metrics
    const activeCount = this.activeExecutions.size;
    const completedCount = this.performanceHistory.size;
    
    console.log(`📊 [TASK-EXECUTOR] Performance metrics - Active: ${activeCount}, Completed: ${completedCount}`);
  }

  /**
   * Detect and resolve bottlenecks
   */
  private detectAndResolveBottlenecks(): void {
    // Simple bottleneck detection and resolution
    const overloadedExecutions = Array.from(this.activeExecutions.values())
      .filter(e => e.retryCount > 2);
    
    if (overloadedExecutions.length > 0) {
      console.log(`🚨 [TASK-EXECUTOR] Detected ${overloadedExecutions.length} problematic executions`);
    }
  }

  /**
   * Optimize resource allocation
   */
  private optimizeResourceAllocation(): void {
    // Simple resource optimization
    console.log(`🔧 [TASK-EXECUTOR] Optimizing resource allocation for ${this.activeExecutions.size} active tasks`);
  }

  /**
   * Rebalance workload across agents
   */
  private rebalanceWorkload(): void {
    // Simple workload rebalancing
    const agentLoads = new Map<string, number>();
    
    this.activeExecutions.forEach(execution => {
      const currentLoad = agentLoads.get(execution.agentId) || 0;
      agentLoads.set(execution.agentId, currentLoad + 1);
    });
    
    console.log(`⚖️ [TASK-EXECUTOR] Agent workload distribution:`, Object.fromEntries(agentLoads));
  }

  /**
   * Calculate time-based progress
   */
  private calculateTimeBasedProgress(execution: EnhancedTaskExecution): number {
    if (!execution.actualStartTime || !execution.estimatedCompletion) return 0;
    
    const startTime = new Date(execution.actualStartTime).getTime();
    const estimatedEnd = new Date(execution.estimatedCompletion).getTime();
    const now = Date.now();
    
    const elapsed = now - startTime;
    const total = estimatedEnd - startTime;
    
    return Math.min(90, (elapsed / total) * 100);
  }

  /**
   * Calculate resource-based progress
   */
  private calculateResourceBasedProgress(execution: EnhancedTaskExecution): number {
    if (!execution.allocatedResources) return 50;
    
    const avgUtilization = execution.allocatedResources.reduce((sum, r) =>
      sum + (r.utilizationRate || 50), 0) / execution.allocatedResources.length;
    
    return Math.min(95, avgUtilization);
  }

  /**
   * Calculate agent-based progress
   */
  private calculateAgentBasedProgress(execution: EnhancedTaskExecution): number {
    // Simple heuristic based on intermediate results
    const intermediateCount = execution.intermediateResults?.length || 0;
    return Math.min(80, intermediateCount * 25);
  }

  /**
   * Extract chain of thought from agent response
   */
  private extractChainOfThought(response: string): any {
    const chainOfThought: any = {
      reasoning: '',
      steps: [],
      alternatives: [],
      confidence: 0.75,
      assumptions: [],
      constraints: [],
      risks: [],
      mitigations: [],
      dependencies: [],
      tools: [],
      learnings: []
    };

    // Extract sections using regex patterns
    const sections = {
      thinking: /\*\*THINKING PROCESS:\*\*([\s\S]*?)(?=\*\*|$)/i,
      approach: /\*\*APPROACH:\*\*([\s\S]*?)(?=\*\*|$)/i,
      risk: /\*\*RISK ANALYSIS:\*\*([\s\S]*?)(?=\*\*|$)/i,
      execution: /\*\*EXECUTION:\*\*([\s\S]*?)(?=\*\*|$)/i,
      reflection: /\*\*REFLECTION:\*\*([\s\S]*?)(?=\*\*|$)/i
    };

    // Parse thinking process
    const thinkingMatch = response.match(sections.thinking);
    if (thinkingMatch) {
      const thinkingText = thinkingMatch[1];
      const lines = thinkingText.split('\n').filter(line => line.trim().startsWith('-'));
      
      lines.forEach(line => {
        const content = line.replace(/^-\s*/, '').trim();
        if (content.toLowerCase().includes('understand')) {
          chainOfThought.reasoning = content;
        } else if (content.toLowerCase().includes('assumption')) {
          chainOfThought.assumptions.push(content);
        } else if (content.toLowerCase().includes('constraint')) {
          chainOfThought.constraints.push(content);
        }
      });
    }

    // Parse approach
    const approachMatch = response.match(sections.approach);
    if (approachMatch) {
      const approachText = approachMatch[1];
      const lines = approachText.split('\n').filter(line => line.trim().startsWith('-'));
      
      lines.forEach(line => {
        const content = line.replace(/^-\s*/, '').trim();
        if (content.toLowerCase().includes('step')) {
          chainOfThought.steps.push(content);
        } else if (content.toLowerCase().includes('alternative')) {
          chainOfThought.alternatives.push(content);
        } else if (content.toLowerCase().includes('tool') || content.toLowerCase().includes('resource')) {
          chainOfThought.tools.push(content);
        } else if (content.toLowerCase().includes('depend')) {
          chainOfThought.dependencies.push(content);
        }
      });
    }

    // Parse risk analysis
    const riskMatch = response.match(sections.risk);
    if (riskMatch) {
      const riskText = riskMatch[1];
      const lines = riskText.split('\n').filter(line => line.trim().startsWith('-'));
      
      lines.forEach(line => {
        const content = line.replace(/^-\s*/, '').trim();
        if (content.toLowerCase().includes('risk') || content.toLowerCase().includes('issue')) {
          chainOfThought.risks.push(content);
        } else if (content.toLowerCase().includes('mitigat')) {
          chainOfThought.mitigations.push(content);
        } else if (content.toLowerCase().includes('confidence')) {
          // Try to extract confidence value
          const confidenceMatch = content.match(/(\d+)%/);
          if (confidenceMatch) {
            chainOfThought.confidence = parseInt(confidenceMatch[1]) / 100;
          }
        }
      });
    }

    // Parse reflection
    const reflectionMatch = response.match(sections.reflection);
    if (reflectionMatch) {
      const reflectionText = reflectionMatch[1];
      const lines = reflectionText.split('\n').filter(line => line.trim().startsWith('-'));
      
      lines.forEach(line => {
        const content = line.replace(/^-\s*/, '').trim();
        if (content.toLowerCase().includes('insight') || content.toLowerCase().includes('learn')) {
          chainOfThought.learnings.push(content);
        }
      });
    }

    // If no structured content found, use simple extraction
    if (!chainOfThought.reasoning && chainOfThought.steps.length === 0) {
      chainOfThought.reasoning = 'Analyzing task requirements and applying specialized knowledge';
      chainOfThought.steps = [
        'Understanding the task requirements',
        'Applying domain expertise',
        'Generating comprehensive solution'
      ];
    }

    return chainOfThought;
  }

  /**
   * Format chain of thought message for display
   */
  private formatChainOfThoughtMessage(taskTitle: string, chainOfThought: any): string {
    let content = `🧠 **Chain of Thought for "${taskTitle}"**\n\n`;
    
    if (chainOfThought.reasoning) {
      content += `**Understanding:** ${chainOfThought.reasoning}\n\n`;
    }
    
    if (chainOfThought.steps.length > 0) {
      content += `**Approach:**\n`;
      chainOfThought.steps.forEach((step: string, index: number) => {
        content += `${index + 1}. ${step}\n`;
      });
      content += '\n';
    }
    
    if (chainOfThought.assumptions.length > 0) {
      content += `**Assumptions:**\n`;
      chainOfThought.assumptions.forEach((assumption: string) => {
        content += `• ${assumption}\n`;
      });
      content += '\n';
    }
    
    if (chainOfThought.risks.length > 0) {
      content += `**Identified Risks:**\n`;
      chainOfThought.risks.forEach((risk: string) => {
        content += `⚠️ ${risk}\n`;
      });
      content += '\n';
    }
    
    if (chainOfThought.tools.length > 0) {
      content += `**Tools & Resources:**\n`;
      chainOfThought.tools.forEach((tool: string) => {
        content += `🔧 ${tool}\n`;
      });
      content += '\n';
    }
    
    content += `**Confidence Level:** ${Math.round(chainOfThought.confidence * 100)}%`;
    
    return content;
  }

  /**
   * Extract execution result from agent response
   */
  private extractExecutionResult(response: string): string {
    // Look for the IMPLEMENTATION PHASE section first
    const implementationMatch = response.match(/\*\*IMPLEMENTATION PHASE:\*\*([\s\S]*?)(?=\*\*BRIEF SUMMARY:\*\*|\*\*|$)/i);
    
    if (implementationMatch) {
      return implementationMatch[1].trim();
    }
    
    // Fall back to EXECUTION section for backwards compatibility
    const executionMatch = response.match(/\*\*EXECUTION:\*\*([\s\S]*?)(?=\*\*|$)/i);
    
    if (executionMatch) {
      return executionMatch[1].trim();
    }
    
    // If no structured sections found, try to extract the main content
    // Skip thinking/planning sections that don't contain actual work
    const sectionsToSkip = [
      /\*\*THINKING PROCESS:\*\*[\s\S]*?(?=\*\*|$)/gi,
      /\*\*APPROACH:\*\*[\s\S]*?(?=\*\*|$)/gi,
      /\*\*RISK ANALYSIS:\*\*[\s\S]*?(?=\*\*|$)/gi,
      /\*\*REFLECTION:\*\*[\s\S]*?(?=\*\*|$)/gi,
      /\*\*BRIEF SUMMARY:\*\*[\s\S]*?(?=\*\*|$)/gi
    ];
    
    let cleanedResponse = response;
    for (const pattern of sectionsToSkip) {
      cleanedResponse = cleanedResponse.replace(pattern, '');
    }
    
    // If we still have substantial content, return it, otherwise return the full response
    const cleaned = cleanedResponse.trim();
    return cleaned.length > 50 ? cleaned : response;
  }
}