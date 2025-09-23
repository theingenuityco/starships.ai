/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 * This file contains ONLY parameter definitions to avoid circular dependencies
 */

import { Blueprint } from './blueprint';
import type { LlmMessage } from '@/types';

/**
 * Transform operation for state mutations using JSON Patch-like operations
 */
export interface TransformOperation {
  /** JSON Patch operation type */
  operation: 'add' | 'replace' | 'remove' | 'copy' | 'move' | 'test';
  /** JSON Pointer path (e.g., "/state/counter", "/state/user/name") */
  path: string;
  /** Value to apply - can be static value or template expression {{ }} */
  value?: unknown;
  /** For copy/move operations - source path */
  from?: string;
}

/**
 * Base parameters interface that all node parameters extend from
 */
export interface BaseParams {
  transforms?: TransformOperation[];
  mutations?: TransformOperation[];
  condition?: string; // JavaScript expression for conditional evaluation
}

/**
 * User prompt node parameters for user interaction
 */
export interface UserPromptParams extends BaseParams {
  promptText: string;
  choices: UserPromptChoice[];
  sourceNodeId?: string;
  timeout?: number;
  required?: boolean;
}

/**
 * User prompt choice definition
 */
export interface UserPromptChoice {
  id: string;
  text: string;
  description?: string;
  value: unknown;
}

/**
 * HTTP request node parameters for making HTTP calls
 * Fully compatible with fetch RequestInit structure
 */
export interface HttpRequestParams extends BaseParams, Omit<RequestInit, 'body'> {
  // Required URL (not part of RequestInit as it's the first parameter to fetch)
  url: string;

  // Overriding body to make it a string or object
  body?: Record<string, unknown> | string | null;

  // Custom properties for convenience
  timeout?: number;
}

/**
 * Tool parameter schema for function calling
 */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  items?: ToolParameterSchema; // For array type
  properties?: Record<string, ToolParameterSchema>; // For object type
}

/**
 * Tool node parameters for function execution
 */
export interface ToolParams extends BaseParams {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
  blueprint: Blueprint; // Required: Tool executes this nested workflow
  toolCallId?: string; // Optional: ID linking this execution to the originating assistant tool_call
  // Tool-specific execution parameters can be added here
}

/**
 * LLM node parameters for AI model interactions via OpenRouter
 * Note: API key is now managed by the Autopilot singleton
 * Template expressions ({{ }}) are supported for all numeric and string fields
 */
export interface LlmParams extends BaseParams {
  model: string;
  messages: { role: string; content: string }[] | string;
  temperature?: number | string; // Supports template expressions
  maxTokens?: number | string; // Supports template expressions
  timeout?: number | string; // Supports template expressions
  topP?: number | string; // Supports template expressions
  frequencyPenalty?: number | string; // Supports template expressions
  presencePenalty?: number | string; // Supports template expressions
  tools?: ToolParams[] | string; // Optional tools for function calling schema, supports template expressions
}

/**
 * Workflow node parameters for executing embedded blueprints
 */
export interface WorkflowParams extends BaseParams {
  // Core agent identity
  name: string;
  description?: string;

  // Execution parameters
  timeout?: number;

  // Blueprint execution
  blueprint: Blueprint;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Agent state containing runtime data (messages and tools)
 */
export interface AgentState {
  messages?: LlmMessage[]; // Message history
  tools?: ToolParams[]; // Available tools
  starshipId?: string; // Implicit context for host tools (e.g., Daedalus)
  baseUrl?: string; // Server base URL for host tools (e.g., http://localhost:4000/api/v1)
  authToken?: string; // JWT token for Authorization header (without "Bearer ")
}

/**
 * Agent-specific node parameters
 * Contains full agent configuration for workflow execution
 */
export interface AgentParams extends BaseParams {
  // Core agent identity
  name: string;
  description?: string;

  // LLM configuration
  model: string;
  temperature?: number;
  maxTokens?: number;

  // Execution parameters
  timeout?: number;

  // System prompt (configuration - set once)
  systemPrompt?: string;

  // Runtime state (optional - Agent will create default if not provided)
  state?: AgentState;

  // Blueprint execution (optional - Agent will create default if not provided)
  blueprint?: Blueprint;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Conditional node parameters for branching logic
 */
export type ConditionalParams = BaseParams;
// Inherits condition?: string from BaseParams
// No additional parameters needed - pure conditional evaluation node

/**
 * Start and End node parameters
 */
export interface StartParams extends BaseParams {
  [key: string]: unknown;
}

export interface EndParams extends BaseParams {
  /**
   * Optional output to return from the engine when this End node completes.
   * Accepts static values or template expressions using {{ ... }} which are resolved at runtime.
   */
  output?: unknown;
}

/**
 * Transform node parameters for input->output transformations
 */
export type TransformParams = BaseParams;
// Inherits transforms?: TransformOperation[] from BaseParams
// No additional parameters needed

/**
 * Mutate node parameters for state mutation operations
 */
export type MutateParams = BaseParams;
// Inherits mutations?: TransformOperation[] from BaseParams
// No additional parameters needed

/**
 * Code node parameters for JavaScript function execution
 */
export interface CodeParams extends BaseParams {
  code: string; // JavaScript code to execute
  timeout?: number; // Execution timeout in milliseconds (default: 5000)
}

/**
 * Union type for all workflow node parameters
 */
export type NodeParameters =
  | AgentParams
  | UserPromptParams
  | HttpRequestParams
  | LlmParams
  | WorkflowParams
  | ToolParams
  | StartParams
  | EndParams
  | ConditionalParams
  | TransformParams
  | MutateParams
  | CodeParams;
