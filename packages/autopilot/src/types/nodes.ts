/**
 * Node Parameter Types
 * 
 * Specific parameter types for different workflow node types
 */

/**
 * Agent-specific node parameters
 */
export interface AgentNodeParameters {
  agentId: string;
  taskIds?: string[];
  instructions?: string;
  expectedOutput?: string;
  timeout?: number;
  estimatedTime?: number;
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