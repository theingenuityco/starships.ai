/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 * This file contains ONLY parameter definitions to avoid circular dependencies
 */

import type { AgentMemoryState } from '@/memory/AgentMemory';
import { Blueprint } from './blueprint';

/**
 * User prompt node parameters for user interaction
 */
export interface UserPromptParams {
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
export interface HttpRequestParams extends Omit<RequestInit, 'body'> {
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
export interface LlmParams {
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
export interface WorkflowParams {
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
export interface AgentParams {
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
export interface ConditionalParams {
  expression: string; // JSONata expression to evaluate
  timeout?: number;
}

/**
 * Start and End node parameters
 */
export type StartParams = Record<string, unknown>;
export type EndParams = Record<string, unknown>;

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
  | ConditionalParams;
