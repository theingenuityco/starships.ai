/**
 * First Officer Agent Module
 *
 * Exports the main First Officer Agent and related components
 * for expedition orchestration and workflow management.
 *
 * Includes both original and enhanced implementations with
 * advanced LangGraph integration features.
 */

// Core agents
export { FirstOfficerAgent } from './FirstOfficerAgent';
// COMMENTED OUT: EnhancedFirstOfficerAgent file is missing
// export { EnhancedFirstOfficerAgent } from './EnhancedFirstOfficerAgent';
export { createMCPEnabledFirstOfficerAgent } from './MCPEnabledFirstOfficerAgent';

// Core components
export { AgentSelector } from './AgentSelector';
export { QualityValidator } from './QualityValidator';
export { TaskExecutor } from './TaskExecutor';
export { MCPEnhancedTaskExecutor } from './MCPEnhancedTaskExecutor';
export { ChatCoordinator } from './ChatCoordinator';

// State persistence utility
export { StatePersistence } from './StatePersistence';

// LangGraph workflow components
export * from './workflow';

// WebSocket event emitter for real-time updates
export { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';

// Export types
export type {
  FirstOfficerState,
  FirstOfficerConfig,
  WorkflowNodeResult,
  ObjectiveAnalysis,
  TaskPlan,
  AgentAssignment,
  CompletedTask,
  ExpeditionProgress,
  TaskExecution,
  QualityCheck,
  AgentSelectionCriteria,
  TaskExecutionOptions,
  CoordinationMessageType,
  CoordinationMessage,
  AgentWorkload,

  // Workflow types
  UserApprovalResponse,
  EnhancedWorkflowOptions,
  WorkflowCheckpoint,
  TaskDependency,
  ParallelExecutionGroup,
} from './types';

export type {
  MCPEnabledFirstOfficerConfig,
  MCPEnabledFirstOfficerAgent,
} from './MCPEnabledFirstOfficerAgent';
