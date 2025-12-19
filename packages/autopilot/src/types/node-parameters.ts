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
  // Deprecated for Mutate node; kept for backward-compat template validation on non-mutate nodes
  mutations?: TransformOperation[];
  // New reducers support (for Mutate node and inline usage)
  reducers?: ReducerSpec[];
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
 * Fully compatible with fetch RequestInit structure at the surface, but
 * execution is delegated to the host runtime (HostRuntime.http).
 */
export interface HttpRequestParams extends BaseParams, Omit<RequestInit, 'body'> {
  // Required URL (not part of RequestInit as it's the first parameter to fetch)
  url: string;

  // Overriding body to make it a string or object
  body?: Record<string, unknown> | string | null;

  /**
   * Optional connector identifier/slug to execute this HTTP request through.
   * When provided, the host runtime may resolve connector records and inject
   * secrets/policies before performing the request.
   */
  connector?: string;

  // Custom properties for convenience
  timeout?: number;
}

/**
 * Tool parameter schema for function calling
 */
export interface ToolParameterSchema {
  // Core JSON Schema metadata
  $id?: string;
  $schema?: string;
  $ref?: string;

  // Basic annotations
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];

  // Type (single or union) including null
  type?:
    | 'string'
    | 'number'
    | 'boolean'
    | 'object'
    | 'array'
    | 'null'
    | Array<'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'>;

  // Enum / const
  enum?: unknown[];
  const?: unknown;

  // String-specific constraints
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;

  // Number-specific constraints
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // Array-specific constraints
  items?: ToolParameterSchema | ToolParameterSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // Object-specific constraints
  properties?: Record<string, ToolParameterSchema>;
  patternProperties?: Record<string, ToolParameterSchema>;
  additionalProperties?: boolean | ToolParameterSchema;
  required?: string[];
  minProperties?: number;
  maxProperties?: number;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, ToolParameterSchema>;
  propertyNames?: ToolParameterSchema;

  // Combinators and conditionals
  allOf?: ToolParameterSchema[];
  anyOf?: ToolParameterSchema[];
  oneOf?: ToolParameterSchema[];
  not?: ToolParameterSchema;
  if?: ToolParameterSchema;
  then?: ToolParameterSchema;
  else?: ToolParameterSchema;

  // Read/write hints
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;

  // Local definitions
  $defs?: Record<string, ToolParameterSchema>;
}

/**
 * Tool node parameters for function execution
 */
export interface ToolParams extends BaseParams {
  name: string;
  slug: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
    // Allow root-level JSON Schema combinators/conditionals
    allOf?: ToolParameterSchema[];
    anyOf?: ToolParameterSchema[];
    oneOf?: ToolParameterSchema[];
    not?: ToolParameterSchema;
    if?: ToolParameterSchema;
    then?: ToolParameterSchema;
    else?: ToolParameterSchema;
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
  /**
   * Optional streaming control.
   *
   * - When true/omitted: execute as a streaming request (default behavior).
   * - When false: execute as a non-stream request (useful for providers/models that
   *   only include full payloads like images in the final response).
   *
   * Supports template expressions via string (e.g. '{{ state.stream }}').
   */
  stream?: boolean | string;
  temperature?: number | string; // Supports template expressions
  maxTokens?: number | string; // Supports template expressions
  timeout?: number | string; // Supports template expressions
  topP?: number | string; // Supports template expressions
  frequencyPenalty?: number | string; // Supports template expressions
  presencePenalty?: number | string; // Supports template expressions
  tools?: ToolParams[] | string; // Optional tools for function calling schema, supports template expressions
  // OpenRouter unified reasoning configuration (optional)
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };
  /**
   * Optional OpenRouter multimodal output configuration.
   * Example (image generation): ['image','text']
   *
   * Supports template expressions via string (e.g. '{{ state.modalities }}').
   */
  modalities?: Array<'text' | 'image'> | string;
  /**
   * Optional OpenRouter image configuration (passed as `image_config` to OpenRouter).
   * Example: { aspect_ratio: '16:9' }
   *
   * Supports template expressions via string (e.g. '{{ state.imageConfig }}').
   */
  imageConfig?: Record<string, unknown> | string;
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
 * Generic type that can be extended with additional properties
 */
export type AgentState<T = Record<string, unknown>> = {
  messages?: LlmMessage[]; // Message history
  tools?: ToolParams[]; // Available tools
} & T;

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
  // Optional reasoning configuration forwarded to the underlying LLM node
  reasoning?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    exclude?: boolean;
    enabled?: boolean;
  };

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
export type MutateParams = Omit<BaseParams, 'mutations' | 'transforms'> & {
  reducers: ReducerSpec[];
};
// Pure reducers-only API for Mutate node

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

/**
 * Reducer specification for Mutate node (pure-return only)
 */
export type ReducerSpec =
  | string
  | {
      name?: string;
      if?: string; // template expression guard
      code: string; // (state, ctx) => newState
      timeoutMs?: number;
    };
