/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 * This file contains ONLY parameter definitions to avoid circular dependencies
 */

import type { AgentMemoryState } from '@/memory/AgentMemory';
import { Blueprint } from './blueprint';

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
 * LLM node parameters for AI model interactions via OpenRouter
 * Note: API key is now managed by the Autopilot singleton
 */
export interface LlmParams extends BaseParams {
  model: string;
  messages: { role: string; content: string }[];
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
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

  // Memory system (required)
  memoryState: AgentMemoryState;

  // Blueprint execution
  blueprint: Blueprint;

  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Conditional node parameters for branching logic
 */
export interface ConditionalParams extends BaseParams {
  expression: string; // JSONata expression to evaluate
  timeout?: number;
}

/**
 * Start and End node parameters
 */
export interface StartParams extends BaseParams {
  [key: string]: unknown;
}

export interface EndParams extends BaseParams {
  [key: string]: unknown;
}

/**
 * Transform node parameters
 */
export type TransformParams = BaseParams;
// Inherits transforms?: TransformOperation[] from BaseParams
// No additional parameters needed

/**
 * Union type for all workflow node parameters
 */
export type NodeParameters =
  | AgentParams
  | UserPromptParams
  | HttpRequestParams
  | LlmParams
  | WorkflowParams
  | StartParams
  | EndParams
  | ConditionalParams
  | TransformParams;
