/**
 * Expedition Workflow - LangGraph StateGraph Implementation
 * 
 * This module implements the core expedition workflow using LangGraph's StateGraph
 * for proper state machine management with type-safe transitions and error handling.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
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
import { WorkflowPhase } from '@starships/protocol';

/**
 * Define the state annotation for the workflow
 * This creates a type-safe state schema for LangGraph
 */
const ExpeditionStateAnnotation = Annotation.Root({
  // Core workflow identifiers
  expeditionId: Annotation<string>(),
  userId: Annotation<string>(),
  starshipId: Annotation<string>(),
  
  // Current workflow phase
  currentPhase: Annotation<WorkflowPhase>(),
  
  // Expedition requirements and analysis
  requirements: Annotation<string>(),
  objectiveAnalysis: Annotation<ObjectiveAnalysis | undefined>(),
  
  // Task planning and breakdown
  taskPlan: Annotation<TaskPlan | undefined>(),
  taskBreakdown: Annotation<any[]>(),
  
  // Agent selection and assignment
  selectedAgents: Annotation<AgentAssignment[] | undefined>(),
  agentAssignments: Annotation<Record<string, string[]>>(),
  
  // Task execution tracking
  activeExecutions: Annotation<TaskExecution[] | undefined>(),
  completedTasks: Annotation<CompletedTask[] | undefined>(),
  agentResults: Annotation<Record<string, any>>(),
  
  // Quality control
  qualityChecks: Annotation<QualityCheck[] | undefined>(),
  
  // Error handling and retry logic
  errors: Annotation<string[]>({ value: (current, update) => update || current || [], default: () => [] }),
  retryCount: Annotation<number>(),
  retryAttempts: Annotation<Record<string, number> | undefined>(),
  
  // Final results
  finalResult: Annotation<string | undefined>(),
  
  // Metadata
  lastUpdated: Annotation<string>(),
  
  // Messages for context (optional)
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: (current, update) => current.concat(update),
  }),
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
  executeTasks: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  monitorProgress: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  qualityCheck: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  synthesizeResults: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  handleError: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
  retryTask: (state: ExpeditionState) => Promise<Partial<ExpeditionState>>;
}

/**
 * Create the expedition workflow graph
 */
export function createExpeditionWorkflow(handlers: WorkflowNodeHandlers) {
  // Create the state graph with our annotation
  const workflow = new StateGraph(ExpeditionStateAnnotation)
    // Define all nodes
    .addNode('analyze_objective', handlers.analyzeObjective)
    .addNode('plan_tasks', handlers.planTasks)
    .addNode('select_agents', handlers.selectAgents)
    .addNode('assign_tasks', handlers.assignTasks)
    .addNode('execute_tasks', handlers.executeTasks)
    .addNode('monitor_progress', handlers.monitorProgress)
    .addNode('quality_check', handlers.qualityCheck)
    .addNode('synthesize_results', handlers.synthesizeResults)
    .addNode('handle_error', handlers.handleError)
    .addNode('retry_task', handlers.retryTask);

  // Define edges based on workflow logic
  workflow
    // Start -> Analyze Objective
    .addEdge(START, 'analyze_objective')
    
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
    
    // Assign Tasks -> Execute
    .addConditionalEdges(
      'assign_tasks',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        return 'execute_tasks';
      },
      {
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
    
    // Synthesize Results -> End or Error
    .addConditionalEdges(
      'synthesize_results',
      (state) => {
        if (state.currentPhase === 'failed') return 'handle_error';
        if (state.finalResult) return END;
        return 'handle_error';
      },
      {
        [END]: END,
        'handle_error': 'handle_error'
      }
    )
    
    // Error Handler -> End
    .addEdge('handle_error', END);

  return workflow.compile();
}

/**
 * Helper function to convert between state formats
 */
export function convertToExpeditionState(state: FirstOfficerState): ExpeditionState {
  return {
    expeditionId: state.expeditionId,
    userId: state.userId,
    starshipId: state.starshipId,
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
    lastUpdated: state.lastUpdated,
    messages: []
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