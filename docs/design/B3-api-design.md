# B3: API Design

**Design Phase**: B3 - API Design  
**Created**: 2025-01-08  
**Dependencies**: B1 (State Management), B2 (Workflow Architecture), A4 (Frontend Analysis)

## Overview

This document defines the backend API design for the 4-phase expedition management system, including REST endpoints for phase progression, user execution triggers, and WebSocket event schemas for real-time updates.

## 1. Phase Progression Endpoints

### 1.1 Core Phase Management APIs

```typescript
/**
 * 4-Phase Expedition Management REST APIs
 * Extends existing expedition endpoints with phase-specific functionality
 */

// POST /api/starships/:starshipId/expeditions/:expeditionId/phases/progress
interface PhaseProgressionRequest {
  targetPhase: 'plan' | 'execute' | 'result';
  transitionData?: {
    userApproval?: boolean;
    userComments?: string;
    skipValidation?: boolean; // For debugging/admin use
  };
  force?: boolean; // Override validation failures (admin only)
}

interface PhaseProgressionResponse {
  success: boolean;
  expedition: {
    id: string;
    currentPhase: ExpeditionPhase;
    expeditionStatus: ExpeditionStatus;
    phaseStartedAt: string;
    phaseCompletedAt?: string;
  };
  transitionResult?: {
    fromPhase: ExpeditionPhase;
    toPhase: ExpeditionPhase;
    duration: number; // seconds
    validationsPassed: string[];
    validationsFailed: string[];
  };
  error?: {
    type: 'validation_failed' | 'transition_invalid' | 'user_approval_required' | 'system_error';
    message: string;
    details?: any;
  };
}

// GET /api/starships/:starshipId/expeditions/:expeditionId/phases/current
interface CurrentPhaseResponse {
  currentPhase: ExpeditionPhase;
  expeditionStatus: ExpeditionStatus;
  phaseStartedAt: string;
  phaseProgress: {
    percentage: number; // 0-100
    currentStep?: string;
    estimatedTimeRemaining?: number; // minutes
  };
  availableActions: Array<{
    action: 'progress_phase' | 'start_execution' | 'pause' | 'cancel';
    enabled: boolean;
    reason?: string; // Why action is disabled
  }>;
  phaseData: PhaseSpecificData;
}

// GET /api/starships/:starshipId/expeditions/:expeditionId/phases/:phase/status
interface PhaseStatusResponse {
  phase: ExpeditionPhase;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  duration?: number; // minutes
  data: PhaseSpecificData;
  validationResults?: {
    passed: string[];
    failed: string[];
    warnings: string[];
  };
}
```

### 1.2 Phase-Specific Data Types

```typescript
/**
 * Phase-specific data structures returned by phase status endpoints
 */

type PhaseSpecificData = 
  | RefinePhaseData 
  | PlanPhaseData 
  | ExecutePhaseData 
  | ResultPhaseData;

interface RefinePhaseData {
  type: 'refine';
  originalMission: string;
  visionContext?: string;
  clarifyingQuestions: string[];
  userClarifications: Array<{
    question: string;
    answer: string;
    timestamp: string;
  }>;
  refinedMission?: string;
  refinedRequirements?: string[];
  missionComplexity?: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration?: number;
  conversationHistory: ConversationMessage[];
  refinementComplete: boolean;
}

interface PlanPhaseData {
  type: 'plan';
  refinedMission: string;
  refinedRequirements: string[];
  taskBreakdown: TaskBreakdown[];
  agentAssignments: Record<string, string[]>; // agentId -> taskIds
  workflowDSL?: WorkflowDSL;
  workflowVisualization?: string;
  dependencyGraph: Record<string, string[]>; // taskId -> dependencies
  planApprovalRequired: boolean;
  userApprovedPlan: boolean;
  planningComplete: boolean;
}

interface ExecutePhaseData {
  type: 'execute';
  workflowRuntimeState?: WorkflowRuntimeState;
  executionResults: Map<string, WorkflowNodeResult>;
  currentWorkflowNode?: string;
  executionProgress: number; // 0-100
  activeAgentTasks: Record<string, TaskExecution>;
  completedTasks: CompletedTask[];
  failedTasks: Array<{taskId: string; error: string; retryCount: number}>;
  executionComplete: boolean;
  executionSummary?: string;
  agentOutputs: Record<string, any>;
}

interface ResultPhaseData {
  type: 'result';
  executionSummary: string;
  agentOutputs: Record<string, any>;
  finalResult?: string;
  expeditionSummary?: string;
  qualityScore?: number;
  keyAchievements: string[];
  lessonsLearned: string[];
  deliverables: Array<{
    name: string;
    content: string;
    type: string;
  }>;
  synthesisComplete: boolean;
}
```

