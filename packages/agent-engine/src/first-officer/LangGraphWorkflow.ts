/**
 * LangGraph StateGraph Implementation for First Officer Agent
 * 
 * This file contains the proper LangGraph StateGraph implementation
 * with advanced workflow features including conditional branching,
 * parallel execution, state persistence, and error handling.
 */

import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { RunnableConfig } from '@langchain/core/runnables';
import { BaseCheckpointSaver } from '@langchain/langgraph';
import { FirstOfficerState, FirstOfficerConfig } from './types';

/**
 * LangGraph Workflow Builder for First Officer Agent
 */
export class LangGraphWorkflow {
  private config: FirstOfficerConfig;
  private nodeHandlers: Map<string, (state: FirstOfficerState, config?: RunnableConfig) => Promise<Partial<FirstOfficerState>>>;
  private routingHandlers: Map<string, (state: FirstOfficerState) => string>;

  constructor(
    config: FirstOfficerConfig,
    nodeHandlers: Map<string, (state: FirstOfficerState, config?: RunnableConfig) => Promise<Partial<FirstOfficerState>>>,
    routingHandlers: Map<string, (state: FirstOfficerState) => string>
  ) {
    this.config = config;
    this.nodeHandlers = nodeHandlers;
    this.routingHandlers = routingHandlers;
  }

  /**
   * Build the complete LangGraph StateGraph workflow
   */
  buildStateGraph(): any {
    const workflow = new StateGraph<FirstOfficerState>({
      channels: this.defineStateChannels()
    }) as any;

    // Add all workflow nodes
    this.addWorkflowNodes(workflow);
    
    // Define workflow edges and routing
    this.defineWorkflowEdges(workflow);
    
    return workflow.compile({
      checkpointer: new MemorySaver()
    });
  }

  /**
   * Define state channels for the StateGraph
   */
  private defineStateChannels() {
    return {
      // Core expedition data
      expeditionId: null,
      currentPhase: null,
      requirements: null,
      userId: null,
      starshipId: null,
      lastUpdated: null,
      
      // Analysis and planning
      objectiveAnalysis: null,
      taskPlan: null,
      taskBreakdown: null,
      
      // Agent management
      availableAgents: null,
      selectedAgents: null,
      agentAssignments: null,
      agentResults: null,
      
      // Task execution
      activeExecutions: null,
      completedTasks: null,
      
      // Quality control
      qualityChecks: null,
      
      // Error handling and retry
      errors: null,
      retryCount: null,
      retryAttempts: null,
      escalationRequired: null,
      
      // Final results
      finalResult: null,
      
      // Workflow control
      userApprovalRequired: null,
      userApprovalResponse: null,
      parallelExecutionEnabled: null,
      dependencyGraph: null,
      criticalPath: null
    };
  }

  /**
   * Add all workflow nodes to the StateGraph
   */
  private addWorkflowNodes(workflow: StateGraph<FirstOfficerState>) {
    // Core workflow nodes
    workflow.addNode("analyze_objective", this.nodeHandlers.get("analyze_objective")!);
    workflow.addNode("plan_tasks", this.nodeHandlers.get("plan_tasks")!);
    workflow.addNode("resolve_dependencies", this.nodeHandlers.get("resolve_dependencies")!);
    workflow.addNode("select_agents", this.nodeHandlers.get("select_agents")!);
    workflow.addNode("assign_tasks", this.nodeHandlers.get("assign_tasks")!);
    
    // Execution nodes
    workflow.addNode("execute_sequential", this.nodeHandlers.get("execute_sequential")!);
    workflow.addNode("execute_parallel", this.nodeHandlers.get("execute_parallel")!);
    workflow.addNode("monitor_progress", this.nodeHandlers.get("monitor_progress")!);
    
    // Quality and approval nodes
    workflow.addNode("quality_check", this.nodeHandlers.get("quality_check")!);
    workflow.addNode("user_approval", this.nodeHandlers.get("user_approval")!);
    workflow.addNode("wait_for_approval", this.nodeHandlers.get("wait_for_approval")!);
    
    // Result processing
    workflow.addNode("synthesize_results", this.nodeHandlers.get("synthesize_results")!);
    workflow.addNode("generate_report", this.nodeHandlers.get("generate_report")!);
    
    // Error handling and retry
    workflow.addNode("handle_error", this.nodeHandlers.get("handle_error")!);
    workflow.addNode("retry_task", this.nodeHandlers.get("retry_task")!);
    workflow.addNode("escalate_issue", this.nodeHandlers.get("escalate_issue")!);
    
    // State persistence
    workflow.addNode("persist_state", this.nodeHandlers.get("persist_state")!);
    workflow.addNode("recover_state", this.nodeHandlers.get("recover_state")!);
  }

