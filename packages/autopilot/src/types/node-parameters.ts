/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 * This file contains ONLY parameter definitions to avoid circular dependencies
 */

import type { BaseNodeParameters, BaseBlueprint } from '@/types/base';
import type { AgentMemoryState } from '@/AgentMemory';

/**
 * Agent-specific node parameters
 * Contains full agent configuration for workflow execution
 */
export interface AgentNodeParameters extends BaseNodeParameters {
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
  memory: AgentMemoryState;

  // Blueprint execution
  blueprint: BaseBlueprint;
}

/**
 * Conditional node parameters for data-driven routing
 */
export interface ConditionalNodeParameters extends BaseNodeParameters {
  sourceNodeId: string;
  expression: string;
  conditions: Record<string, string>;
  defaultCondition?: string;
}

/**
 * User prompt node parameters for user interaction
 */
export interface UserPromptNodeParameters extends BaseNodeParameters {
  promptText: string;
  choices: UserPromptChoice[];
  sourceNodeId?: string;
  timeout?: number;
  required?: boolean;
}

/**
 * Output node parameters for final result generation
 */
export interface OutputNodeParameters extends BaseNodeParameters {
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
 */
export interface HttpRequestNodeParameters extends BaseNodeParameters {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: string | object;
  timeout?: number;
  retries?: number;
  followRedirects?: boolean;
  authentication?: HttpAuthentication;
}

/**
 * HTTP methods supported by the HTTP request node
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * HTTP authentication configuration
 */
export interface HttpAuthentication {
  type: 'bearer' | 'basic' | 'api-key';
  token?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  headerName?: string; // for api-key type
}

/**
 * LLM node parameters for AI model interactions via OpenRouter
 */
export interface LlmNodeParameters extends BaseNodeParameters {
  model: string;
  prompt: string;
  openrouterApiKey: string;
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
export interface WorkflowNodeParameters extends BaseNodeParameters {
  blueprint: BaseBlueprint;
  timeout?: number;
}

/**
 * Start and End node parameters (empty but extends base)
 */
export type StartEndNodeParameters = BaseNodeParameters;

/**
 * Union type for all workflow node parameters
 */
export type NodeParameters =
  | AgentNodeParameters
  | ConditionalNodeParameters
  | UserPromptNodeParameters
  | OutputNodeParameters
  | HttpRequestNodeParameters
  | LlmNodeParameters
  | WorkflowNodeParameters
  | StartEndNodeParameters;