## 2. User Execution Trigger API

### 2.1 Plan Approval and Execution Start

```typescript
/**
 * User-controlled execution trigger endpoints
 * Provides explicit user approval and execution control
 */

// POST /api/starships/:starshipId/expeditions/:expeditionId/approve-plan
interface ApprovePlanRequest {
  approved: boolean;
  comments?: string;
  modifications?: {
    taskChanges?: Array<{
      taskId: string;
      changes: Partial<TaskBreakdown>;
    }>;
    agentReassignments?: Record<string, string[]>;
    workflowModifications?: string; // Freeform modification requests
  };
}

interface ApprovePlanResponse {
  success: boolean;
  approved: boolean;
  planApprovedAt?: string;
  nextPhaseAvailable: boolean;
  expedition: {
    id: string;
    currentPhase: ExpeditionPhase;
    userApprovedPlan: boolean;
  };
  error?: string;
}

// POST /api/starships/:starshipId/expeditions/:expeditionId/start-execution
interface StartExecutionRequest {
  // Confirmation that user understands execution will begin
  confirmExecution: true;
  
  // Optional execution configuration
  executionConfig?: {
    pauseOnError?: boolean;
    maxRetries?: number;
    timeoutMinutes?: number;
    enableRealTimeUpdates?: boolean;
  };
  
  // User preferences for execution
  preferences?: {
    notifyOnCompletion?: boolean;
    detailedProgress?: boolean;
  };
}

interface StartExecutionResponse {
  success: boolean;
  executionStarted: boolean;
  executionStartedAt?: string;
  workflowRuntimeState?: {
    id: string;
    status: 'initializing' | 'running';
    estimatedDuration: number;
  };
  expedition: {
    id: string;
    currentPhase: ExpeditionPhase;
    expeditionStatus: ExpeditionStatus;
  };
  error?: {
    type: 'plan_not_approved' | 'execution_already_started' | 'system_error';
    message: string;
  };
}

// POST /api/starships/:starshipId/expeditions/:expeditionId/execution/control
interface ExecutionControlRequest {
  action: 'pause' | 'resume' | 'cancel';
  reason?: string;
}

interface ExecutionControlResponse {
  success: boolean;
  action: string;
  executionStatus: 'running' | 'paused' | 'cancelled';
  actionPerformedAt: string;
  expedition: {
    id: string;
    expeditionStatus: ExpeditionStatus;
  };
  error?: string;
}
```

### 2.2 Plan Review and Modification APIs

```typescript
/**
 * Plan review endpoints for user approval workflow
 */

// GET /api/starships/:starshipId/expeditions/:expeditionId/plan/review
interface PlanReviewResponse {
  planReady: boolean;
  planGeneratedAt?: string;
  
  taskBreakdown: Array<TaskBreakdown & {
    estimatedDuration: number;
    complexity: 'simple' | 'moderate' | 'complex';
    riskLevel: 'low' | 'medium' | 'high';
  }>;
  
  agentAssignments: Array<{
    agentId: string;
    agentName: string;
    assignedTasks: string[];
    workload: number; // 0-100 percentage
    skillMatch: number; // 0-100 how well skills match tasks
  }>;
  
  workflowVisualization: {
    ascii: string;
    mermaid?: string;
    nodes: Array<{
      id: string;
      type: string;
      title: string;
      dependencies: string[];
    }>;
  };
  
  riskAssessment: {
    overallRisk: 'low' | 'medium' | 'high';
    riskFactors: string[];
    mitigationStrategies: string[];
  };
  
  estimatedOutcome: {
    successProbability: number; // 0-100
    estimatedDuration: number; // minutes
    keyDeliverables: string[];
  };
}

// POST /api/starships/:starshipId/expeditions/:expeditionId/plan/request-changes
interface PlanChangeRequest {
  changeType: 'task_modification' | 'agent_reassignment' | 'workflow_adjustment' | 'scope_change';
  description: string;
  specificChanges: {
    taskChanges?: Array<{
      taskId: string;
      requestedChanges: string;
    }>;
    agentPreferences?: Array<{
      taskId: string;
      preferredAgentId?: string;
      avoidAgentId?: string;
    }>;
    scopeAdjustments?: {
      addRequirements?: string[];
      removeRequirements?: string[];
      modifyRequirement?: Array<{original: string; modified: string}>;
    };
  };
}

interface PlanChangeResponse {
  changeRequestReceived: boolean;
  estimatedReplanTime: number; // minutes
  changesWillRequireNewApproval: boolean;
  expedition: {
    id: string;
    currentPhase: ExpeditionPhase;
    expeditionStatus: ExpeditionStatus;
  };
}
```

