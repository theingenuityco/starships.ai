/**
 * Node Handler Interface
 * 
 * Base interface for workflow node handlers
 */

import { Node, NodeResult, ExecutionContext, ValidationResult } from '../types';

/**
 * Base interface for workflow node handlers
 */
export interface Handler {
  /** The node type this handler manages */
  readonly type: string;
  
  /** Execute the node with the given context */
  execute(
    node: Node, 
    context: ExecutionContext
  ): Promise<NodeResult>;
  
  /** Validate the node configuration */
  validate(node: Node): ValidationResult;
  
  /** Get icon for UI representation */
  getIcon(): string;
}