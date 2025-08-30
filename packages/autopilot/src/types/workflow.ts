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
  expeditionId: string;
  nodes: Node[];
  edges: Edge[];
  visualization: string;
  approvalStatus: WorkflowApprovalStatus;
  createdAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  metadata?: WorkflowMetadata;
}

/**
 * Individual nodes in the workflow graph
 */
export interface Node {
  id: string;
  type: NodeType;
  name: string;
  description: string;
  estimatedTime?: number;
  parameters: NodeParameters;
  metadata?: Record<string, unknown>;
  position?: NodePosition;
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
 * Node position for visualization
 */
export interface NodePosition {
  x: number;
  y: number;
  layer?: number;
}

/**
 * Workflow metadata for additional information
 */
export interface WorkflowMetadata {
  complexity: WorkflowComplexity;
  estimatedDuration: number;
  createdBy: string;
  version: string;
  tags?: string[];
  description?: string;
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
  agentId?: string;
  estimatedTime?: number;
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

/**
 * Workflow approval status
 */
export type WorkflowApprovalStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'modified';

/**
 * Workflow complexity levels
 */
export type WorkflowComplexity = 
  | 'simple'
  | 'moderate'
  | 'complex'
  | 'advanced';