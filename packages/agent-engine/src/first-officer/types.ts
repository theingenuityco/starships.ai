/**
 * First Officer Agent Types
 * 
 * TypeScript interfaces and types specific to the First Officer Agent
 * orchestration system using LangGraph workflows.
 */

import { 
  ExpeditionWorkflowState, 
  WorkflowPhase, 
  TaskBreakdown,
  ExpeditionStatus,
  TaskStatus,
  Agent
} from '@starships/protocol';

/**
 * Extended workflow state for First Officer operations
 */
export interface FirstOfficerState extends ExpeditionWorkflowState {
  // Analysis phase
  objectiveAnalysis?: ObjectiveAnalysis;
  
  // Planning phase
  taskPlan?: TaskPlan;
  
  // Agent selection phase
  availableAgents?: Agent[];
  selectedAgents?: AgentAssignment[];
  
  // Execution phase
  activeExecutions?: TaskExecution[];
  completedTasks?: CompletedTask[];
  
  // Quality control
  qualityChecks?: QualityCheck[];
  
  // Error handling
  retryAttempts?: Record<string, number>;
  escalationRequired?: boolean;
  
  // Enhanced workflow features
  userApprovalRequired?: boolean;
  userApprovalResponse?: UserApprovalResponse;
  parallelExecutionEnabled?: boolean;
  dependencyGraph?: Record<string, string[]>;
  criticalPath?: string[];
  
  // Final results
  finalResult?: string;
}

/**
 * Objective analysis result
 */
export interface ObjectiveAnalysis {
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  estimatedDuration: number; // in minutes
  requiredSkills: string[];
  riskFactors: string[];
  successCriteria: string[];
  approach: 'sequential' | 'parallel' | 'hybrid';
}

/**
 * Task planning structure
 */
export interface TaskPlan {
  tasks: TaskBreakdown[];
  dependencies: Record<string, string[]>;
  criticalPath: string[];
  parallelGroups: string[][];
  estimatedTotalTime: number;
}

/**
 * Agent assignment with reasoning
 */
export interface AgentAssignment {
  agentId: string;
  agentName: string;
  assignedTasks: string[];
  skillMatch: number; // 0-1 score
  workload: number; // estimated minutes
  reasoning: string;
}

/**
 * Task execution tracking
 */
export interface TaskExecution {
  taskId: string;
  agentId: string;
  status: TaskStatus;
  startTime: string;
  estimatedCompletion?: string;
  progress?: number; // 0-100
  intermediateResults?: string[];
  issues?: string[];
}

/**
 * Completed task with results
 */
export interface CompletedTask {
  taskId: string;
  agentId: string;
  result: string;
  completionTime: string;
  actualDuration: number;
  qualityScore?: number;
}

/**
 * Quality check result
 */
export interface QualityCheck {
  taskId: string;
  result: string;
  score: number; // 0-100
  issues: string[];
  suggestions: string[];
  approved: boolean;
  assessedBy: 'first-officer' | 'user';
  assessedAt: string;
}

/**
 * Agent selection criteria
 */
export interface AgentSelectionCriteria {
  requiredSkills: string[];
  preferredSkills?: string[];
  excludeAgents?: string[];
  maxAgents?: number;
  workloadBalance?: boolean;
}

/**
 * Task execution options
 */
export interface TaskExecutionOptions {
  timeout?: number; // in minutes
  retryLimit?: number;
  qualityThreshold?: number; // 0-100
  requireApproval?: boolean;
  parallelExecution?: boolean;
}

/**
 * First Officer workflow configuration
 */
export interface FirstOfficerConfig {
  maxRetries: number;
  qualityThreshold: number;
  timeoutMinutes: number;
  requireUserApproval: boolean;
  enableParallelExecution: boolean;
  autoEscalation: boolean;
  provider?: string;
  model?: string;
  temperature?: number;
}

/**
 * Workflow node results
 */
export interface WorkflowNodeResult {
  success: boolean;
  data?: any;
  error?: string;
  nextPhase?: WorkflowPhase;
  requiresUserInput?: boolean;
  userPrompt?: string;
}

/**
 * Chat coordination message types
 */
export type CoordinationMessageType = 
  | 'phase-update'
  | 'task-assignment'
  | 'progress-report'
  | 'quality-review'
  | 'user-question'
  | 'error-report'
  | 'completion-summary';

/**
 * Chat coordination message
 */
export interface CoordinationMessage {
  type: CoordinationMessageType;
  phase: WorkflowPhase;
  content: string;
  data?: any;
  timestamp: string;
  requiresResponse?: boolean;
}

/**
 * Agent workload information
 */
export interface AgentWorkload {
  agentId: string;
  currentTasks: number;
  estimatedMinutes: number;
  availability: 'available' | 'busy' | 'overloaded';
  lastActivity?: string;
}

/**
 * Expedition progress summary
 */
export interface ExpeditionProgress {
  expeditionId: string;
  currentPhase: WorkflowPhase;
  overallProgress: number; // 0-100
  tasksCompleted: number;
  tasksTotal: number;
  estimatedTimeRemaining: number;
  qualityScore: number;
  issues: string[];
}

/**
 * User approval response
 */
export interface UserApprovalResponse {
  action: 'approve' | 'reject' | 'modify' | 'resolve';
  targetPhase?: WorkflowPhase;
  comments?: string;
  modifications?: Record<string, any>;
  timestamp: string;
}

/**
 * Enhanced workflow execution options
 */
export interface EnhancedWorkflowOptions extends TaskExecutionOptions {
  enableDependencyResolution?: boolean;
  enableParallelExecution?: boolean;
  enableUserApprovalGates?: boolean;
  enableStatePersistence?: boolean;
  maxConcurrentTasks?: number;
  dependencyResolutionStrategy?: 'strict' | 'flexible' | 'adaptive';
}

/**
 * Workflow checkpoint for state persistence
 */
export interface WorkflowCheckpoint {
  checkpointId: string;
  expeditionId: string;
  state: FirstOfficerState;
  timestamp: string;
  phase: WorkflowPhase;
  metadata?: Record<string, any>;
}

/**
 * Task dependency information
 */
export interface TaskDependency {
  taskId: string;
  dependsOn: string[];
  dependencyType: 'blocking' | 'soft' | 'resource';
  resolved: boolean;
  resolutionStrategy?: string;
}

/**
 * Parallel execution group
 */
export interface ParallelExecutionGroup {
  groupId: string;
  tasks: string[];
  maxConcurrency: number;
  executionStrategy: 'all' | 'any' | 'majority';
  timeout?: number;
}