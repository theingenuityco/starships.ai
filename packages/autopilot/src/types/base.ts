/**
 * Base Types
 *
 * Core shared types and base interfaces used across the autopilot package
 */

/**
 * Base interface for all workflow node parameters
 */
// export interface BaseNodeParameters {
//   [key: string]: unknown;
// }

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
  | 'llm'
  | 'workflow'
  | 'transform'
  | 'mutate';

/**
 * Base node interface (untyped parameters)
 */
export interface BaseNode {
  ref: string;
  type: NodeType;
  name: string;
  description: string;
  parameters: Record<string, unknown>; // Generic for internal use
  metadata?: Record<string, unknown>;
}

/**
 * Edges connecting workflow nodes
 */
export interface Edge {
  ref: string;
  from: string;
  to: string;
  condition?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Base Blueprint interface (untyped nodes)
 */
export interface BaseBlueprint {
  nodes: BaseNode[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}
