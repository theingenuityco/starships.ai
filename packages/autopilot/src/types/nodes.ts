/**
 * Node Parameter Types
 *
 * Specific parameter types for different workflow node types
 */

// Import Workflow type for agent workflow execution
import type { Workflow } from './workflow';

/**
 * Agent-specific node parameters
 * Contains full agent configuration for workflow execution
 */
export interface AgentNodeParameters {
  // Core agent identity
  name: string;
  description?: string;
  
  // LLM configuration
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  
  // Execution parameters
  instructions?: string;
  timeout?: number;
  
  // Workflow execution
  workflow: Workflow;
  workflowContext?: Record<string, unknown>;
}

/**
 * Conditional node parameters for data-driven routing
 */
export interface ConditionalNodeParameters {
  sourceNodeId: string;
  expression: string;
  conditions: Record<string, string>;
  defaultCondition?: string;
}

/**
 * User prompt node parameters for user interaction
 */
export interface UserPromptNodeParameters {
  promptText: string;
  choices: UserPromptChoice[];
  sourceNodeId?: string;
  timeout?: number;
  required?: boolean;
}

/**
 * Output node parameters for final result generation
 */
export interface OutputNodeParameters {
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
export type OutputFormat =
  | 'text'
  | 'markdown'
  | 'json'
  | 'html'
  | 'xml'
  | 'pdf'
  | 'csv';

/**
 * HTTP request node parameters for making HTTP calls
 */
export interface HttpRequestNodeParameters {
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
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS';

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
export interface LlmNodeParameters {
  model: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  systemMessage?: string;
  timeout?: number;
  stream?: boolean;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}
