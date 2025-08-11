# B1: State Management Design

**Design Phase**: B1 - State Management Design  
**Created**: 2025-01-08  
**Dependencies**: A1, A2, A3 research findings

## Overview

This document defines the comprehensive state management system for the 4-phase expedition flow, leveraging LangGraph StateGraph patterns with enhanced cross-phase context management.

## 1. Core State Schema Design

### 1.1 Simplified Expedition Status Enum

```typescript
// Enhanced ExpeditionStatus for 4-phase flow
export type ExpeditionStatus = 
  | 'draft'        // Created but not started
  | 'refining'     // Phase 1: Mission clarification and refinement
  | 'planning'     // Phase 2: Task breakdown and workflow generation  
  | 'executing'    // Phase 3: WorkflowDSL execution
  | 'completed'    // Phase 4: Results synthesis complete
  | 'failed'       // Failed at any phase
  | 'cancelled'    // Cancelled by user
  | 'paused';      // Temporarily paused (execute phase only)

// Phase tracking for UI and logic
export type ExpeditionPhase = 
  | 'refine'       // Phase 1
  | 'plan'         // Phase 2  
  | 'execute'      // Phase 3
  | 'result';      // Phase 4

// Phase to status mapping
export const phaseToStatus: Record<ExpeditionPhase, ExpeditionStatus> = {
  'refine': 'refining',
  'plan': 'planning', 
  'execute': 'executing',
  'result': 'completed'
};
```

### 1.2 LangGraph State Annotation

```typescript
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
  activeAgentTasks: Annotation<Record<string, TaskExecution>>(), // agentId -> current task
  completedTasks: Annotation<CompletedTask[]>(),
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
    completedTasks: CompletedTask[];
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
```

### 1.3 Phase-Specific Data Interfaces

```typescript
/**
 * Phase-specific data structures for type safety and validation
 */

// REFINE Phase Interfaces
export interface RefinePhaseInput {
  originalMission: string;
  visionContext?: string;
  initialRequirements: string[];
  selectedAgents: string[];
}

export interface RefinePhaseOutput {
  refinedMission: string;
  refinedRequirements: string[];
  missionComplexity: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration: number;
  userClarifications: Array<{question: string; answer: string}>;
}

// PLAN Phase Interfaces  
export interface PlanPhaseInput extends RefinePhaseOutput {
  selectedAgents: string[];
}

export interface PlanPhaseOutput {
  taskBreakdown: TaskBreakdown[];
  agentAssignments: Record<string, string[]>;
  workflowDSL: WorkflowDSL;
  workflowVisualization: string;
  dependencyGraph: Record<string, string[]>;
  userApprovedPlan: boolean;
  planApprovedAt?: string;
}

// EXECUTE Phase Interfaces
export interface ExecutePhaseInput extends PlanPhaseOutput {
  approvedWorkflowDSL: WorkflowDSL;
}

export interface ExecutePhaseOutput {
  workflowRuntimeState: WorkflowRuntimeState;
  executionResults: Map<string, WorkflowNodeResult>;
  completedTasks: CompletedTask[];
  executionSummary: string;
  agentOutputs: Record<string, any>;
  executionComplete: boolean;
}

// RESULT Phase Interfaces
export interface ResultPhaseInput extends ExecutePhaseOutput {
  originalMission: string;
  refinedMission: string;
}

export interface ResultPhaseOutput {
  finalResult: string;
  expeditionSummary: string;
  qualityScore: number;
  keyAchievements: string[];
  lessonsLearned: string[];
  deliverables: Array<{name: string; content: string; type: string}>;
}
```

## 2. Cross-Phase Memory Management

### 2.1 LangGraph Memory Structure

