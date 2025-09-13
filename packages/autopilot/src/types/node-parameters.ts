/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 * This file contains ONLY parameter definitions to avoid circular dependencies
 */

import type { AgentMemoryState } from '@/AgentMemory';
import { Blueprint } from './blueprint';

/**
 * Conditional node parameters for data-driven routing
 */
export interface ConditionalParams {
  sourceNodeId: string;
  expression: string;
  conditions: Record<string, string>;
  defaultCondition?: string;
}

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
 * Output node parameters for final result generation
 */
export interface OutputParams {
  template: string;
  sources: string[];
  format: OutputFormat;
  title?: string;
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
 * Output formats for workflow results
 */
export type OutputFormat = 'text' | 'markdown' | 'json' | 'html' | 'xml' | 'pdf' | 'csv';

/**
 * HTTP request node parameters for making HTTP calls
 * Fully compatible with fetch RequestInit structure
 */
export interface HttpRequestParams extends RequestInit {
  // Required URL (not part of RequestInit as it's the first parameter to fetch)
  url: string;

  // Custom properties for convenience
  timeout?: number;
}

/**
 * LLM node parameters for AI model interactions via OpenRouter
 * Note: API key is now managed by the Autopilot singleton
 */
export interface LlmParams {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
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
 * Start and End node parameters
 */
export type StartEndNodeParameters = Record<string, unknown>;

/**
 * Union type for all workflow node parameters
 */
export type NodeParameters =
  | AgentParams
  | ConditionalParams
  | UserPromptParams
  | OutputParams
  | HttpRequestParams
  | LlmParams
  | WorkflowParams
  | StartEndNodeParameters;
