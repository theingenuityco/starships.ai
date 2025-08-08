/**
 * Expedition Workflow - LangGraph StateGraph Implementation
 * 
 * This module implements the core expedition workflow using LangGraph's StateGraph
 * for proper state machine management with type-safe transitions and error handling.
 */

import { StateGraph, END, START, Annotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { 
  FirstOfficerState,
  ObjectiveAnalysis,
  TaskPlan,
  AgentAssignment,
  CompletedTask,
  QualityCheck,
  TaskExecution
} from '../types';
import { WorkflowPhase, TaskBreakdown, WorkflowDSL, WorkflowRuntimeState } from '@starships/protocol';

/**
 * Define the state annotation for the workflow
 * This creates a type-safe state schema for LangGraph
 */
const ExpeditionStateAnnotation = Annotation.Root({
  // Core workflow identifiers
  expeditionId: Annotation<string>(),
  userId: Annotation<string>(),
  starshipId: Annotation<string>(),
  
  // Configuration
  requireUserApproval: Annotation<boolean>(),
  
  // Current workflow phase
  currentPhase: Annotation<WorkflowPhase>(),
  
  // Expedition requirements and analysis
  requirements: Annotation<string>(),
  objectiveAnalysis: Annotation<ObjectiveAnalysis | undefined>(),
  
  // Task planning and breakdown
  taskPlan: Annotation<TaskPlan | undefined>(),
  taskBreakdown: Annotation<TaskBreakdown[]>(),
  
  // Agent selection and assignment
  selectedAgents: Annotation<AgentAssignment[] | undefined>(),
  agentAssignments: Annotation<Record<string, string[]>>(),
  
  // Task execution tracking
  activeExecutions: Annotation<TaskExecution[] | undefined>(),
  completedTasks: Annotation<CompletedTask[] | undefined>(),
  agentResults: Annotation<Record<string, any>>(),
  
  // Quality control
  qualityChecks: Annotation<QualityCheck[] | undefined>(),
  
  // Error handling and retry logic - replace instead of accumulate
  errors: Annotation<string[]>({ 
    value: (current, update) => update || current || [],
    default: () => [] 
  }),
  retryCount: Annotation<number>(),
  retryAttempts: Annotation<Record<string, number> | undefined>(),
  
  // Final results
  finalResult: Annotation<string | undefined>(),
  
  // NEW: Workflow DSL fields (replacing old workflowState)
  workflowDSL: Annotation<WorkflowDSL | undefined>(),
  currentWorkflowNode: Annotation<string | undefined>(),
  workflowRuntimeState: Annotation<WorkflowRuntimeState | undefined>(),
  
  // Metadata
  lastUpdated: Annotation<string>(),
  
  // Messages for context (optional)
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: (current, update) => current.concat(update),
  }),
  
  // Chat-specific fields for Virtual First Officer integration
  userMessage: Annotation<string | undefined>(),
  context: Annotation<any>(),
  agentResponse: Annotation<string | undefined>(),
  semanticSearchResults: Annotation<any[] | undefined>(),
});

/**
 * Type alias for the annotated state
 */
export type ExpeditionState = typeof ExpeditionStateAnnotation.State;

/**
 * Workflow node functions - these will be injected from FirstOfficerAgent
 */
export interface WorkflowNodeHandlers {
  analyzeObjective: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  planTasks: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  selectAgents: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  assignTasks: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  createWorkflowDSL: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  executeTasks: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  monitorProgress: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  qualityCheck: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  synthesizeResults: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  userApproval: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  userApprovalWorkflow: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  handleError: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  retryTask: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  
  // Chat-oriented node handlers for Virtual First Officer integration
  refreshContext: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  semanticSearch: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  processMessage: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
}

/**
 * Configuration options for the expedition workflow
 */
export interface ExpeditionWorkflowConfig {
  usePersistentCheckpointer?: boolean;
  requireUserApproval?: boolean;
}

/**
 * Create the expedition workflow graph
 */