## 3. Real-time Execution Monitoring APIs

### 3.1 Execution Progress Endpoints

```typescript
/**
 * Real-time execution monitoring and progress tracking
 */

// GET /api/starships/:starshipId/expeditions/:expeditionId/execution/progress
interface ExecutionProgressResponse {
  executionActive: boolean;
  startedAt?: string;
  
  overallProgress: {
    percentage: number; // 0-100
    currentPhase: 'initializing' | 'executing' | 'completing';
    estimatedTimeRemaining: number; // minutes
  };
  
  workflowProgress: {
    totalNodes: number;
    completedNodes: number;
    currentNode?: {
      id: string;
      title: string;
      startedAt: string;
      estimatedCompletion: string;
    };
    failedNodes: Array<{
      id: string;
      error: string;
      retryCount: number;
      canRetry: boolean;
    }>;
  };
  
  agentProgress: Array<{
    agentId: string;
    agentName: string;
    currentTask?: {
      taskId: string;
      title: string;
      progress: number; // 0-100
      startedAt: string;
    };
    completedTasks: number;
    totalTasks: number;
    status: 'idle' | 'working' | 'waiting' | 'error';
  }>;
  
  recentActivities: Array<{
    timestamp: string;
    agentId?: string;
    activity: string;
    type: 'task_start' | 'task_complete' | 'tool_usage' | 'error' | 'milestone';
  }>;
}

// GET /api/starships/:starshipId/expeditions/:expeditionId/execution/live-feed
// Server-Sent Events endpoint for real-time updates
interface ExecutionLiveFeedEvent {
  eventType: 'progress' | 'agent_activity' | 'task_update' | 'workflow_event' | 'error';
  timestamp: string;
  data: {
    // Event-specific data structure
    progress?: {percentage: number; estimatedTimeRemaining: number};
    agentActivity?: {agentId: string; activity: string};
    taskUpdate?: {taskId: string; status: string; progress: number};
    workflowEvent?: {nodeId: string; event: string; data: any};
    error?: {message: string; recoverable: boolean};
  };
}
```

### 3.2 Execution Results and Output APIs

```typescript
/**
 * Execution results and intermediate output retrieval
 */

// GET /api/starships/:starshipId/expeditions/:expeditionId/execution/results
interface ExecutionResultsResponse {
  executionComplete: boolean;
  completedAt?: string;
  totalDuration?: number; // minutes
  
  taskResults: Array<{
    taskId: string;
    title: string;
    assignedAgentId: string;
    status: 'completed' | 'failed' | 'skipped';
    result?: string;
    deliverable?: string;
    error?: string;
    duration: number; // minutes
    quality: number; // 0-100
  }>;
  
  agentOutputs: Record<string, {
    finalOutput: string;
    intermediateOutputs: Array<{
      timestamp: string;
      output: string;
      type: 'progress' | 'result' | 'debug';
    }>;
    toolsUsed: Array<{
      tool: string;
      usage: number; // times used
      successRate: number; // 0-100
    }>;
    performance: {
      tasksCompleted: number;
      averageTaskDuration: number;
      qualityScore: number; // 0-100
    };
  }>;
  
  overallSummary: {
    successRate: number; // 0-100
    tasksCompleted: number;
    tasksFailed: number;
    keyAccomplishments: string[];
    challengesEncountered: string[];
  };
}

// GET /api/starships/:starshipId/expeditions/:expeditionId/execution/artifacts
interface ExecutionArtifactsResponse {
  artifacts: Array<{
    id: string;
    name: string;
    type: 'document' | 'code' | 'data' | 'image' | 'other';
    size: number; // bytes
    createdBy: string; // agentId
    createdAt: string;
    downloadUrl: string;
    preview?: string; // Small preview/thumbnail
  }>;
  
  workflowLogs: Array<{
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    source: string; // agentId or system component
    message: string;
    metadata?: any;
  }>;
  
  performanceMetrics: {
    totalExecutionTime: number; // milliseconds
    agentUtilization: Record<string, number>; // agentId -> percentage
    resourceUsage: {
      memoryPeak: number; // MB
      cpuAverage: number; // percentage
      networkRequests: number;
    };
  };
}
```

