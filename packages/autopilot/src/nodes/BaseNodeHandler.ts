import { NodeHandler, NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItem, ValidationResult } from '@/types';
import { BaseNode } from '@/types/base';
import { StageContext } from '@/engine/StageContext';

/**
 * Base abstract class for all node handlers
 * Simplified for parallel execution with stage context
 */
export abstract class BaseNodeHandler implements NodeHandler {
  protected node: BaseNode;
  protected options: NodeHandlerOptions;
  protected context?: StageContext;

  constructor(node: BaseNode, options: NodeHandlerOptions = {}) {
    this.node = node;
    this.options = options;
  }

  /**
   * Set the stage context for parallel execution
   */
  setContext(context: StageContext): void {
    this.context = context;
  }

  /**
   * Get resolved parameters with template resolution
   */
  protected getResolvedParameters(): Record<string, unknown> {
    if (!this.context) {
      return this.node.parameters;
    }
    return this.context.resolveNodeParameters(this.node.parameters);
  }

  /**
   * Abstract execute method to be implemented by subclasses
   */
  abstract execute(input?: ExecutionItem[]): Promise<ExecutionItem[]>;

  /**
   * Default validation - can be overridden by subclasses
   */
  validate(): ValidationResult {
    return {
      valid: true,
      errors: []
    };
  }

  /**
   * Helper to get state value
   */
  protected getStateValue(path: string): any {
    if (!this.context) {
      return undefined;
    }
    return this.context.getStateValue(path);
  }

  /**
   * Helper to get output from another node
   */
  protected getNodeOutput(nodeRef: string): ExecutionItem[] | undefined {
    if (!this.context) {
      return undefined;
    }
    return this.context.getNodeOutput(nodeRef);
  }

  /**
   * Helper to get previous stage results
   */
  protected getPreviousStageResults(): ExecutionItem[] {
    if (!this.context) {
      return [];
    }
    return this.context.getPreviousStageResults();
  }

  /**
   * Emit event through event callback if available
   */
  protected emitEvent(eventType: string, data?: any): void {
    if (this.options.eventCallback) {
      // Create a generic execution event
      const event: any = {
        type: eventType,
        data: {
          ...data,
          nodeRef: this.node.ref
        },
        timestamp: new Date().toISOString(),
        executionDepth: this.options.execution?.depth || 0
      };
      this.options.eventCallback(event);
    }
  }

  /**
   * Create execution item from data
   */
  protected createExecutionItem(data: any): ExecutionItem {
    return {
      json: data,
      pairedItem: undefined
    };
  }

  /**
   * Create multiple execution items
   */
  protected createExecutionItems(dataArray: any[]): ExecutionItem[] {
    return dataArray.map(data => this.createExecutionItem(data));
  }

  /**
   * Get the node reference
   */
  getNodeRef(): string {
    return this.node.ref;
  }

  /**
   * Get the node type
   */
  getNodeType(): string {
    return this.node.type;
  }
}