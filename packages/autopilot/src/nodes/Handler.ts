/**
 * Node Handler Interface and Base Class
 *
 * Base interface and abstract class for workflow node handlers with lazy loading support
 */

import { NodeResult, ExecutionContext, ValidationResult, Node as WorkflowNode } from '../types';

/**
 * Base interface for workflow node handlers
 * Handlers are now instantiated with parameters via constructor
 */
export interface Handler {
  /** The node type this handler manages */
  readonly type: string;
  
  /** Execute with parameters already injected via constructor */
  execute(context: ExecutionContext): Promise<NodeResult>;
  
  /** Validate the handler's configuration */
  validate(): ValidationResult;
  
  /** Get icon for UI representation */
  getIcon(): string;
}

/**
 * Constructor type for handlers that accept the full node object
 */
export type HandlerConstructor = new (node: WorkflowNode) => Handler;

/**
 * Abstract base class for handlers with common functionality
 */
export abstract class BaseHandler implements Handler {
  abstract readonly type: string;

  constructor(protected node: WorkflowNode) {}

  abstract execute(context: ExecutionContext): Promise<NodeResult>;
  abstract validate(): ValidationResult;
  abstract getIcon(): string;

  /**
   * Helper to create successful result
   */
  protected createSuccessResult(data: any, duration?: number): NodeResult {
    return {
      nodeId: this.node.id,
      success: true,
      data,
      executedAt: new Date().toISOString(),
      duration: duration || 0
    };
  }

  /**
   * Helper to create error result
   */
  protected createErrorResult(error: string, duration?: number): NodeResult {
    return {
      nodeId: this.node.id,
      success: false,
      error,
      executedAt: new Date().toISOString(),
      duration: duration || 0
    };
  }

  /**
   * Helper to create validation error
   */
  protected createValidationError(code: string, message: string) {
    return {
      code,
      message,
      nodeId: this.node.id,
      severity: 'error' as const
    };
  }

  /**
   * Helper to create validation warning
   */
  protected createValidationWarning(code: string, message: string) {
    return {
      code,
      message,
      nodeId: this.node.id,
      severity: 'warning' as const
    };
  }
}