export function createExpeditionWorkflow(
  handlers: WorkflowNodeHandlers, 
  config: ExpeditionWorkflowConfig = {}
) {
  // Create the state graph with our annotation
  const workflow = new StateGraph(ExpeditionStateAnnotation)
    // Define all nodes
    .addNode('analyze_objective', handlers.analyzeObjective)
    .addNode('plan_tasks', handlers.planTasks)
    .addNode('select_agents', handlers.selectAgents)
    .addNode('assign_tasks', handlers.assignTasks)
    .addNode('create_workflow_dsl', handlers.createWorkflowDSL)
    .addNode('user_approval_workflow', handlers.userApprovalWorkflow)
    .addNode('execute_tasks', handlers.executeTasks)
    .addNode('monitor_progress', handlers.monitorProgress)
    .addNode('quality_check', handlers.qualityCheck)
    .addNode('synthesize_results', handlers.synthesizeResults)
    .addNode('user_approval', handlers.userApproval)
    .addNode('handle_error', handlers.handleError)
    .addNode('retry_task', handlers.retryTask)
    
    // Chat-oriented nodes for Virtual First Officer integration
    .addNode('refresh_context', handlers.refreshContext)
    .addNode('semantic_search', handlers.semanticSearch)
    .addNode('process_message', handlers.processMessage);

  // Define edges based on workflow logic
  workflow
    // Start -> Route based on workflow type (task execution vs chat)
    .addConditionalEdges(
      START,
      (state) => {
        // If userMessage exists, this is a chat interaction
        if (state.userMessage) return 'refresh_context';
        // Otherwise, it's task execution
        return 'analyze_objective';
      },
      {
        'refresh_context': 'refresh_context',
        'analyze_objective': 'analyze_objective'
      }
    )
    
    // Analyze -> Plan Tasks
    .addConditionalEdges(
      'analyze_objective',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'plan_tasks';
      },
      {
        'plan_tasks': 'plan_tasks',
        'handle_error': 'handle_error'
      }
    )
    
    // Plan Tasks -> Select/Assign
    .addConditionalEdges(
      'plan_tasks',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        // If we have pre-selected agents, skip selection
        if (state.selectedAgents && state.selectedAgents.length > 0) {
          return 'assign_tasks';
        }
        return 'select_agents';
      },
      {
        'select_agents': 'select_agents',
        'assign_tasks': 'assign_tasks',
        'handle_error': 'handle_error'
      }
    )
    
    // Select Agents -> Assign Tasks
    .addConditionalEdges(
      'select_agents',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'assign_tasks';
      },
      {
        'assign_tasks': 'assign_tasks',
        'handle_error': 'handle_error'
      }
    )
    
    // Assign Tasks -> Create Workflow DSL
    .addConditionalEdges(
      'assign_tasks',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'create_workflow_dsl';
      },
      {
        'create_workflow_dsl': 'create_workflow_dsl',
        'handle_error': 'handle_error'
      }
    )
    
    // Create Workflow DSL -> User Approval Workflow
    .addConditionalEdges(
      'create_workflow_dsl',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'user_approval_workflow';
      },
      {
        'user_approval_workflow': 'user_approval_workflow',
        'handle_error': 'handle_error'
      }
    )
    
    // User Approval Workflow -> Execute or Wait
    .addConditionalEdges(
      'user_approval_workflow',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        if (state.currentPhase === 'waiting_for_approval') {
          // Use LangGraph interrupt mechanism to pause execution
          return 'user_approval_workflow'; // Stay in the same node for retry
        }
        if (state.currentPhase === 'coordinating') {
          return 'execute_tasks';
        }
        return 'handle_error';
      },
      {
        'user_approval_workflow': 'user_approval_workflow',
        'execute_tasks': 'execute_tasks',
        'handle_error': 'handle_error'
      }
    )
    
    // Execute Tasks -> Monitor or Quality Check
    .addConditionalEdges(
      'execute_tasks',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        if (state.activeExecutions && state.activeExecutions.length > 0) {
          return 'monitor_progress';
        }
        if (state.completedTasks && state.completedTasks.length > 0) {
          return 'quality_check';
        }
        return 'handle_error';
      },
      {
        'monitor_progress': 'monitor_progress',
        'quality_check': 'quality_check',
        'handle_error': 'handle_error'
      }
    )
    
    // Monitor Progress -> Continue execution or quality check
    .addConditionalEdges(
      'monitor_progress',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        
        // Check if all tasks are completed
        const totalTasks = state.taskBreakdown.length;
        const completedCount = state.completedTasks?.length || 0;
        
        if (completedCount >= totalTasks) {
          return 'quality_check';
        }
        
        // Continue monitoring if tasks are still active
        if (state.activeExecutions && state.activeExecutions.length > 0) {
          return 'execute_tasks';
        }
        
        return 'quality_check';
      },
      {
        'execute_tasks': 'execute_tasks',
        'quality_check': 'quality_check',
        'handle_error': 'handle_error'
      }
    )
    
    // Quality Check -> Retry, Synthesize, or Error
    .addConditionalEdges(
      'quality_check',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        
        // Check if any tasks failed quality check
        const failedChecks = state.qualityChecks?.filter(qc => !qc.approved) || [];
        
        if (failedChecks.length > 0) {
          // Check if we should retry
          const canRetry = failedChecks.some(qc => {
            const retries = state.retryAttempts?.[qc.taskId] || 0;
            return retries < 3; // Max 3 retries
          });
          
          if (canRetry) {
            return 'retry_task';
          }
          return 'handle_error';
        }
        
        // All quality checks passed
        return 'synthesize_results';
      },
      {
        'retry_task': 'retry_task',
        'synthesize_results': 'synthesize_results',
        'handle_error': 'handle_error'
      }
    )
    
    // Retry Task -> Execute
    .addConditionalEdges(
      'retry_task',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'execute_tasks';
      },
      {
        'execute_tasks': 'execute_tasks',
        'handle_error': 'handle_error'
      }
    )
    
    // Synthesize Results -> User Approval or End
    .addConditionalEdges(
      'synthesize_results',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        if (!state.finalResult) return 'handle_error';
        
        // Check if user approval is required
        if (state.requireUserApproval) {
          return 'user_approval';
        }
        
        return END;
      },
      {
        'user_approval': 'user_approval',
        [END]: END,
        'handle_error': 'handle_error'
      }
    )
    
    // User Approval -> End or Error
    .addConditionalEdges(
      'user_approval',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return END;
      },
      {
        [END]: END,
        'handle_error': 'handle_error'
      }
    )
    
    // Chat workflow edges for Virtual First Officer integration
    // Refresh Context -> Semantic Search or Process Message
    .addConditionalEdges(
      'refresh_context',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        // Enable semantic search if available
        return 'semantic_search';
      },
      {
        'semantic_search': 'semantic_search',
        'handle_error': 'handle_error'
      }
    )
    
    // Semantic Search -> Process Message
    .addConditionalEdges(
      'semantic_search',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'process_message';
      },
      {
        'process_message': 'process_message',
        'handle_error': 'handle_error'
      }
    )
    
    // Process Message -> End
    .addConditionalEdges(
      'process_message',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return END;
      },
      {
        [END]: END,
        'handle_error': 'handle_error'
      }
    )
    
    // Error Handler -> End
    .addEdge('handle_error', END);

  // Choose checkpointer based on configuration
  // Note: Neo4jCheckpointer implementation pending BaseCheckpointSaver interface updates
  const checkpointer = config.usePersistentCheckpointer 
    ? new MemorySaver() // Fallback to MemorySaver for now
    : new MemorySaver();
  
  // Configure interrupts based on settings  
  const interruptBefore = config.requireUserApproval 
    ? ['user_approval' as const, 'user_approval_workflow' as const] 
    : ['user_approval_workflow' as const]; // Always interrupt for workflow approval

  return workflow.compile({
    checkpointer,
    interruptBefore
  });
}