```typescript
/**
 * Enhanced Memory Manager for 4-Phase Context Flow
 * Integrates with LangGraph MemorySaver and LangChain memory systems
 */
export interface CrossPhaseMemoryContext {
  // Memory key for LangGraph checkpointer
  threadId: string; // expedition-{expeditionId}
  
  // Phase progression tracking
  phaseHistory: Array<{
    phase: ExpeditionPhase;
    startedAt: string;
    completedAt?: string;
    duration?: number;
    success: boolean;
    data: any;
  }>;
  
  // Cross-phase data flow
  contextFlow: {
    refine_to_plan: RefinePhaseOutput;
    plan_to_execute: PlanPhaseOutput;
    execute_to_result: ExecutePhaseOutput;
  };
  
  // User interaction context
  conversationContext: {
    sessionKey: string; // first-officer-{userId}-{expeditionId}
    messageCount: number;
    lastInteraction: string;
    activeParticipant: string; // current agent user is chatting with
  };
  
  // System context
  systemContext: {
    starshipId: string;
    userId: string;
    selectedAgents: string[];
    workflowConfig: {
      requireUserApproval: boolean;
      maxRetries: number;
      timeoutMinutes: number;
    };
  };
}

/**
 * Memory Key Generation Strategy
 */
export class ExpeditionMemoryManager {
  // LangGraph thread ID for state persistence
  static getThreadId(expeditionId: string): string {
    return `expedition-${expeditionId}`;
  }
  
  // LangChain session key for conversation memory
  static getSessionKey(userId: string, expeditionId: string): string {
    return `first-officer-${userId}-${expeditionId}`;
  }
  
  // Phase-specific memory key for context storage
  static getPhaseContextKey(expeditionId: string, phase: ExpeditionPhase): string {
    return `expedition-${expeditionId}-phase-${phase}`;
  }
}
```

### 2.2 State Persistence Strategy

```typescript
/**
 * Triple-Layer State Persistence
 * 1. LangGraph Checkpointer - Workflow state snapshots
 * 2. LangChain Memory - Conversation and context
 * 3. Database Persistence - Backup and recovery
 */
export interface StatePersistenceStrategy {
  // Layer 1: LangGraph Checkpointer (Primary)
  langgraph: {
    checkpointer: 'MemorySaver'; // Neo4j when available
    threadId: string;
    checkpointFrequency: 'per_node'; // Save after each workflow node
    retentionPolicy: '30_days';
  };
  
  // Layer 2: LangChain Memory (Context)  
  langchain: {
    memoryStore: 'LangChainMemoryStore';
    sessionKey: string;
    vectorStore: 'FAISS'; // For semantic search
    retentionPolicy: 'indefinite';
  };
  
  // Layer 3: Database Persistence (Backup)
  database: {
    table: 'expeditions.workflow_state';
    expeditionId: string;
    updateFrequency: 'phase_completion';
    backupStrategy: 'full_state_snapshot';
  };
}

/**
 * State Recovery Strategy
 * Priority order for state recovery in case of failures
 */
export enum StateRecoverySource {
  LANGGRAPH_CHECKPOINT = 1,    // Most recent and reliable
  LANGCHAIN_MEMORY = 2,        // Conversation context available
  DATABASE_BACKUP = 3,         // Fallback option
  FRESH_START = 4              // Complete restart if no state found
}
```

## 3. Phase Transition Management

### 3.1 Phase Transition Rules