## 4. WebSocket Event Schema

### 4.1 Enhanced 4-Phase Event Types

```typescript
/**
 * Enhanced WebSocket event schema for 4-phase expedition flow
 * Extends existing expedition events with phase-specific updates
 */

// Base event interface
interface Enhanced4PhaseWebSocketEvent {
  eventId: string;
  timestamp: string;
  expeditionId: string;
  userId?: string;
  agentId?: string;
}

// Phase transition events
interface PhaseChangeEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:phase-changed';
  data: {
    fromPhase: ExpeditionPhase;
    toPhase: ExpeditionPhase;
    transitionDuration: number; // seconds
    phaseStartedAt: string;
    validationResults?: {
      passed: string[];
      failed: string[];
    };
  };
}

// Refine phase events
interface MissionRefinementEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:refinement-progress';
  data: {
    clarifyingQuestions?: string[];
    userClarifications?: Array<{question: string; answer: string}>;
    refinementComplete?: boolean;
    refinedMission?: string;
    conversationUpdate?: {
      messageCount: number;
      lastMessage: ConversationMessage;
    };
  };
}

// Plan phase events
interface PlanReadyEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:plan-ready';
  data: {
    taskBreakdown: TaskBreakdown[];
    agentAssignments: Record<string, string[]>;
    workflowVisualization: string;
    planApprovalRequired: boolean;
    riskAssessment: {
      overallRisk: 'low' | 'medium' | 'high';
      riskFactors: string[];
    };
  };
}

interface PlanApprovalEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:plan-approved' | 'expedition:plan-rejected';
  data: {
    approved: boolean;
    approvedAt?: string;
    userComments?: string;
    modificationsRequested?: boolean;
  };
}

// Execute phase events
interface ExecutionStartedEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:execution-started';
  data: {
    executionStartedAt: string;
    workflowRuntimeState: {
      id: string;
      totalNodes: number;
      estimatedDuration: number;
    };
    executionConfig: {
      maxRetries: number;
      timeoutMinutes: number;
    };
  };
}

interface ExecutionProgressEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:execution-progress';
  data: {
    overallProgress: number; // 0-100
    currentNode?: string;
    completedNodes: number;
    totalNodes: number;
    estimatedTimeRemaining: number; // minutes
  };
}

interface WorkflowNodeEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'workflow:node-started' | 'workflow:node-completed' | 'workflow:node-failed';
  data: {
    nodeId: string;
    nodeType: string;
    nodeTitle: string;
    startedAt?: string;
    completedAt?: string;
    duration?: number; // seconds
    result?: any;
    error?: string;
  };
}

interface AgentTaskEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'agent:task-started' | 'agent:task-progress' | 'agent:task-completed' | 'agent:task-failed';
  data: {
    taskId: string;
    taskTitle: string;
    progress?: number; // 0-100
    result?: string;
    error?: string;
    estimatedTimeRemaining?: number; // minutes
  };
}

interface AgentActivityStreamEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'agent:activity-stream';
  data: {
    activityType: 'thinking' | 'tool-usage' | 'progress-update' | 'collaboration';
    activity: string;
    details?: any;
    streamable: boolean; // Whether this activity supports real-time streaming
  };
}

// Result phase events
interface ResultSynthesisEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:result-synthesis-progress';
  data: {
    synthesisProgress: number; // 0-100
    currentStep: 'analyzing' | 'synthesizing' | 'quality-check' | 'finalizing';
    preliminaryResult?: string;
  };
}

interface ExpeditionCompletedEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:completed';
  data: {
    completedAt: string;
    totalDuration: number; // minutes
    finalResult: string;
    qualityScore: number; // 0-100
    keyAchievements: string[];
    deliverables: Array<{
      name: string;
      type: string;
      downloadUrl?: string;
    }>;
  };
}

// Error and control events
interface ExecutionPausedEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:execution-paused' | 'expedition:execution-resumed';
  data: {
    action: 'paused' | 'resumed';
    actionPerformedAt: string;
    reason?: string;
    canResume?: boolean;
  };
}

interface ExpeditionErrorEvent extends Enhanced4PhaseWebSocketEvent {
  type: 'expedition:error';
  data: {
    phase: ExpeditionPhase;
    errorType: 'validation' | 'execution' | 'system' | 'user';
    error: string;
    recoverable: boolean;
    suggestedAction?: string;
    retryCount?: number;
  };
}

// Union type for all 4-phase events
type All4PhaseWebSocketEvents = 
  | PhaseChangeEvent
  | MissionRefinementEvent
  | PlanReadyEvent
  | PlanApprovalEvent
  | ExecutionStartedEvent
  | ExecutionProgressEvent
  | WorkflowNodeEvent
  | AgentTaskEvent
  | AgentActivityStreamEvent
  | ResultSynthesisEvent
  | ExpeditionCompletedEvent
  | ExecutionPausedEvent
  | ExpeditionErrorEvent;
```

