/**
 * @starships/autopilot
 *
 * Workflow execution engine and agent development framework for starships.ai
 */

// ===== WORKFLOW SYSTEM =====
// Core workflow class (replaces Registry + Engine pattern)
export { Workflow } from './Workflow';

// ===== AGENT SYSTEM =====
// Core agent class for agent execution
export { Agent } from './Agent';

// Agent memory system
export { AgentMemory } from './AgentMemory';
export type { ConversationEntry, LLMMessage } from './AgentMemory';

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
  Execution,
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

// Import classes for convenience functions
import { Workflow } from './Workflow';
import { Agent } from './Agent';
import { AgentMemory } from './AgentMemory';
import { Validator } from './validation/Validator';
import { AgentNodeParameters } from './types';

// Create default instances for convenience
const _defaultValidator = new Validator();

// Export configured instances
export const defaultValidator = _defaultValidator;

// Helper function to create a new workflow with default handlers
export const createWorkflow = (): Workflow => {
  return new Workflow();
};

// Helper function to create a new agent
export const createAgent = (config: AgentNodeParameters): Agent => {
  return new Agent(config);
};

// Helper function to create agent memory
export const createAgentMemory = (initialSystemPrompt?: string): AgentMemory => {
  return new AgentMemory(initialSystemPrompt);
};