  /**
   * Define workflow edges and conditional routing
   */
  private defineWorkflowEdges(workflow: any) {
    // Start with objective analysis
    workflow.addEdge(START, "analyze_objective");
    
    // Conditional routing after objective analysis
    workflow.addConditionalEdges(
      "analyze_objective",
      this.routingHandlers.get("routeAfterAnalysis")!,
      {
        "plan_tasks": "plan_tasks",
        "user_approval": "user_approval",
        "handle_error": "handle_error"
      }
    );

    // Task planning with dependency resolution
    workflow.addConditionalEdges(
      "plan_tasks",
      this.routingHandlers.get("routeAfterPlanning")!,
      {
        "resolve_dependencies": "resolve_dependencies",
        "select_agents": "select_agents",
        "user_approval": "user_approval",
        "handle_error": "handle_error"
      }
    );

    // Dependency resolution
    workflow.addConditionalEdges(
      "resolve_dependencies",
      this.routingHandlers.get("routeAfterDependencyResolution")!,
      {
        "select_agents": "select_agents",
        "plan_tasks": "plan_tasks", // Re-plan if dependencies change
        "handle_error": "handle_error"
      }
    );

    // Agent selection
    workflow.addConditionalEdges(
      "select_agents",
      this.routingHandlers.get("routeAfterAgentSelection")!,
      {
        "assign_tasks": "assign_tasks",
        "escalate_issue": "escalate_issue",
        "handle_error": "handle_error"
      }
    );

    // Task assignment
    workflow.addEdge("assign_tasks", "persist_state");
    
    // State persistence before execution
    workflow.addConditionalEdges(
      "persist_state",
      this.routingHandlers.get("routeAfterPersistence")!,
      {
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "handle_error": "handle_error"
      }
    );

    // Execution routing
    workflow.addConditionalEdges(
      "execute_sequential",
      this.routingHandlers.get("routeAfterExecution")!,
      {
        "monitor_progress": "monitor_progress",
        "quality_check": "quality_check",
        "handle_error": "handle_error"
      }
    );

    workflow.addConditionalEdges(
      "execute_parallel",
      this.routingHandlers.get("routeAfterExecution")!,
      {
        "monitor_progress": "monitor_progress",
        "quality_check": "quality_check",
        "handle_error": "handle_error"
      }
    );

    // Progress monitoring
    workflow.addConditionalEdges(
      "monitor_progress",
      this.routingHandlers.get("routeAfterMonitoring")!,
      {
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "quality_check": "quality_check",
        "synthesize_results": "synthesize_results",
        "handle_error": "handle_error"
      }
    );

    // Quality control
    workflow.addConditionalEdges(
      "quality_check",
      this.routingHandlers.get("routeAfterQualityCheck")!,
      {
        "synthesize_results": "synthesize_results",
        "retry_task": "retry_task",
        "user_approval": "user_approval",
        "escalate_issue": "escalate_issue",
        "handle_error": "handle_error"
      }
    );

    // User approval workflow
    workflow.addConditionalEdges(
      "user_approval",
      this.routingHandlers.get("routeAfterUserApproval")!,
      {
        "wait_for_approval": "wait_for_approval",
        "plan_tasks": "plan_tasks",
        "select_agents": "select_agents",
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "synthesize_results": "synthesize_results",
        "handle_error": "handle_error"
      }
    );

    // Wait for user approval (interrupt point)
    workflow.addConditionalEdges(
      "wait_for_approval",
      this.routingHandlers.get("routeAfterWaitingForApproval")!,
      {
        "plan_tasks": "plan_tasks",
        "select_agents": "select_agents",
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "synthesize_results": "synthesize_results",
        "handle_error": "handle_error"
      }
    );

    // Retry mechanism
    workflow.addConditionalEdges(
      "retry_task",
      this.routingHandlers.get("routeAfterRetry")!,
      {
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "escalate_issue": "escalate_issue",
        "user_approval": "user_approval",
        "handle_error": "handle_error"
      }
    );

    // Escalation
    workflow.addConditionalEdges(
      "escalate_issue",
      this.routingHandlers.get("routeAfterEscalation")!,
      {
        "user_approval": "user_approval",
        "handle_error": "handle_error",
        "synthesize_results": "synthesize_results" // Continue with partial results
      }
    );

    // Result synthesis
    workflow.addConditionalEdges(
      "synthesize_results",
      this.routingHandlers.get("routeAfterSynthesis")!,
      {
        "generate_report": "generate_report",
        "user_approval": "user_approval", // For final approval
        "handle_error": "handle_error"
      }
    );

    // Report generation
    workflow.addConditionalEdges(
      "generate_report",
      this.routingHandlers.get("routeAfterReportGeneration")!,
      {
        "end": END,
        "user_approval": "user_approval",
        "handle_error": "handle_error"
      }
    );

    // State recovery (for resuming interrupted workflows)
    workflow.addConditionalEdges(
      "recover_state",
      this.routingHandlers.get("routeAfterStateRecovery")!,
      {
        "analyze_objective": "analyze_objective",
        "plan_tasks": "plan_tasks",
        "select_agents": "select_agents",
        "execute_sequential": "execute_sequential",
        "execute_parallel": "execute_parallel",
        "monitor_progress": "monitor_progress",
        "quality_check": "quality_check",
        "synthesize_results": "synthesize_results",
        "handle_error": "handle_error"
      }
    );

    // Error handling (terminal)
    workflow.addEdge("handle_error", END);
  }


