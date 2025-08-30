/**
 * Core Workflow DSL Types
 * 
 * Extracted and transformed from @starships/protocol workflow domain
 */

// Import node parameter types
import type {
  AgentNodeParameters,
  ConditionalNodeParameters,
  UserPromptNodeParameters,
  OutputNodeParameters,
  HttpRequestNodeParameters,
  LlmNodeParameters
} from './nodes';

/**
 * Main workflow DSL entity representing a complete workflow graph
 */
export interface Workflow {
  id: string;
  nodes: Node[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}

/**
 * Individual nodes in the workflow graph
 */
export interface Node {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  parameters: NodeParameters;
  metadata?: Record<string, unknown>;
}

/**
 * Edges connecting workflow nodes
 */
export interface Edge {
  id: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Types of workflow nodes
 */
export type NodeType =
  | 'agent'
  | 'conditional'
  | 'user_prompt'
  | 'output'
  | 'start'
  | 'end'
  | 'http_request'
  | 'llm';

/**
 * Base interface for all workflow node parameters
 */
interface BaseNodeParameters {
  [key: string]: unknown;
}

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
  | StartEndNodeParameters;

export type StartEndNodeParameters = BaseNodeParameters;
