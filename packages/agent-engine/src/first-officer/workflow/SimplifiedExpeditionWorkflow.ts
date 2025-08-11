/**
 * Simplified 4-Phase Expedition Workflow - LangGraph StateGraph Implementation
 * 
 * This module implements the simplified 4-phase expedition workflow using LangGraph's 
 * StateGraph for clean, linear progression through: refine → plan → execute → result
 * 
 * Replaces the complex 10+ node workflow with a user-controlled 4-phase system.
 */

import { StateGraph, END, START, Annotation, MemorySaver } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { 
  ExpeditionPhase, 
  ExpeditionStatus,
  phaseToStatus,
  TaskBreakdown
} from '@starships/protocol';
import { WorkflowDSL, WorkflowRuntimeState, WorkflowNodeResult } from '@starships/protocol';

// ============================================================================
// SIMPLIFIED 4-PHASE STATE ANNOTATION
// ============================================================================

/**
 * Simplified 4-Phase LangGraph State Annotation
 * Replaces the complex ExpeditionStateAnnotation with phase-focused design
 */
const Simplified4PhaseStateAnnotation = Annotation.Root({
  // ========================================
  // CORE IDENTIFIERS
  // ========================================
  expeditionId: Annotation<string>(),
  userId: Annotation<string>(),
  starshipId: Annotation<string>(),
  
  // ========================================
  // PHASE MANAGEMENT
  // ========================================
  currentPhase: Annotation<ExpeditionPhase>(),
  expeditionStatus: Annotation<ExpeditionStatus>(),
  phaseStartedAt: Annotation<string>(),
  phaseCompletedAt: Annotation<string | undefined>(),
  
  // ========================================
  // PHASE 1: REFINE DATA
  // ========================================
  // Input
  originalMission: Annotation<string>(),
  visionContext: Annotation<string | undefined>(),
  initialRequirements: Annotation<string[]>(),
  
  // Processing
  clarifyingQuestions: Annotation<string[]>(),
  userClarifications: Annotation<Array<{question: string; answer: string}>>(),
  
  // Output
  refinedMission: Annotation<string>(),
  refinedRequirements: Annotation<string[]>(),
  missionComplexity: Annotation<'simple' | 'moderate' | 'complex' | 'expert'>(),
  estimatedDuration: Annotation<number>(), // in minutes
  
  // ========================================
  // PHASE 2: PLAN DATA
  // ========================================
  // Input (from Phase 1)
  planningContext: Annotation<{
    refinedMission: string;
    requirements: string[];
    complexity: string;
    selectedAgents: string[];
  } | undefined>(),
  
  // Processing
  taskBreakdown: Annotation<TaskBreakdown[]>(),
  agentAssignments: Annotation<Record<string, string[]>>(), // agentId -> taskIds[]
  dependencyGraph: Annotation<Record<string, string[]>>(), // taskId -> dependsOn[]
  
  // Output
  workflowDSL: Annotation<WorkflowDSL | undefined>(),
  workflowVisualization: Annotation<string>(),
  planApprovalRequired: Annotation<boolean>(),
  userApprovedPlan: Annotation<boolean>(),
  planApprovedAt: Annotation<string | undefined>(),
  
  // ========================================
  // PHASE 3: EXECUTE DATA
  // ========================================
  // Input (from Phase 2)
  executionContext: Annotation<{
    approvedWorkflowDSL: WorkflowDSL;
    agentAssignments: Record<string, string[]>;
    taskBreakdown: TaskBreakdown[];
  } | undefined>(),
  
  // Processing
  workflowRuntimeState: Annotation<WorkflowRuntimeState | undefined>(),
  executionResults: Annotation<Map<string, WorkflowNodeResult> | undefined>(),
  currentWorkflowNode: Annotation<string | undefined>(),
  executionProgress: Annotation<number>(), // 0-100
  
  // Real-time execution data
  activeAgentTasks: Annotation<Record<string, any>>(), // agentId -> current task
  completedTasks: Annotation<Array<any>>(),
  failedTasks: Annotation<Array<{taskId: string; error: string; retryCount: number}>>(),
  
  // Output
  executionComplete: Annotation<boolean>(),
  executionSummary: Annotation<string>(),
  agentOutputs: Annotation<Record<string, any>>(), // agentId -> final output
  
  // ========================================
  // PHASE 4: RESULT DATA  
  // ========================================
  // Input (from Phase 3)
  resultContext: Annotation<{
    executionSummary: string;
    agentOutputs: Record<string, any>;
    completedTasks: any[];
    originalMission: string;
  } | undefined>(),
  
  // Processing
  resultSynthesis: Annotation<string>(),
  qualityScore: Annotation<number>(), // 0-100
  keyAchievements: Annotation<string[]>(),
  lessonsLearned: Annotation<string[]>(),
  
  // Output
  finalResult: Annotation<string>(),
  expeditionSummary: Annotation<string>(),
  deliverables: Annotation<Array<{name: string; content: string; type: string}>>(),
  
  // ========================================
  // CROSS-PHASE SYSTEM DATA
  // ========================================
  // Error handling
  errors: Annotation<Array<{
    phase: ExpeditionPhase;
    error: string;
    timestamp: string;
    recoverable: boolean;
  }>>({
    value: (current, update) => update || current || [],
    default: () => []
  }),
  
  // Retry management
  retryCount: Annotation<number>(),
  maxRetries: Annotation<number>(),
  
  // User interaction
  requiresUserInput: Annotation<boolean>(),
  userPrompt: Annotation<string | undefined>(),
  userResponse: Annotation<any>(),
  
  // Metadata
  createdAt: Annotation<string>(),
  lastUpdated: Annotation<string>(),
  totalDuration: Annotation<number>(), // Total expedition time in minutes
  
  // Memory and chat context
  conversationHistory: Annotation<Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    phase: ExpeditionPhase;
  }>>({
    default: () => [],
    reducer: (current, update) => current.concat(update || [])
  })
});

