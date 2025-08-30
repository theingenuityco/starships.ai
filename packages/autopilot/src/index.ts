/**
 * @starships/autopilot
 *
 * Workflow execution engine and agent development framework for starships.ai
 */

// ===== WORKFLOW SYSTEM =====
// Core engine
export { Engine } from './engine/Engine';
export type { EventCallback, ExecutionEvent } from './engine/Engine';

// Node system
export { Registry } from './nodes/Registry';
export { Handler } from './nodes/Handler';

// Individual handlers
export {
  StartHandler,
  EndHandler,
  AgentHandler,
  ConditionalHandler,
  PromptHandler,
  OutputHandler
} from './nodes/handlers';

// Validation
export { Validator } from './validation/Validator';

// Workflow Types - clean exports
export type {
  // Core workflow types
  Workflow,
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
  
  // Validation types
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationSuggestion
} from './types';

// Configuration
export { config } from './constants';

// Agent framework was removed - autopilot now focuses on workflow execution only
import { Engine } from './engine/Engine';
import { Registry } from './nodes/Registry';
import { Validator } from './validation/Validator';
import { 
  StartHandler, 
  EndHandler, 
  AgentHandler, 
  ConditionalHandler, 
  PromptHandler, 
  OutputHandler 
} from './nodes/handlers';

// Create default instances for convenience
const _defaultRegistry = new Registry();
const _defaultEngine = new Engine(_defaultRegistry);
const _defaultValidator = new Validator();

// Register default handlers
_defaultRegistry.register(new StartHandler());
_defaultRegistry.register(new EndHandler()); 
_defaultRegistry.register(new AgentHandler());
_defaultRegistry.register(new ConditionalHandler());
_defaultRegistry.register(new PromptHandler());
_defaultRegistry.register(new OutputHandler());

// Export configured instances
export const defaultRegistry = _defaultRegistry;
export const defaultEngine = _defaultEngine;
export const defaultValidator = _defaultValidator;