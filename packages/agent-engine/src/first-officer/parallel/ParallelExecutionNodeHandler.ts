/**
 * Parallel Execution Node Handler for LangGraph Integration
 * 
 * Integrates the parallel execution framework with LangGraph workflow nodes
 */

import { RunnableConfig } from '@langchain/core/runnables';
import { FirstOfficerState, FirstOfficerConfig, TaskExecutionOptions } from '../types';
import { ParallelExecutionFramework, ParallelExecutionOptions } from './ParallelExecutionFramework';
import { WebSocketEventEmitter } from './WebSocketEventEmitter';
import { TaskExecutor } from '../TaskExecutor';
import { lastValueFrom } from 'rxjs';
import { tap, toArray } from 'rxjs/operators';

/**
 * Create parallel execution node handler
 */
export function createParallelExecutionHandler(
  config: FirstOfficerConfig,
  taskExecutor: TaskExecutor,
  wsEmitter?: WebSocketEventEmitter
) {
  // Create WebSocket emitter if not provided
  const emitter = wsEmitter || new WebSocketEventEmitter();
  
  // Create parallel execution framework
  const parallelFramework = new ParallelExecutionFramework(config, emitter);
  
  /**
   * Execute tasks in parallel node handler
   */
  return async function executeParallel(
    state: FirstOfficerState,
    config?: RunnableConfig
  ): Promise<Partial<FirstOfficerState>> {
    console.log('🚀 [PARALLEL-EXECUTOR-NODE] Starting parallel task execution');
    
    try {
      // Check if we have tasks and assignments
      if (!state.taskBreakdown || state.taskBreakdown.length === 0) {
        console.warn('⚠️ [PARALLEL-EXECUTOR-NODE] No tasks to execute');
        return {
          currentPhase: 'failed',
          errors: [...(state.errors || []), 'No tasks available for execution'],
          lastUpdated: new Date().toISOString()
        };
      }
      
      if (!state.selectedAgents || state.selectedAgents.length === 0) {
        console.warn('⚠️ [PARALLEL-EXECUTOR-NODE] No agent assignments available');
        return {
          currentPhase: 'failed',
          errors: [...(state.errors || []), 'No agents assigned to tasks'],
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Configure parallel execution options
      const parallelOptions: ParallelExecutionOptions = {
        maxConcurrentTasks: determineOptimalConcurrency(state),
        taskTimeout: config?.timeout || 300000, // 5 minutes default
        retryLimit: 3,
        progressUpdateInterval: 5000, // 5 seconds
        enableResourceOptimization: true,
        enableAdaptiveScheduling: true,
        enableFailureIsolation: true
      };
      
      // Update state to indicate parallel execution
      const executingState: Partial<FirstOfficerState> = {
        currentPhase: 'coordinating',
        activeExecutions: state.taskBreakdown.map(task => ({
          taskId: task.id,
          agentId: state.selectedAgents?.find(a => 
            a.assignedTasks.includes(task.id)
          )?.agentId || '',
          status: 'pending',
          startTime: new Date().toISOString(),
          progress: 0
        })),
        parallelExecutionEnabled: true,
        lastUpdated: new Date().toISOString()
      };
      
      // Emit execution start event
      emitter.emitExpeditionProgress(state.expeditionId, {
        progress: 0,
        completedTasks: 0,
        totalTasks: state.taskBreakdown.length,
        throughput: 0,
        estimatedTimeRemaining: state.taskBreakdown.reduce((sum, t) => 
          sum + (t.estimatedEffort || 30), 0
        )
      });
      
      // Execute tasks in parallel
      const execution$ = await parallelFramework.executeParallel(
        state.taskBreakdown,
        state.selectedAgents || [],
        state.expeditionId,
        state.userId,
        parallelOptions
      );
      
      // Collect completed tasks
      const completedTasks = await lastValueFrom(
        execution$.pipe(
          tap(completed => {
            console.log(`✅ [PARALLEL-EXECUTOR-NODE] Task completed: ${completed.taskId}`);
          }),
          toArray()
        )
      );
      
      // Calculate quality scores
      const qualityChecks = completedTasks.map(task => ({
        taskId: task.taskId,
        result: task.result,
        score: calculateQualityScore(task),
        issues: [],
        suggestions: [],
        approved: true,
        assessedBy: 'first-officer' as const,
        assessedAt: new Date().toISOString()
      }));
      
      // Get execution metrics
      const metrics = parallelFramework.getExecutionMetrics();
      
      console.log(`✅ [PARALLEL-EXECUTOR-NODE] Parallel execution completed. Tasks: ${completedTasks.length}`);
      console.log(`📊 [PARALLEL-EXECUTOR-NODE] Metrics:`, metrics);
      
      return {
        currentPhase: 'coordinating',
        completedTasks,
        qualityChecks,
        activeExecutions: [],
        parallelExecutionEnabled: true,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [PARALLEL-EXECUTOR-NODE] Parallel execution failed:', error);
      
      // Stop execution on error
      parallelFramework.stopExecution();
      
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Parallel execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  };
}

/**
 * Create sequential execution node handler (fallback)
 */
export function createSequentialExecutionHandler(
  config: FirstOfficerConfig,
  taskExecutor: TaskExecutor
) {
  /**
   * Execute tasks sequentially node handler
   */
  return async function executeSequential(
    state: FirstOfficerState,
    config?: RunnableConfig
  ): Promise<Partial<FirstOfficerState>> {
    console.log('➡️ [SEQUENTIAL-EXECUTOR-NODE] Starting sequential task execution');
    
    try {
      if (!state.taskBreakdown || state.taskBreakdown.length === 0) {
        return {
          currentPhase: 'failed',
          errors: [...(state.errors || []), 'No tasks available for execution'],
          lastUpdated: new Date().toISOString()
        };
      }
      
      if (!state.selectedAgents || state.selectedAgents.length === 0) {
        return {
          currentPhase: 'failed',
          errors: [...(state.errors || []), 'No agents assigned to tasks'],
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Use existing task executor for sequential execution
      const taskOptions: TaskExecutionOptions = {
        timeout: config?.timeout,
        retryLimit: 3,
        qualityThreshold: 70,
        requireApproval: false,
        parallelExecution: false
      };
      
      const execution$ = await taskExecutor.executeTasks(
        state.taskBreakdown,
        state.selectedAgents || [],
        state.expeditionId,
        state.userId,
        taskOptions
      );
      
      // Collect completed tasks
      const completedTasks = await lastValueFrom(
        execution$.pipe(toArray())
      );
      
      console.log(`✅ [SEQUENTIAL-EXECUTOR-NODE] Sequential execution completed. Tasks: ${completedTasks.length}`);
      
      return {
        currentPhase: 'coordinating',
        completedTasks,
        activeExecutions: [],
        parallelExecutionEnabled: false,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ [SEQUENTIAL-EXECUTOR-NODE] Sequential execution failed:', error);
      
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Sequential execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  };
}

/**
 * Determine optimal concurrency based on state
 */
function determineOptimalConcurrency(state: FirstOfficerState): number {
  const taskCount = state.taskBreakdown.length;
  const agentCount = state.selectedAgents?.length || 1;
  
  // Consider task dependencies
  const hasDependencies = state.taskBreakdown.some(t => t.dependencies.length > 0);
  
  // Base concurrency on available agents and task count
  let optimalConcurrency = Math.min(agentCount, Math.ceil(taskCount / 2));
  
  // Adjust for dependencies
  if (hasDependencies) {
    optimalConcurrency = Math.max(2, Math.floor(optimalConcurrency * 0.7));
  }
  
  // Cap at reasonable limits
  return Math.min(8, Math.max(2, optimalConcurrency));
}

/**
 * Calculate quality score for completed task
 */
function calculateQualityScore(task: any): number {
  // Simple quality scoring - in production this would be more sophisticated
  let score = 75; // Base score
  
  // Adjust based on result length (assuming longer = more comprehensive)
  if (task.result && task.result.length > 1000) score += 10;
  if (task.result && task.result.length > 2000) score += 5;
  
  // Adjust based on duration (faster completion might indicate efficiency)
  if (task.actualDuration && task.actualDuration < 20) score += 5;
  
  // Ensure score is within bounds
  return Math.min(100, Math.max(0, score));
}

/**
 * Create a routing handler that decides between parallel and sequential execution
 */
export function createExecutionRoutingHandler(config: FirstOfficerConfig) {
  return function routeAfterPersistence(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }
    
    // Check if parallel execution is enabled and beneficial
    const shouldUseParallel = shouldExecuteInParallel(state, config);
    
    if (shouldUseParallel) {
      console.log('🔀 [EXECUTION-ROUTER] Routing to parallel execution');
      return 'execute_parallel';
    } else {
      console.log('➡️ [EXECUTION-ROUTER] Routing to sequential execution');
      return 'execute_sequential';
    }
  };
}

/**
 * Determine if tasks should be executed in parallel
 */
function shouldExecuteInParallel(
  state: FirstOfficerState,
  config: FirstOfficerConfig
): boolean {
  // Check if parallel execution is enabled
  if (!config.enableParallelExecution || !state.parallelExecutionEnabled) {
    return false;
  }
  
  // Check task count
  const taskCount = state.taskBreakdown.length;
  if (taskCount < 3) {
    return false; // Not worth parallelizing for very few tasks
  }
  
  // Check for parallel groups
  if (state.taskPlan?.parallelGroups && state.taskPlan.parallelGroups.length > 1) {
    return true;
  }
  
  // Check dependencies
  const independentTasks = state.taskBreakdown.filter(t => 
    t.dependencies.length === 0
  ).length;
  
  // Use parallel if we have enough independent tasks
  return independentTasks >= 2;
}