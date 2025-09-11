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

// ===== ENGINE SYSTEM =====
// Engine class and event types
export { Engine } from './engine/Engine';
export type { ExecutionEvent } from './engine/Engine';

// Memory system
export { Memory } from './Memory';
export type { MemoryParams, MemoryState, Message } from './Memory';

// Agent memory system
export { AgentMemory } from './AgentMemory';
export type { AgentIdentity, AgentMemoryParams, AgentMemoryState, AgentPurpose, AgentSpace } from './AgentMemory';

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
  AgentHandler,
  ConditionalHandler,
  EndHandler,
  HttpRequestHandler,
  LlmHandler,
  OutputHandler,
  PromptHandler,
  StartHandler,
  WorkflowHandler,
} from './nodes/handlers';

// Validation
export { Validator } from './validation/Validator';

// Workflow Types - clean exports
export type {
  // Node parameter types
  AgentParams,
  // Core workflow types
  Blueprint,
  ConditionalNodeParameters,
  Edge,
  // Execution types
  Execution,
  ExecutionStatus,
  HttpRequestNodeParameters,
  LlmNodeParameters,
  Node,
  NodeParameters,
  NodeResult,
  NodeType,
  OutputNodeParameters,
  UserPromptNodeParameters,
  ValidationError,
  // Validation types
  ValidationResult,
  ValidationSuggestion,
  ValidationWarning,
  WorkflowParams,
} from './types';

// Configuration
export { config } from './constants';

// Autopilot configuration manager
export { autopilot, AutopilotManager } from './Autopilot';
export type { AutopilotConfig, AutopilotCredentials } from './Autopilot';

// ===== STREAMING SYSTEM =====
// Minimal streaming interface for external implementations
export type { StreamingEmitter } from './types/streamingEmitter';
