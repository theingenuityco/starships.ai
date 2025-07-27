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
export { createMCPEnabledFirstOfficerAgent } from './MCPEnabledFirstOfficerAgent';

// Core components
export { AgentSelector } from './AgentSelector';
export { QualityValidator } from './QualityValidator';
export { TaskExecutor } from './TaskExecutor';
export { MCPEnhancedTaskExecutor } from './MCPEnhancedTaskExecutor';
export { ChatCoordinator } from './ChatCoordinator';

// Enhanced workflow components
export {
  TaskDependencyResolver,
  ConditionalWorkflowManager,
  UserApprovalManager,
  WorkflowStatePersistence
} from './WorkflowEnhancements';

// LangGraph workflow (for future API compatibility)
export { LangGraphWorkflow } from './LangGraphWorkflow';

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

export type { 
  MCPEnabledFirstOfficerConfig,
  MCPEnabledFirstOfficerAgent 
} from './MCPEnabledFirstOfficerAgent';