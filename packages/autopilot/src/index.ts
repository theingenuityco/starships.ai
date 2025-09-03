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

// Memory system
export { Memory } from './Memory';
export type { Message, MemoryState, MemoryParams } from './Memory';

// Agent memory system
export { AgentMemory } from './AgentMemory';
export type {
  AgentIdentity,
  AgentPurpose,
  AgentSpace,
  AgentMemoryState,
  AgentMemoryParams
} from './AgentMemory';

// ===== LLM SYSTEM =====
// Core LLM class for AI model interactions
export { LLM } from './LLM';

// ===== HTTP REQUEST SYSTEM =====
// Core HttpRequest class for external API calls
export { HttpRequest } from './HttpRequest';

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