```typescript
/**
 * State Transition Validation Rules
 * Defines valid transitions and required conditions
 */
export interface PhaseTransitionRules {
  // Valid transitions map
  validTransitions: Record<ExpeditionPhase, ExpeditionPhase[]>;
  
  // Transition requirements
  transitionRequirements: Record<string, TransitionRequirement>;
}

export interface TransitionRequirement {
  fromPhase: ExpeditionPhase;
  toPhase: ExpeditionPhase;
  requiredData: string[]; // Required fields in state
  validationRules: ValidationRule[];
  userApprovalRequired: boolean;
  preTransitionChecks: string[]; // Method names to run before transition
  postTransitionActions: string[]; // Method names to run after transition
}

// Concrete implementation
export const PHASE_TRANSITION_RULES: PhaseTransitionRules = {
  validTransitions: {
    'refine': ['plan', 'cancelled', 'failed'],
    'plan': ['execute', 'refine', 'cancelled', 'failed'], // Can go back to refine
    'execute': ['result', 'paused', 'cancelled', 'failed'],
    'result': [] // Terminal state
  },
  
  transitionRequirements: {
    'refine_to_plan': {
      fromPhase: 'refine',
      toPhase: 'plan',
      requiredData: [
        'refinedMission',
        'refinedRequirements', 
        'missionComplexity',
        'estimatedDuration'
      ],
      validationRules: [
        { field: 'refinedMission', rule: 'min_length', value: 10 },
        { field: 'refinedRequirements', rule: 'min_items', value: 1 },
        { field: 'estimatedDuration', rule: 'positive_number' }
      ],
      userApprovalRequired: false,
      preTransitionChecks: ['validateRefinementComplete'],
      postTransitionActions: ['initializePlanningPhase', 'notifyPhaseChange']
    },
    
    'plan_to_execute': {
      fromPhase: 'plan',
      toPhase: 'execute',
      requiredData: [
        'workflowDSL',
        'taskBreakdown',
        'agentAssignments',
        'userApprovedPlan'
      ],
      validationRules: [
        { field: 'workflowDSL', rule: 'valid_workflow' },
        { field: 'taskBreakdown', rule: 'min_items', value: 1 },
        { field: 'userApprovedPlan', rule: 'equals', value: true }
      ],
      userApprovalRequired: true, // USER MUST APPROVE PLAN
      preTransitionChecks: ['validateWorkflowDSL', 'validateAgentAvailability'],
      postTransitionActions: ['initializeWorkflowExecution', 'notifyExecutionStart']
    },
    
    'execute_to_result': {
      fromPhase: 'execute', 
      toPhase: 'result',
      requiredData: [
        'executionComplete',
        'executionSummary',
        'agentOutputs'
      ],
      validationRules: [
        { field: 'executionComplete', rule: 'equals', value: true },
        { field: 'executionSummary', rule: 'min_length', value: 50 }
      ],
      userApprovalRequired: false,
      preTransitionChecks: ['validateExecutionComplete'],
      postTransitionActions: ['initializeResultSynthesis', 'notifyCompletion']
    }
  }
};

export interface ValidationRule {
  field: string;
  rule: 'min_length' | 'min_items' | 'positive_number' | 'equals' | 'valid_workflow';
  value?: any;
}
```

### 3.2 Phase Transition Controller