### 4.2 WebSocket Event Subscription Management

```typescript
/**
 * Enhanced WebSocket subscription interface for 4-phase events
 */

interface Enhanced4PhaseSocketAPI {
  // Phase-specific subscriptions
  subscribeToPhaseChanges(
    expeditionId: string,
    callback: (fromPhase: ExpeditionPhase, toPhase: ExpeditionPhase, data: any) => void
  ): () => void;
  
  subscribeToRefinementProgress(
    expeditionId: string,
    callback: (progress: MissionRefinementEvent['data']) => void
  ): () => void;
  
  subscribeToplanReady(
    expeditionId: string,
    callback: (planData: PlanReadyEvent['data']) => void
  ): () => void;
  
  subscribeToPlanApproval(
    expeditionId: string,
    callback: (approval: PlanApprovalEvent['data']) => void
  ): () => void;
  
  subscribeToExecutionProgress(
    expeditionId: string,
    callback: (progress: ExecutionProgressEvent['data']) => void
  ): () => void;
  
  subscribeToWorkflowEvents(
    expeditionId: string,
    callback: (event: WorkflowNodeEvent) => void
  ): () => void;
  
  subscribeToAgentTasks(
    expeditionId: string,
    callback: (taskEvent: AgentTaskEvent) => void
  ): () => void;
  
  subscribeToAgentActivityStream(
    expeditionId: string,
    agentId: string,
    callback: (activity: AgentActivityStreamEvent['data']) => void
  ): () => void;
  
  subscribeToResultSynthesis(
    expeditionId: string,
    callback: (synthesis: ResultSynthesisEvent['data']) => void
  ): () => void;
  
  // Control and management
  subscribeToExecutionControl(
    expeditionId: string,
    callback: (control: ExecutionPausedEvent['data']) => void
  ): () => void;
  
  subscribeToExpeditionErrors(
    expeditionId: string,
    callback: (error: ExpeditionErrorEvent['data']) => void
  ): () => void;
  
  // Bulk subscription for all 4-phase events
  subscribeToAll4PhaseEvents(
    expeditionId: string,
    callback: (event: All4PhaseWebSocketEvents) => void
  ): () => void;
}
```

## 5. API Integration with Existing Systems

### 5.1 Backward Compatibility Strategy

```typescript
/**
 * Backward compatibility wrappers for existing expedition APIs
 * Ensures existing frontend components continue to work
 */

// Existing endpoint: POST /api/starships/:starshipId/expeditions/:expeditionId/start
// Enhanced to support 4-phase flow
interface EnhancedStartExpeditionRequest {
  // Existing fields (maintained for compatibility)
  message?: string;
  
  // New 4-phase fields
  use4PhaseFlow?: boolean; // Default: true for new expeditions
  skipRefinementPhase?: boolean; // Jump directly to planning
  autoApprove?: boolean; // Skip user approval (for backward compatibility)
}

// Existing endpoint: GET /api/starships/:starshipId/expeditions/:expeditionId
// Enhanced response with 4-phase data
interface EnhancedExpeditionResponse {
  // Existing fields (maintained for compatibility)
  id: string;
  status: ExpeditionStatus; // Maps from currentPhase for compatibility
  createdAt: string;
  // ... other existing fields
  
  // New 4-phase fields
  is4Phase?: boolean;
  currentPhase?: ExpeditionPhase;
  phaseData?: PhaseSpecificData;
  phaseProgress?: {
    percentage: number;
    estimatedTimeRemaining?: number;
  };
}

// Compatibility helper functions
function mapPhaseToLegacyStatus(phase: ExpeditionPhase): ExpeditionStatus {
  const mapping = {
    'refine': 'planning' as const,
    'plan': 'planning' as const,
    'execute': 'in-progress' as const,
    'result': 'completed' as const
  };
  return mapping[phase];
}

function isLegacyExpedition(expedition: any): boolean {
  return !expedition.currentPhase || !expedition.is4Phase;
}
```

### 5.2 API Response Formats

