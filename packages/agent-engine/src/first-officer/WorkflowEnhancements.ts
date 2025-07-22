/**
 * Workflow Enhancements for First Officer Agent
 * 
 * This file contains enhanced workflow features including:
 * - Dynamic task dependency resolution
 * - Conditional workflow paths based on analysis results
 * - User approval gates for critical decisions
 * - Workflow state persistence for resuming interrupted expeditions
 * - Parallel execution capabilities
 * - Advanced error handling and retry mechanisms
 */

import { RepositoryFactory } from '@starships/models';
import {
  FirstOfficerState,
  FirstOfficerConfig,
  TaskDependency,
  ParallelExecutionGroup,
  UserApprovalResponse,
  WorkflowCheckpoint,
  EnhancedWorkflowOptions,
  ObjectiveAnalysis,
  TaskPlan,
  CompletedTask,
  QualityCheck
} from './types';
import { WorkflowPhase } from '@starships/protocol';
import { ChatCoordinator } from './ChatCoordinator';

/**
 * Dynamic Task Dependency Resolver
 */
export class TaskDependencyResolver {
  private config: FirstOfficerConfig;

  constructor(config: FirstOfficerConfig) {
    this.config = config;
  }

  /**
   * Resolve task dependencies and create execution plan
   */
  async resolveDependencies(
    state: FirstOfficerState,
    strategy: 'strict' | 'flexible' | 'adaptive' = 'adaptive'
  ): Promise<Partial<FirstOfficerState>> {
    console.log(`🔗 [DEPENDENCY-RESOLVER] Resolving task dependencies with ${strategy} strategy`);

    try {
      const dependencies = this.extractDependencies(state);
      const dependencyGraph = this.buildDependencyGraph(dependencies);
      
      // Check for cyclic dependencies
      if (this.hasCyclicDependencies(dependencyGraph)) {
        if (strategy === 'strict') {
          throw new Error('Cyclic dependencies detected and strict mode is enabled');
        } else {
          // Attempt to resolve cycles
          const resolvedGraph = this.resolveCyclicDependencies(dependencyGraph, strategy);
          return {
            dependencyGraph: resolvedGraph,
            criticalPath: this.calculateCriticalPath(resolvedGraph, state.taskBreakdown),
            lastUpdated: new Date().toISOString()
          };
        }
      }

      // Calculate execution groups for parallel processing
      const parallelGroups = this.calculateParallelExecutionGroups(dependencyGraph, state.taskBreakdown);
      
      return {
        dependencyGraph,
        criticalPath: this.calculateCriticalPath(dependencyGraph, state.taskBreakdown),
        taskPlan: {
          ...state.taskPlan!,
          parallelGroups: parallelGroups.map(group => group.tasks),
          dependencies: dependencyGraph
        },
        parallelExecutionEnabled: parallelGroups.length > 1,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [DEPENDENCY-RESOLVER] Failed to resolve dependencies:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Dependency resolution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Extract dependencies from task breakdown
   */
  private extractDependencies(state: FirstOfficerState): TaskDependency[] {
    const dependencies: TaskDependency[] = [];
    
    for (const task of state.taskBreakdown) {
      if (task.dependencies && task.dependencies.length > 0) {
        dependencies.push({
          taskId: task.id,
          dependsOn: task.dependencies,
          dependencyType: 'blocking',
          resolved: false
        });
      }
    }
    
    return dependencies;
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(dependencies: TaskDependency[]): Record<string, string[]> {
    const graph: Record<string, string[]> = {};
    
    for (const dep of dependencies) {
      graph[dep.taskId] = dep.dependsOn;
    }
    
    return graph;
  }

  /**
   * Check for cyclic dependencies using DFS
   */
  private hasCyclicDependencies(graph: Record<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (recursionStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      const dependencies = graph[node] || [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) return true;
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node in graph) {
      if (hasCycle(node)) return true;
    }

    return false;
  }

  /**
   * Resolve cyclic dependencies
   */
  private resolveCyclicDependencies(
    graph: Record<string, string[]>, 
    strategy: 'flexible' | 'adaptive'
  ): Record<string, string[]> {
    const resolvedGraph = { ...graph };
    
    if (strategy === 'flexible') {
      // Remove weakest dependencies to break cycles
      // This is a simplified approach - in practice, you'd use more sophisticated algorithms
      for (const node in resolvedGraph) {
        if (resolvedGraph[node].length > 2) {
          resolvedGraph[node] = resolvedGraph[node].slice(0, 2); // Keep only strongest dependencies
        }
      }
    } else if (strategy === 'adaptive') {
      // Use topological sorting to identify and resolve cycles
      const sortedNodes = this.topologicalSort(resolvedGraph);
      if (sortedNodes.length === 0) {
        // If topological sort fails, fall back to flexible strategy
        return this.resolveCyclicDependencies(graph, 'flexible');
      }
    }
    
    return resolvedGraph;
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(graph: Record<string, string[]>): string[] {
    const inDegree: Record<string, number> = {};
    const result: string[] = [];
    const queue: string[] = [];

    // Initialize in-degree count
    for (const node in graph) {
      inDegree[node] = 0;
    }

    // Calculate in-degrees
    for (const node in graph) {
      for (const dep of graph[node]) {
        inDegree[dep] = (inDegree[dep] || 0) + 1;
      }
    }

    // Find nodes with no incoming edges
    for (const node in inDegree) {
      if (inDegree[node] === 0) {
        queue.push(node);
      }
    }

    // Process nodes
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);

      for (const dep of graph[node] || []) {
        inDegree[dep]--;
        if (inDegree[dep] === 0) {
          queue.push(dep);
        }
      }
    }

    // If result doesn't contain all nodes, there's a cycle
    return result.length === Object.keys(graph).length ? result : [];
  }

  /**
   * Calculate critical path through dependency graph
   */
  private calculateCriticalPath(graph: Record<string, string[]>, tasks: any[]): string[] {
    const taskDurations: Record<string, number> = {};
    
    // Get task durations
    for (const task of tasks) {
      taskDurations[task.id] = task.estimatedEffort || 30;
    }

    // Calculate longest path (critical path)
    const longestPath: Record<string, number> = {};
    const path: Record<string, string[]> = {};

    const calculateLongestPath = (node: string): number => {
      if (longestPath[node] !== undefined) {
        return longestPath[node];
      }

      const dependencies = graph[node] || [];
      let maxPath = 0;
      let bestPredecessor = '';

      for (const dep of dependencies) {
        const pathLength = calculateLongestPath(dep);
        if (pathLength > maxPath) {
          maxPath = pathLength;
          bestPredecessor = dep;
        }
      }

      longestPath[node] = maxPath + (taskDurations[node] || 0);
      path[node] = bestPredecessor ? [...(path[bestPredecessor] || []), bestPredecessor] : [];

      return longestPath[node];
    };

    // Calculate for all nodes
    let criticalNode = '';
    let maxDuration = 0;

    for (const node in graph) {
      const duration = calculateLongestPath(node);
      if (duration > maxDuration) {
        maxDuration = duration;
        criticalNode = node;
      }
    }

    return criticalNode ? [...path[criticalNode], criticalNode] : [];
  }

  /**
   * Calculate parallel execution groups
   */
  private calculateParallelExecutionGroups(
    graph: Record<string, string[]>, 
    tasks: any[]
  ): ParallelExecutionGroup[] {
    const groups: ParallelExecutionGroup[] = [];
    const processed = new Set<string>();
    let groupId = 1;

    // Find tasks that can be executed in parallel
    const findParallelTasks = (startNodes: string[]): string[] => {
      const parallelTasks: string[] = [];
      
      for (const node of startNodes) {
        if (!processed.has(node)) {
          const dependencies = graph[node] || [];
          const canExecute = dependencies.every(dep => processed.has(dep));
          
          if (canExecute) {
            parallelTasks.push(node);
          }
        }
      }
      
      return parallelTasks;
    };

    // Get all task IDs
    const allTasks = tasks.map(t => t.id);
    
    while (processed.size < allTasks.length) {
      const parallelTasks = findParallelTasks(allTasks);
      
      if (parallelTasks.length === 0) {
        // No more tasks can be processed - might indicate an issue
        break;
      }

      if (parallelTasks.length > 1) {
        groups.push({
          groupId: `group-${groupId++}`,
          tasks: parallelTasks,
          maxConcurrency: Math.min(parallelTasks.length, 3), // Limit concurrency
          executionStrategy: 'all',
          timeout: 3600 // 1 hour timeout
        });
      }

      // Mark tasks as processed
      parallelTasks.forEach(task => processed.add(task));
    }

    return groups;
  }
}

/**
 * Conditional Workflow Path Manager
 */
export class ConditionalWorkflowManager {
  private config: FirstOfficerConfig;

  constructor(config: FirstOfficerConfig) {
    this.config = config;
  }

  /**
   * Determine workflow path based on analysis results
   */
  determineWorkflowPath(state: FirstOfficerState): {
    nextPhase: string;
    requiresApproval: boolean;
    executionStrategy: 'sequential' | 'parallel' | 'hybrid';
    specialInstructions?: string[];
  } {
    const analysis = state.objectiveAnalysis;
    
    if (!analysis) {
      return {
        nextPhase: 'handle_error',
        requiresApproval: false,
        executionStrategy: 'sequential'
      };
    }

    // Determine execution strategy based on complexity and approach
    let executionStrategy: 'sequential' | 'parallel' | 'hybrid' = 'sequential';
    
    if (analysis.approach === 'parallel' && this.config.enableParallelExecution) {
      executionStrategy = 'parallel';
    } else if (analysis.approach === 'hybrid') {
      executionStrategy = 'hybrid';
    }

    // Determine if user approval is required
    const requiresApproval = this.shouldRequireApproval(analysis, state);

    // Determine next phase
    let nextPhase = 'plan_tasks';
    if (requiresApproval) {
      nextPhase = 'user_approval';
    }

    // Generate special instructions based on analysis
    const specialInstructions = this.generateSpecialInstructions(analysis, state);

    return {
      nextPhase,
      requiresApproval,
      executionStrategy,
      specialInstructions
    };
  }

  /**
   * Check if user approval is required
   */
  private shouldRequireApproval(analysis: ObjectiveAnalysis, state: FirstOfficerState): boolean {
    // Always require approval if configured
    if (this.config.requireUserApproval) {
      return true;
    }

    // Require approval for expert complexity
    if (analysis.complexity === 'expert') {
      return true;
    }

    // Require approval for high-risk objectives
    if (analysis.riskFactors.length > 3) {
      return true;
    }

    // Require approval for long-duration tasks
    if (analysis.estimatedDuration > 240) { // 4 hours
      return true;
    }

    // Require approval for large task plans
    if (state.taskBreakdown.length > 10) {
      return true;
    }

    return false;
  }

  /**
   * Generate special instructions based on analysis
   */
  private generateSpecialInstructions(analysis: ObjectiveAnalysis, state: FirstOfficerState): string[] {
    const instructions: string[] = [];

    if (analysis.complexity === 'expert') {
      instructions.push('Use expert-level agents with specialized skills');
      instructions.push('Implement additional quality checks');
    }

    if (analysis.riskFactors.includes('time constraints')) {
      instructions.push('Prioritize critical path tasks');
      instructions.push('Enable parallel execution where possible');
    }

    if (analysis.riskFactors.includes('complexity')) {
      instructions.push('Break down complex tasks into smaller subtasks');
      instructions.push('Implement incremental validation');
    }

    if (analysis.approach === 'parallel') {
      instructions.push('Coordinate parallel task execution');
      instructions.push('Monitor resource conflicts');
    }

    return instructions;
  }
}

/**
 * User Approval Gate Manager
 */
export class UserApprovalManager {
  private chatCoordinator: ChatCoordinator;
  private config: FirstOfficerConfig;

  constructor(chatCoordinator: ChatCoordinator, config: FirstOfficerConfig) {
    this.chatCoordinator = chatCoordinator;
    this.config = config;
  }

  /**
   * Request user approval for critical decisions
   */
  async requestApproval(
    state: FirstOfficerState,
    approvalType: 'objective_analysis' | 'task_plan' | 'agent_selection' | 'quality_review' | 'final_results',
    context: any
  ): Promise<Partial<FirstOfficerState>> {
    console.log(`👤 [APPROVAL-MANAGER] Requesting user approval for: ${approvalType}`);

    try {
      const approvalMessage = this.generateApprovalMessage(approvalType, context, state);
      
      await this.chatCoordinator.sendCoordinationMessage(
        'user-question',
        state.currentPhase,
        approvalMessage
      );

      return {
        userApprovalRequired: true,
        currentPhase: 'waiting_for_approval',
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ [APPROVAL-MANAGER] Failed to request approval:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Approval request failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Process user approval response
   */
  async processApprovalResponse(
    state: FirstOfficerState,
    response: UserApprovalResponse
  ): Promise<Partial<FirstOfficerState>> {
    console.log(`✅ [APPROVAL-MANAGER] Processing approval response: ${response.action}`);

    try {
      const updatedState: Partial<FirstOfficerState> = {
        userApprovalResponse: response,
        userApprovalRequired: false,
        lastUpdated: new Date().toISOString()
      };

      switch (response.action) {
        case 'approve':
          updatedState.currentPhase = this.getNextPhaseAfterApproval(state);
          break;
          
        case 'modify':
          updatedState.currentPhase = response.targetPhase || 'plan_tasks';
          if (response.modifications) {
            // Apply modifications to state
            Object.assign(updatedState, response.modifications);
          }
          break;
          
        case 'reject':
          updatedState.currentPhase = 'failed';
          updatedState.errors = [...(state.errors || []), `User rejected the workflow: ${response.comments || 'No reason provided'}`];
          break;
          
        case 'resolve':
          updatedState.currentPhase = 'synthesizing';
          updatedState.escalationRequired = false;
          break;
      }

      // Send confirmation message
      await this.chatCoordinator.sendCoordinationMessage(
        'phase-update',
        updatedState.currentPhase!,
        `✅ **Approval Processed**\n\nAction: ${response.action}\nNext Phase: ${updatedState.currentPhase}\n\n${response.comments ? `Comments: ${response.comments}` : ''}`
      );

      return updatedState;

    } catch (error) {
      console.error('❌ [APPROVAL-MANAGER] Failed to process approval response:', error);
      return {
        currentPhase: 'failed',
        errors: [...(state.errors || []), `Approval processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        lastUpdated: new Date().toISOString()
      };
    }
  }

  /**
   * Generate approval message based on type and context
   */
  private generateApprovalMessage(
    approvalType: string,
    context: any,
    state: FirstOfficerState
  ): string {
    switch (approvalType) {
      case 'objective_analysis':
        return `🔍 **Objective Analysis Approval Required**\n\n` +
               `**Complexity:** ${context.complexity}\n` +
               `**Estimated Duration:** ${context.estimatedDuration} minutes\n` +
               `**Risk Factors:** ${context.riskFactors.join(', ')}\n` +
               `**Approach:** ${context.approach}\n\n` +
               `Do you approve this analysis and want to proceed with task planning?`;

      case 'task_plan':
        return `📋 **Task Plan Approval Required**\n\n` +
               `**Total Tasks:** ${context.tasks.length}\n` +
               `**Estimated Time:** ${context.estimatedTotalTime} minutes\n` +
               `**Execution Strategy:** ${context.parallelGroups.length > 1 ? 'Parallel' : 'Sequential'}\n\n` +
               `**Tasks:**\n${context.tasks.map((t: any) => `• ${t.description}`).join('\n')}\n\n` +
               `Do you approve this task plan?`;

      case 'agent_selection':
        return `👥 **Agent Selection Approval Required**\n\n` +
               `**Selected Agents:** ${context.length}\n\n` +
               `${context.map((a: any) => `• **${a.agentName}** (${Math.round(a.skillMatch * 100)}% match)\n  Tasks: ${a.assignedTasks.join(', ')}`).join('\n\n')}\n\n` +
               `Do you approve this agent selection?`;

      case 'quality_review':
        return `🔍 **Quality Review Approval Required**\n\n` +
               `Some tasks have failed quality checks and need your review.\n\n` +
               `**Failed Tasks:** ${context.failedTasks}\n` +
               `**Issues:** ${context.issues.join(', ')}\n\n` +
               `How would you like to proceed?`;

      case 'final_results':
        return `📊 **Final Results Approval Required**\n\n` +
               `The expedition has been completed. Please review the results:\n\n` +
               `${context.summary}\n\n` +
               `Do you approve these results?`;

      default:
        return `❓ **Approval Required**\n\nPlease review and approve the current workflow state.`;
    }
  }

  /**
   * Get next phase after approval
   */
  private getNextPhaseAfterApproval(state: FirstOfficerState): WorkflowPhase {
    switch (state.currentPhase) {
      case 'analyzing':
        return 'decomposing';
      case 'decomposing':
        return 'assigning';
      case 'assigning':
        return 'coordinating';
      case 'coordinating':
        return 'synthesizing';
      case 'synthesizing':
        return 'completed';
      default:
        return 'coordinating';
    }
  }
}

/**
 * Workflow State Persistence Manager
 */
export class WorkflowStatePersistence {
  private config: FirstOfficerConfig;

  constructor(config: FirstOfficerConfig) {
    this.config = config;
  }

  /**
   * Persist workflow state for recovery
   */
  async persistState(
    expeditionId: string,
    state: FirstOfficerState,
    checkpointType: 'phase_transition' | 'error_recovery' | 'user_interrupt' | 'scheduled' = 'phase_transition'
  ): Promise<WorkflowCheckpoint> {
    console.log(`💾 [STATE-PERSISTENCE] Persisting workflow state for expedition: ${expeditionId}`);

    try {
      const checkpoint: WorkflowCheckpoint = {
        checkpointId: `checkpoint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        expeditionId,
        state: { ...state },
        timestamp: new Date().toISOString(),
        phase: state.currentPhase,
        metadata: {
          checkpointType,
          version: '1.0',
          persistedBy: 'first-officer'
        }
      };

      // Persist to database
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      await expeditionRepo.updateWorkflowState(expeditionId, state);

      // Also store checkpoint for recovery
      // In a real implementation, you might store this in a separate checkpoints table
      console.log(`✅ [STATE-PERSISTENCE] Checkpoint created: ${checkpoint.checkpointId}`);
      
      return checkpoint;

    } catch (error) {
      console.error('❌ [STATE-PERSISTENCE] Failed to persist state:', error);
      throw error;
    }
  }

  /**
   * Recover workflow state from checkpoint
   */
  async recoverState(expeditionId: string): Promise<FirstOfficerState | null> {
    console.log(`📥 [STATE-PERSISTENCE] Recovering workflow state for expedition: ${expeditionId}`);

    try {
      const expeditionRepo = RepositoryFactory.getExpeditionRepository();
      const expedition = await expeditionRepo.findById(expeditionId);

      if (!expedition || !expedition.workflowState) {
        console.warn(`⚠️ [STATE-PERSISTENCE] No saved state found for expedition: ${expeditionId}`);
        return null;
      }

      const recoveredState = expedition.workflowState as FirstOfficerState;
      
      console.log(`✅ [STATE-PERSISTENCE] State recovered from phase: ${recoveredState.currentPhase}`);
      
      return recoveredState;

    } catch (error) {
      console.error('❌ [STATE-PERSISTENCE] Failed to recover state:', error);
      return null;
    }
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(expeditionId: string, keepLast: number = 5): Promise<void> {
    console.log(`🧹 [STATE-PERSISTENCE] Cleaning up old checkpoints for expedition: ${expeditionId}`);
    
    // In a real implementation, you would clean up old checkpoint records
    // This is a placeholder for the cleanup logic
  }
}