```typescript
/**
 * Phase Transition Controller
 * Manages state transitions with validation and error handling
 */
export class PhaseTransitionController {
  constructor(
    private state: Simplified4PhaseState,
    private memoryManager: ExpeditionMemoryManager,
    private eventEmitter: EventEmitter
  ) {}
  
  /**
   * Attempt to transition to next phase with full validation
   */
  async transitionToPhase(
    targetPhase: ExpeditionPhase,
    transitionData?: any
  ): Promise<PhaseTransitionResult> {
    const currentPhase = this.state.currentPhase;
    const transitionKey = `${currentPhase}_to_${targetPhase}`;
    
    // 1. Validate transition is allowed
    const isValidTransition = this.validateTransition(currentPhase, targetPhase);
    if (!isValidTransition) {
      return {
        success: false,
        error: `Invalid transition from ${currentPhase} to ${targetPhase}`,
        currentPhase
      };
    }
    
    // 2. Get transition requirements
    const requirements = PHASE_TRANSITION_RULES.transitionRequirements[transitionKey];
    if (!requirements) {
      return {
        success: false,
        error: `No transition rules defined for ${transitionKey}`,
        currentPhase
      };
    }
    
    // 3. Run pre-transition checks
    for (const checkMethod of requirements.preTransitionChecks) {
      const checkResult = await this.runTransitionCheck(checkMethod);
      if (!checkResult.success) {
        return {
          success: false,
          error: `Pre-transition check failed: ${checkResult.error}`,
          currentPhase
        };
      }
    }
    
    // 4. Validate required data exists
    const dataValidation = this.validateRequiredData(requirements.requiredData);
    if (!dataValidation.success) {
      return {
        success: false,
        error: `Required data validation failed: ${dataValidation.error}`,
        currentPhase
      };
    }
    
    // 5. Run validation rules
    const rulesValidation = this.validateTransitionRules(requirements.validationRules);
    if (!rulesValidation.success) {
      return {
        success: false,
        error: `Validation rules failed: ${rulesValidation.error}`,
        currentPhase
      };
    }
    
    // 6. Check user approval if required
    if (requirements.userApprovalRequired && !this.state.userApprovedPlan) {
      return {
        success: false,
        error: 'User approval required but not granted',
        currentPhase,
        requiresUserApproval: true
      };
    }
    
    // 7. Execute the transition
    const transitionResult = await this.executeTransition(
      currentPhase, 
      targetPhase,
      transitionData
    );
    
    if (!transitionResult.success) {
      return transitionResult;
    }
    
    // 8. Run post-transition actions
    for (const actionMethod of requirements.postTransitionActions) {
      await this.runPostTransitionAction(actionMethod, targetPhase);
    }
    
    // 9. Update state and persist
    await this.finalizeTransition(currentPhase, targetPhase, transitionData);
    
    return {
      success: true,
      previousPhase: currentPhase,
      currentPhase: targetPhase,
      transitionData
    };
  }
  
  /**
   * Execute the actual state transition
   */
  private async executeTransition(
    fromPhase: ExpeditionPhase,
    toPhase: ExpeditionPhase, 
    data?: any
  ): Promise<PhaseTransitionResult> {
    try {
      // Update core phase tracking
      const now = new Date().toISOString();
      
      // Mark previous phase as complete
      this.state.phaseCompletedAt = now;
      
      // Start new phase
      this.state.currentPhase = toPhase;
      this.state.expeditionStatus = phaseToStatus[toPhase];
      this.state.phaseStartedAt = now;
      this.state.phaseCompletedAt = undefined;
      this.state.lastUpdated = now;
      
      // Phase-specific initialization
      switch (toPhase) {
        case 'plan':
          this.initializePlanPhase();
          break;
        case 'execute':
          this.initializeExecutePhase();
          break; 
        case 'result':
          this.initializeResultPhase();
          break;
      }
      
      return { success: true, currentPhase: toPhase };
      
    } catch (error) {
      return {
        success: false,
        error: `Transition execution failed: ${error.message}`,
        currentPhase: fromPhase
      };
    }
  }
}

export interface PhaseTransitionResult {
  success: boolean;
  currentPhase: ExpeditionPhase;
  previousPhase?: ExpeditionPhase;
  error?: string;
  requiresUserApproval?: boolean;
  transitionData?: any;
}
```

## 4. Integration with Existing Systems

### 4.1 LangGraph Integration

```typescript
/**
 * 4-Phase LangGraph Workflow Integration
 * Simplified workflow that leverages existing infrastructure
 */
export function create4PhaseExpeditionWorkflow(
  handlers: Simplified4PhaseHandlers
): CompiledStateGraph<Simplified4PhaseState> {
  
  const workflow = new StateGraph(Simplified4PhaseStateAnnotation)
    // 4 core phase nodes
    .addNode('refine_mission', handlers.refineMission)
    .addNode('plan_workflow', handlers.planWorkflow)
    .addNode('execute_workflow', handlers.executeWorkflow)  
    .addNode('synthesize_result', handlers.synthesizeResult)
    
    // Supporting nodes
    .addNode('handle_error', handlers.handleError)
    .addNode('user_approval_gate', handlers.handleUserApproval);
  
  // Linear flow with conditional branching
  workflow
    .addEdge(START, 'refine_mission')
    
    .addConditionalEdges(
      'refine_mission',
      (state) => {
        if (state.errors.length > 0) return 'handle_error';
        return 'plan_workflow';
      },
      {
        'plan_workflow': 'plan_workflow',
        'handle_error': 'handle_error'
      }
    )
    
    .addConditionalEdges(
      'plan_workflow', 
      (state) => {
        if (state.errors.length > 0) return 'handle_error';
        if (state.planApprovalRequired && !state.userApprovedPlan) {
          return 'user_approval_gate';
        }
        return 'execute_workflow';
      },
      {
        'user_approval_gate': 'user_approval_gate',
        'execute_workflow': 'execute_workflow',
        'handle_error': 'handle_error'
      }
    )
    
    .addConditionalEdges(
      'user_approval_gate',
      (state) => {
        if (state.userApprovedPlan) return 'execute_workflow';
        if (state.userResponse === 'modify') return 'plan_workflow';
        return 'handle_error'; // Rejected
      },
      {
        'execute_workflow': 'execute_workflow',
        'plan_workflow': 'plan_workflow', // Allow plan modification
        'handle_error': 'handle_error'
      }
    )
    
    .addConditionalEdges(
      'execute_workflow',
      (state) => {
        if (state.errors.length > 0) return 'handle_error';
        return 'synthesize_result';
      },
      {
        'synthesize_result': 'synthesize_result',
        'handle_error': 'handle_error'
      }
    )
    
    .addEdge('synthesize_result', END)
    .addEdge('handle_error', END);
  
  // Compile with persistent checkpointing
  return workflow.compile({
    checkpointer: new MemorySaver(),
    interruptBefore: ['user_approval_gate'] // Pause for user approval
  });
}
```