```typescript
/**
 * Standardized API response formats for all 4-phase endpoints
 */

interface StandardAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    message: string;
    details?: any;
    code?: string;
  };
  meta?: {
    timestamp: string;
    version: string;
    requestId: string;
  };
}

// Success response wrapper
function createSuccessResponse<T>(data: T): StandardAPIResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: '4-phase-v1',
      requestId: generateRequestId()
    }
  };
}

// Error response wrapper
function createErrorResponse(
  type: string,
  message: string,
  details?: any
): StandardAPIResponse<never> {
  return {
    success: false,
    error: {
      type,
      message,
      details,
      code: generateErrorCode(type)
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '4-phase-v1',
      requestId: generateRequestId()
    }
  };
}
```

## 6. Security and Validation

### 6.1 API Security Considerations

```typescript
/**
 * Security middleware and validation for 4-phase APIs
 */

// Permission checks for phase operations
interface PhasePermissions {
  canProgressPhase: boolean;
  canStartExecution: boolean;
  canPauseExecution: boolean;
  canCancelExpedition: boolean;
  canViewSensitiveData: boolean; // execution logs, agent outputs
  canForceTransitions: boolean; // admin-only
}

// Rate limiting for phase operations
const PHASE_RATE_LIMITS = {
  'phase_progression': { requests: 10, window: '1m' },
  'start_execution': { requests: 3, window: '10m' },
  'plan_changes': { requests: 5, window: '5m' },
  'execution_control': { requests: 20, window: '1m' }
};

// Input validation schemas
const PhaseProgressionSchema = {
  targetPhase: { type: 'string', enum: ['plan', 'execute', 'result'] },
  transitionData: { type: 'object', optional: true },
  force: { type: 'boolean', optional: true, adminOnly: true }
};

const StartExecutionSchema = {
  confirmExecution: { type: 'boolean', required: true, value: true },
  executionConfig: { type: 'object', optional: true },
  preferences: { type: 'object', optional: true }
};
```

### 6.2 API Monitoring and Analytics

```typescript
/**
 * Analytics and monitoring for 4-phase API usage
 */

interface PhaseAnalytics {
  // Phase transition metrics
  phaseTransitionSuccess: Record<string, number>; // 'refine_to_plan': 95
  phaseTransitionFailures: Record<string, Array<{reason: string; count: number}>>;
  averagePhaseDuration: Record<ExpeditionPhase, number>; // minutes
  
  // User behavior metrics
  planApprovalRate: number; // 0-100
  planModificationRate: number; // 0-100
  executionStartRate: number; // 0-100 (plans that actually get executed)
  
  // System performance metrics
  apiResponseTimes: Record<string, number>; // endpoint -> avg response time ms
  webSocketEventLatency: number; // average event delivery time ms
  concurrentExecutions: number; // current active executions
}

// Metrics collection
function recordPhaseTransition(
  expeditionId: string,
  fromPhase: ExpeditionPhase,
  toPhase: ExpeditionPhase,
  success: boolean,
  duration: number,
  error?: string
): void {
  // Implementation for analytics recording
}

function recordUserAction(
  userId: string,
  action: 'approve_plan' | 'start_execution' | 'pause_execution',
  expeditionId: string,
  success: boolean
): void {
  // Implementation for user behavior analytics
}
```

## API Design Summary

This API design provides:

✅ **Complete 4-Phase Support** - Full REST API coverage for all phases  
✅ **User Control Integration** - Explicit approval and execution trigger endpoints  
✅ **Real-time Updates** - Enhanced WebSocket events for phase transitions  
✅ **Backward Compatibility** - Existing APIs continue to work seamlessly  
✅ **Security & Validation** - Proper permission checks and input validation  
✅ **Monitoring Ready** - Built-in analytics and performance tracking  
✅ **Extensible Design** - Easy to add new phase-specific functionality

<function_calls>
<invoke name="TodoWrite">
<parameter name="todos">[{"id": "6", "content": "B3: API Design - Design backend APIs for 4-phase expedition management", "status": "completed"}, {"id": "7", "content": "B3.1: Design phase progression endpoints", "status": "completed"}, {"id": "8", "content": "B3.2: Design user execution trigger API", "status": "completed"}, {"id": "9", "content": "B3.3: Design phase-specific data retrieval APIs", "status": "completed"}, {"id": "10", "content": "B3.4: Plan WebSocket event schema for real-time updates", "status": "completed"}, {"id": "11", "content": "B4: Frontend Component Design - Design UI components for phase-based expedition experience", "status": "in_progress"}]