/**
 * Helper function to convert between state formats
 */
export function convertToExpeditionState(state: FirstOfficerState, requireUserApproval: boolean = false): ExpeditionState {
  return {
    expeditionId: state.expeditionId,
    userId: state.userId,
    starshipId: state.starshipId,
    requireUserApproval,
    currentPhase: state.currentPhase,
    requirements: state.requirements,
    objectiveAnalysis: state.objectiveAnalysis,
    taskPlan: state.taskPlan,
    taskBreakdown: state.taskBreakdown,
    selectedAgents: state.selectedAgents,
    agentAssignments: state.agentAssignments,
    activeExecutions: state.activeExecutions,
    completedTasks: state.completedTasks,
    agentResults: state.agentResults,
    qualityChecks: state.qualityChecks,
    errors: state.errors || [],
    retryCount: state.retryCount,
    retryAttempts: state.retryAttempts,
    finalResult: state.finalResult,
    
    // NEW: Workflow DSL fields
    workflowDSL: state.workflowDSL,
    currentWorkflowNode: state.currentWorkflowNode,
    workflowRuntimeState: state.workflowRuntimeState,
    
    lastUpdated: state.lastUpdated,
    messages: [],
    
    // Chat-specific fields
    userMessage: undefined,
    context: undefined,
    agentResponse: undefined,
    semanticSearchResults: undefined
  };
}

/**
 * Helper function to convert back to FirstOfficerState
 */
export function convertFromExpeditionState(state: ExpeditionState): FirstOfficerState {
  return {
    expeditionId: state.expeditionId,
    userId: state.userId,
    starshipId: state.starshipId,
    currentPhase: state.currentPhase,
    requirements: state.requirements,
    requireUserApproval: state.requireUserApproval,
    objectiveAnalysis: state.objectiveAnalysis,
    taskPlan: state.taskPlan,
    taskBreakdown: state.taskBreakdown,
    selectedAgents: state.selectedAgents,
    agentAssignments: state.agentAssignments,
    activeExecutions: state.activeExecutions,
    completedTasks: state.completedTasks,
    agentResults: state.agentResults,
    qualityChecks: state.qualityChecks,
    errors: state.errors || [],
    retryCount: state.retryCount,
    retryAttempts: state.retryAttempts,
    finalResult: state.finalResult,
    
    // NEW: Workflow DSL fields
    workflowDSL: state.workflowDSL,
    currentWorkflowNode: state.currentWorkflowNode,
    workflowRuntimeState: state.workflowRuntimeState,
    
    lastUpdated: state.lastUpdated
  };
}

/**
 * Utility function to check if workflow is in terminal state
 */
export function isTerminalState(phase: WorkflowPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

/**
 * Utility function to get next valid phases from current phase
 */
export function getValidNextPhases(currentPhase: WorkflowPhase): WorkflowPhase[] {
  const transitions: Partial<Record<WorkflowPhase, WorkflowPhase[]>> = {
    'initializing': ['analyzing'],
    'analyzing': ['decomposing', 'failed'],
    'decomposing': ['assigning', 'failed'],
    'assigning': ['coordinating', 'failed'],
    'coordinating': ['synthesizing', 'failed'],
    'synthesizing': ['completed', 'failed'],
    'waiting_for_approval': ['analyzing', 'decomposing', 'assigning', 'coordinating', 'synthesizing', 'failed'],
    'completed': [],
    'failed': []
  };
  
  return transitions[currentPhase] || [];
}