  /**
   * Create a workflow instance with enhanced features
   */
  static createEnhancedWorkflow(
    config: FirstOfficerConfig,
    nodeHandlers: Map<string, (state: FirstOfficerState, config?: RunnableConfig) => Promise<Partial<FirstOfficerState>>>,
    routingHandlers: Map<string, (state: FirstOfficerState) => string>
  ) {
    const workflowBuilder = new LangGraphWorkflow(config, nodeHandlers, routingHandlers);
    return workflowBuilder.buildStateGraph();
  }
}

/**
 * Enhanced routing functions for complex workflow logic
 */
export class EnhancedWorkflowRouting {
  private config: FirstOfficerConfig;

  constructor(config: FirstOfficerConfig) {
    this.config = config;
  }

  /**
   * Route after dependency resolution with parallel execution support
   */
  routeAfterDependencyResolution(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }

    // Check if dependencies are resolved
    if (state.dependencyGraph && this.hasCyclicDependencies(state.dependencyGraph)) {
      return 'handle_error';
    }

    // Check if we can proceed with parallel execution
    if (state.taskPlan?.parallelGroups && state.taskPlan.parallelGroups.length > 1) {
      return 'select_agents';
    }

    return 'select_agents';
  }

  /**
   * Route after persistence with execution strategy selection
   */
  routeAfterPersistence(state: FirstOfficerState): string {
    if (state.currentPhase === 'failed') {
      return 'handle_error';
    }

    // Determine execution strategy based on task plan
    if (this.config.enableParallelExecution && 
        state.taskPlan?.parallelGroups && 
        state.taskPlan.parallelGroups.length > 1) {
      return 'execute_parallel';
    }

    return 'execute_sequential';
  }

  /**
   * Route after waiting for approval with context awareness
   */
  routeAfterWaitingForApproval(state: FirstOfficerState): string {
    if (!state.userApprovalResponse) {
      return 'handle_error'; // No response received
    }

    const response = state.userApprovalResponse;
    
    switch (response.action) {
      case 'approve':
        return this.getNextPhaseAfterApproval(state);
      case 'modify':
        return response.targetPhase || 'plan_tasks';
      case 'reject':
        return 'handle_error';
      default:
        return 'handle_error';
    }
  }

  /**
   * Route after escalation with multiple resolution paths
   */
  routeAfterEscalation(state: FirstOfficerState): string {
    if (state.escalationRequired) {
      // Check if escalation was resolved
      if (state.userApprovalResponse?.action === 'resolve') {
        return 'synthesize_results'; // Continue with available results
      }
      
      // Wait for user intervention
      return 'user_approval';
    }

    return 'handle_error';
  }

  /**
   * Route after state recovery for resuming workflows
   */
  routeAfterStateRecovery(state: FirstOfficerState): string {
    // Resume from the last known phase
    switch (state.currentPhase) {
      case 'initializing':
      case 'analyzing':
        return 'analyze_objective';
      case 'decomposing':
        return 'plan_tasks';
      case 'assigning':
        return state.selectedAgents ? 'execute_sequential' : 'select_agents';
      case 'coordinating':
        if (state.activeExecutions?.length) {
          return 'monitor_progress';
        } else if (state.completedTasks?.length) {
          return 'quality_check';
        } else {
          return this.config.enableParallelExecution ? 'execute_parallel' : 'execute_sequential';
        }
      case 'synthesizing':
        return 'synthesize_results';
      default:
        return 'handle_error';
    }
  }

  /**
   * Helper: Check for cyclic dependencies
   */
  private hasCyclicDependencies(dependencyGraph: Record<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (node: string): boolean => {
      if (recursionStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      const dependencies = dependencyGraph[node] || [];
      for (const dep of dependencies) {
        if (hasCycle(dep)) return true;
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node in dependencyGraph) {
      if (hasCycle(node)) return true;
    }

    return false;
  }

  /**
   * Helper: Get next phase after approval
   */
  private getNextPhaseAfterApproval(state: FirstOfficerState): string {
    switch (state.currentPhase) {
      case 'analyzing':
        return 'plan_tasks';
      case 'decomposing':
        return 'select_agents';
      case 'assigning':
        return this.config.enableParallelExecution ? 'execute_parallel' : 'execute_sequential';
      case 'coordinating':
        return 'synthesize_results';
      case 'synthesizing':
        return 'generate_report';
      default:
        return 'handle_error';
    }
  }
}