### 4.2 Database Schema Updates

```sql
-- Enhanced expedition table to support 4-phase flow
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS current_phase VARCHAR(20);
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS phase_started_at TIMESTAMP;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS phase_completed_at TIMESTAMP;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS refined_mission TEXT;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS mission_complexity VARCHAR(20);
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS user_approved_plan BOOLEAN DEFAULT FALSE;
ALTER TABLE expeditions ADD COLUMN IF NOT EXISTS plan_approved_at TIMESTAMP;

-- Create phase transition history table
CREATE TABLE IF NOT EXISTS expedition_phase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  from_phase VARCHAR(20),
  to_phase VARCHAR(20) NOT NULL,
  transition_data JSONB,
  transitioned_at TIMESTAMP DEFAULT NOW(),
  duration_minutes INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create workflow state backup table  
CREATE TABLE IF NOT EXISTS expedition_workflow_state_backup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expedition_id UUID NOT NULL REFERENCES expeditions(id) ON DELETE CASCADE,
  phase VARCHAR(20) NOT NULL,
  state_data JSONB NOT NULL,
  checkpoint_at TIMESTAMP DEFAULT NOW(),
  state_version INTEGER DEFAULT 1
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expeditions_current_phase ON expeditions(current_phase);
CREATE INDEX IF NOT EXISTS idx_expedition_phase_history_expedition_id ON expedition_phase_history(expedition_id);
CREATE INDEX IF NOT EXISTS idx_expedition_workflow_state_backup_expedition_id ON expedition_workflow_state_backup(expedition_id);
```

## 5. State Management Configuration

```typescript
/**
 * Complete State Management Configuration
 */
export const STATE_MANAGEMENT_CONFIG = {
  // LangGraph Configuration
  langgraph: {
    checkpointFrequency: 'per_node',
    interruptBefore: ['user_approval_gate'],
    recursionLimit: 50,
    timeoutMinutes: 120
  },
  
  // Memory Configuration
  memory: {
    sessionKeyPrefix: 'first-officer',
    retentionDays: 30,
    vectorStoreEnabled: true,
    semanticSearchThreshold: 0.7
  },
  
  // Phase Transition Configuration  
  transitions: {
    maxRetries: 3,
    retryDelayMs: 5000,
    userApprovalTimeoutMinutes: 60,
    autoProgressEnabled: false // Require explicit user action
  },
  
  // Persistence Configuration
  persistence: {
    backupFrequency: 'phase_completion',
    compressionEnabled: true,
    encryptionEnabled: false // Enable in production
  }
} as const;
```

This state management design provides:

✅ **Clean 4-Phase State Structure** - Well-organized data for each phase
✅ **Cross-Phase Memory Flow** - Context preserved between phases  
✅ **Robust Transition Management** - Validation and error handling
✅ **LangGraph Integration** - Leverages existing infrastructure
✅ **Triple-Layer Persistence** - Reliable state recovery
✅ **User Control Gates** - Explicit approval points