export type Simplified4PhaseState = typeof Simplified4PhaseStateAnnotation.State;

// ============================================================================
// 4-PHASE NODE HANDLER INTERFACES
// ============================================================================

/**
 * Simplified 4-Phase Node Handler Interface
 * Each phase handler receives state and returns partial state update
 */
export interface Simplified4PhaseHandlers {
  // ========================================
  // CORE PHASE HANDLERS
  // ========================================
  
  /**
   * PHASE 1: Refine Mission Handler
   * - Analyzes original mission with context
   * - Engages in interactive clarification with user
   * - Produces refined mission and requirements
   */
  refineMission: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * PHASE 2: Plan Workflow Handler  
   * - Creates task breakdown from refined mission
   * - Assigns tasks to selected agents
   * - Generates WorkflowDSL for execution
   */
  planWorkflow: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * PHASE 3: Execute Workflow Handler
   * - Executes approved WorkflowDSL using WorkflowExecutionService
   * - Provides real-time progress updates
   * - Handles pause/resume functionality
   */
  executeWorkflow: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * PHASE 4: Synthesize Result Handler
   * - Analyzes execution results and agent outputs
   * - Synthesizes final expedition deliverable
   * - Creates expedition summary and lessons learned
   */
  synthesizeResult: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  // ========================================
  // SUPPORTING HANDLERS
  // ========================================
  
  /**
   * User Approval Gate Handler
   * - Presents plan to user for approval
   * - Handles approval, rejection, or modification requests
   * - Manages approval timeout scenarios
   */
  handleUserApproval: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * Error Handler
   * - Manages error recovery across all phases
   * - Determines if errors are recoverable
   * - Updates expedition status to failed if needed
   */
  handleError: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * Pause Handler
   * - Handles expedition pause/resume logic
   * - Maintains execution context during pause
   * - Manages pause timeout scenarios
   */
  handlePause: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  // ========================================
  // CHAT SUPPORT HANDLERS (for refine phase)
  // ========================================
  
  /**
   * Refresh Context Handler
   * - Refreshes conversation context for chat interactions
   * - Loads relevant memory for current conversation
   */
  refreshContext: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
  
  /**
   * Process Message Handler  
   * - Processes user messages during refinement
   * - Updates conversation history
   * - Determines if refinement is complete
   */
  processMessage: (state: Simplified4PhaseState) => Promise<Partial<Simplified4PhaseState>>;
}

/**
 * Configuration for Simplified 4-Phase Workflow
 */
export interface Simplified4PhaseConfig {
  // Persistence configuration
  usePersistentCheckpointer?: boolean;
  checkpointRetentionDays?: number;
  
  // User interaction configuration
  requirePlanApproval?: boolean;
  planApprovalTimeoutMinutes?: number;
  
  // Chat configuration (refine phase)
  enableChatRefinement?: boolean;
  maxRefinementRounds?: number;
  
  // Execution configuration
  maxExecutionTimeMinutes?: number;
  enablePauseResume?: boolean;
  
  // Error handling
  maxRetries?: number;
  retryDelaySeconds?: number;
  
  // WebSocket integration
  enableRealTimeUpdates?: boolean;
  eventCallbackUrl?: string;
}

