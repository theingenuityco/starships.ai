/**
 * @starships/autopilot
 *
 * Workflow execution engine and agent development framework for starships.ai
 */

// ===== WORKFLOW SYSTEM =====
// Core workflow class (replaces Registry + Engine pattern)
export { Workflow } from './Workflow';

// Node system
export { Handler } from './nodes/Handler';

// Individual handlers
export {
  StartHandler,
  EndHandler,
  AgentHandler,
  ConditionalHandler,
  PromptHandler,
  OutputHandler,
  HttpRequestHandler,
  LlmHandler,
  WorkflowHandler
} from './nodes/handlers';

// Validation
export { Validator } from './validation/Validator';

// Workflow Types - clean exports
export type {
  // Core workflow types
  Blueprint,
  Node,
  Edge,
  NodeType,
  NodeParameters,
  
  // Execution types
  RuntimeState,
  ExecutionContext,
  NodeResult,
  ExecutionStatus,
  
  // Node parameter types
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters,
  OutputNodeParameters,
  HttpRequestNodeParameters,
  LlmNodeParameters,
  WorkflowNodeParameters,
  
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion
} from './types';

// Configuration
export { config } from './constants';

// Agent framework was removed - autopilot now focuses on workflow execution only
import { Workflow } from './Workflow';
import { Validator } from './validation/Validator';

// Create default instances for convenience
const _defaultValidator = new Validator();

// Export configured instances
export const defaultValidator = _defaultValidator;

// Helper function to create a new workflow with default handlers
export const createWorkflow = (id: string): Workflow => {
  return new Workflow(id);
};