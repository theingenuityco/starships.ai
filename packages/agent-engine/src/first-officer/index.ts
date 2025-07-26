/**
 * First Officer Agent Module
 * 
 * Exports the main First Officer Agent and related components
 * for expedition orchestration and workflow management.
 * 
 * Includes both original and enhanced implementations with
 * advanced LangGraph integration features.
 */

// Core agents (original and enhanced)
export { FirstOfficerAgent } from './FirstOfficerAgent';
export { EnhancedFirstOfficerAgent } from './EnhancedFirstOfficerAgent';
export { EnhancedFirstOfficerAgentV2 } from './EnhancedFirstOfficerAgentV2';

// Core components
export { AgentSelector } from './AgentSelector';
export { QualityValidator } from './QualityValidator';
export { TaskExecutor } from './TaskExecutor';
export { ChatCoordinator } from './ChatCoordinator';

// Enhanced workflow components
export {
  TaskDependencyResolver,
  ConditionalWorkflowManager,
  UserApprovalManager,
  WorkflowStatePersistence
} from './WorkflowEnhancements';

// LangGraph workflow components
export * from './workflow';

// Parallel execution framework
export { ParallelExecutionFramework } from './parallel/ParallelExecutionFramework';
export { WebSocketEventEmitter } from './parallel/WebSocketEventEmitter';
export { DependencyResolver } from './parallel/DependencyResolver';
export { ResourceManager } from './parallel/ResourceManager';
export { TaskScheduler } from './parallel/TaskScheduler';
export { PerformanceMonitor } from './parallel/PerformanceMonitor';

// Testing utilities
export {
  testEnhancedIntegration,
  testErrorScenarios,
  runAllTests
} from './test-integration';

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
  
  // Enhanced types
  UserApprovalResponse,
  EnhancedWorkflowOptions,
  WorkflowCheckpoint,
  TaskDependency,
  ParallelExecutionGroup
} from './types';