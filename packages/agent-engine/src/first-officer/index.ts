/**
 * First Officer Agent Module
 * 
 * Exports all First Officer orchestration components for expedition management.
 */

export { FirstOfficerAgent } from './FirstOfficerAgent';
export { AgentSelector } from './AgentSelector';
export { QualityValidator } from './QualityValidator';
export { TaskExecutor } from './TaskExecutor';
export { ChatCoordinator } from './ChatCoordinator';

// Export types
export type {
  FirstOfficerState,
  FirstOfficerConfig,
  ObjectiveAnalysis,
  TaskPlan,
  AgentAssignment,
  TaskExecution,
  CompletedTask,
  QualityCheck,
  AgentSelectionCriteria,
  TaskExecutionOptions,
  CoordinationMessage,
  CoordinationMessageType,
  ExpeditionProgress,
  AgentWorkload
} from './types';