// Default configuration
export const DEFAULT_4PHASE_CONFIG: Simplified4PhaseConfig = {
  usePersistentCheckpointer: true,
  checkpointRetentionDays: 30,
  requirePlanApproval: true,
  planApprovalTimeoutMinutes: 60,
  enableChatRefinement: true,
  maxRefinementRounds: 10,
  maxExecutionTimeMinutes: 240,
  enablePauseResume: true,
  maxRetries: 3,
  retryDelaySeconds: 5,
  enableRealTimeUpdates: true
};

// ============================================================================
// SIMPLIFIED 4-PHASE WORKFLOW CREATION
// ============================================================================

/**
 * Create Simplified 4-Phase Expedition Workflow
 * Clean, maintainable LangGraph implementation
 */
export function createSimplified4PhaseWorkflow(
  handlers: Simplified4PhaseHandlers,
  config: Simplified4PhaseConfig = DEFAULT_4PHASE_CONFIG
) {
  
  const workflow = new StateGraph(Simplified4PhaseStateAnnotation)
    
    // ========================================
    // CORE 4-PHASE NODES
    // ========================================
    .addNode('refine_mission', handlers.refineMission)         // Phase 1: Mission refinement
    .addNode('plan_workflow', handlers.planWorkflow)           // Phase 2: Task & workflow planning  
    .addNode('execute_workflow', handlers.executeWorkflow)     // Phase 3: WorkflowDSL execution
    .addNode('synthesize_result', handlers.synthesizeResult)   // Phase 4: Result synthesis
    
    // ========================================
    // SUPPORTING NODES
    // ========================================
    .addNode('user_approval_gate', handlers.handleUserApproval) // User plan approval
    .addNode('handle_error', handlers.handleError)             // Error recovery
    .addNode('handle_pause', handlers.handlePause)             // Pause/resume support
    
    // ========================================
    // CHAT SUPPORT NODES (for refine phase)
    // ========================================
    .addNode('refresh_context', handlers.refreshContext)       // Chat context refresh
    .addNode('process_message', handlers.processMessage);      // Chat message processing

  // ========================================
  // WORKFLOW EDGES - LINEAR WITH CONTROL GATES
  // ========================================
  
  workflow
    // START -> Route based on workflow type
    .addConditionalEdges(
      START,
      (state) => {
        // If userMessage exists in conversation history, this is chat interaction during refine
        if (state.conversationHistory.length > 0 && state.currentPhase === 'refine') {
          return 'refresh_context';
        }
        // Normal expedition start
        return 'refine_mission';
      },
      {
        'refresh_context': 'refresh_context',
        'refine_mission': 'refine_mission'
      }
    )
    
    // Chat flow for refine phase
    .addEdge('refresh_context', 'process_message')
    .addConditionalEdges(
      'process_message',
      (state) => {
        // If refinement is complete, progress to planning
        if (state.refinedMission && state.refinedRequirements.length > 0) {
          return 'plan_workflow';
        }
        // Continue refining via chat
        return 'refine_mission';
      },
      {
        'refine_mission': 'refine_mission',
        'plan_workflow': 'plan_workflow'
      }
    )
    
    // PHASE 1: Refine Mission -> PHASE 2: Plan Workflow
    .addConditionalEdges(
      'refine_mission',
      (state) => {
        // Check for errors
        if (state.errors.length > 0) return 'handle_error';
        
        // Check if refinement is complete
        if (!state.refinedMission || state.refinedRequirements.length === 0) {
          // Stay in refine phase, potentially trigger user interaction
          return 'refine_mission';
        }
        
        // Progress to planning
        return 'plan_workflow';
      },
      {
        'plan_workflow': 'plan_workflow',
        'refine_mission': 'refine_mission',
        'handle_error': 'handle_error'
      }
    )
    
    // PHASE 2: Plan Workflow -> USER APPROVAL GATE -> PHASE 3: Execute
    .addConditionalEdges(
      'plan_workflow',
      (state) => {
        // Check for errors
        if (state.errors.length > 0) return 'handle_error';
        
        // Check if planning is complete
        if (!state.workflowDSL || state.taskBreakdown.length === 0) {
          return 'plan_workflow'; // Continue planning
        }
        
        // Require user approval before execution
        if (!state.userApprovedPlan) {
          return 'user_approval_gate';
        }
        
        // Ready to execute
        return 'execute_workflow';
      },
      {
        'user_approval_gate': 'user_approval_gate',
        'execute_workflow': 'execute_workflow',
        'plan_workflow': 'plan_workflow',
        'handle_error': 'handle_error'
      }
    )
    
    // User Approval Gate -> Execute or Back to Planning
    .addConditionalEdges(
      'user_approval_gate',
      (state) => {
        if (state.errors.length > 0) return 'handle_error';
        
        // User approved the plan
        if (state.userApprovedPlan) {
          return 'execute_workflow';
        }
        
        // User requested modifications
        if (state.userResponse === 'modify_plan') {
          return 'plan_workflow';
        }
        
        // User rejected - treat as cancellation
        return 'handle_error';
      },
      {
        'execute_workflow': 'execute_workflow',
        'plan_workflow': 'plan_workflow',
        'handle_error': 'handle_error'
      }
    )
    
    // PHASE 3: Execute Workflow -> PHASE 4: Synthesize Result
    .addConditionalEdges(
      'execute_workflow',
      (state) => {
        // Check for errors
        if (state.errors.length > 0) return 'handle_error';
        
        // Check if execution was paused
        if (state.expeditionStatus === 'paused') {
          return 'handle_pause';
        }
        
        // Check if execution is complete
        if (!state.executionComplete || !state.executionSummary) {
          return 'execute_workflow'; // Continue execution
        }
        
        // Ready for result synthesis
        return 'synthesize_result';
      },
      {
        'synthesize_result': 'synthesize_result',
        'execute_workflow': 'execute_workflow',
        'handle_pause': 'handle_pause',
        'handle_error': 'handle_error'
      }
    )
    
    // Handle pause -> Resume execution or error
    .addConditionalEdges(
      'handle_pause',
      (state) => {
        if (state.expeditionStatus === 'executing') {
          return 'execute_workflow'; // Resume
        }
        if (state.expeditionStatus === 'cancelled') {
          return 'handle_error'; // Cancelled during pause
        }
        return 'handle_pause'; // Stay paused
      },
      {
        'execute_workflow': 'execute_workflow',
        'handle_pause': 'handle_pause',
        'handle_error': 'handle_error'
      }
    )
    
    // PHASE 4: Synthesize Result -> END
    .addConditionalEdges(
      'synthesize_result',
      (state) => {
        if (state.errors.length > 0) return 'handle_error';
        if (!state.finalResult) return 'handle_error';
        return END;
      },
      {
        [END]: END,
        'handle_error': 'handle_error'
      }
    )
    
    // Error handling -> END (terminal)
    .addEdge('handle_error', END);

  // ========================================
  // WORKFLOW COMPILATION
  // ========================================
  
  // Configure checkpointer and interrupts
  const checkpointer = config.usePersistentCheckpointer 
    ? new MemorySaver() // Neo4j when available
    : new MemorySaver();
    
  const interruptBefore: ('user_approval_gate')[] = [
    'user_approval_gate' // Always interrupt for plan approval
  ];
  
  return workflow.compile({
    checkpointer,
    interruptBefore
  });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper function to initialize a new 4-phase expedition state
 */
export function createInitial4PhaseState(
  expeditionId: string,
  userId: string,
  starshipId: string,
  originalMission: string,
  selectedAgents: string[],
  visionContext?: string
): Partial<Simplified4PhaseState> {
  const now = new Date().toISOString();
  
  return {
    // Core identifiers
    expeditionId,
    userId,
    starshipId,
    
    // Phase tracking
    currentPhase: 'refine',
    expeditionStatus: 'refining',
    phaseStartedAt: now,
    
    // Phase 1 input data
    originalMission,
    visionContext,
    initialRequirements: [],
    
    // Initialize empty arrays and defaults
    clarifyingQuestions: [],
    userClarifications: [],
    refinedRequirements: [],
    taskBreakdown: [],
    agentAssignments: {},
    dependencyGraph: {},
    activeAgentTasks: {},
    completedTasks: [],
    failedTasks: [],
    agentOutputs: {},
    keyAchievements: [],
    lessonsLearned: [],
    deliverables: [],
    errors: [],
    conversationHistory: [],
    
    // Configuration defaults
    planApprovalRequired: true,
    userApprovedPlan: false,
    executionProgress: 0,
    executionComplete: false,
    retryCount: 0,
    maxRetries: 3,
    requiresUserInput: false,
    qualityScore: 0,
    
    // Metadata
    createdAt: now,
    lastUpdated: now,
    totalDuration: 0
  };
}

/**
 * Helper function to determine if an expedition is using 4-phase flow
 */
export function is4PhaseExpedition(state: any): state is Simplified4PhaseState {
  return state.currentPhase !== undefined && 
         ['refine', 'plan', 'execute', 'result'].includes(state.currentPhase);
}

/**
 * Helper function to get the next phase in the 4-phase flow
 */
export function getNextPhase(currentPhase: ExpeditionPhase): ExpeditionPhase | null {
  const phaseOrder: ExpeditionPhase[] = ['refine', 'plan', 'execute', 'result'];
  const currentIndex = phaseOrder.indexOf(currentPhase);
  return currentIndex < phaseOrder.length - 1 ? phaseOrder[currentIndex + 1] : null;
}