/**
 * BaseNode Abstract Class
 *
 * Base implementation for all workflow nodes providing common functionality.
 * Implements the core (input): output pattern with params and execution options.
 * All nodes should extend this base class for consistency.
 */

import { NodeHandler, NodeHandlerOptions } from '@/types/node-handler';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import { NodeParameters } from '@/types/node-parameters';
import { EventCallback } from '@/types/events';

/**
 * Abstract base class for all workflow nodes
 * Provides common functionality: parameter storage, validation patterns, and execution structure
 */
export abstract class BaseNode<TParams extends NodeParameters = NodeParameters> implements NodeHandler {
  protected params: TParams;
  protected options?: NodeHandlerOptions;

  constructor(params: TParams, options?: NodeHandlerOptions) {
    // Store parameters and options for use in derived classes
    this.params = structuredClone(params);
    this.options = options;
  }

  /**
   * Abstract execute method - the core (input): output function
   * Each node must implement its specific execution logic
   * @param input - Optional input execution items
   * @returns Promise<ExecutionItem[]> - Output execution items
   */
  abstract execute(input?: ExecutionItem[]): Promise<ExecutionItem[]>;

  /**
   * Abstract validate method - each node must implement its validation logic
   * @returns ValidationResult - Validation result with errors if any
   */
  abstract validate(): ValidationResult;

  /**
   * Get the node's parameters (read-only access)
   */
  protected getParams(): Readonly<TParams> {
    return this.params;
  }

  /**
   * Get the node's execution options (read-only access)
   */
  protected getOptions(): Readonly<NodeHandlerOptions> | undefined {
    return this.options;
  }

  /**
   * Get the event callback for use in derived classes
   * Nodes should construct events directly as needed
   */
  protected getEventCallback(): EventCallback | undefined {
    return this.options?.eventCallback;
  }

  /**
   * Common validation helper for required fields
   */
  protected validateRequiredField(value: unknown, fieldName: string, fieldPath = ''): ValidationError | null {
    if (value === undefined || value === null || value === '') {
      return {
        code: 'MISSING_REQUIRED_FIELD',
        message: `${fieldName} is required${fieldPath ? ` at ${fieldPath}` : ''}`,
      };
    }
    return null;
  }

  /**
   * Common validation helper for parameter ranges
   */
  protected validateParameterRange(value: unknown, fieldName: string, min: number, max: number, fieldPath = ''): ValidationError | null {
    if (typeof value === 'number' && (value < min || value > max)) {
      return {
        code: 'INVALID_PARAMETERS',
        message: `${fieldName} must be between ${min} and ${max}${fieldPath ? ` at ${fieldPath}` : ''}`,
      };
    }
    return null;
  }

  /**
   * Common validation helper for minimum values
   */
  protected validateMinimumValue(value: unknown, fieldName: string, minimum: number, fieldPath = ''): ValidationError | null {
    if (typeof value === 'number' && value < minimum) {
      return {
        code: 'INVALID_PARAMETERS',
        message: `${fieldName} must be at least ${minimum}${fieldPath ? ` at ${fieldPath}` : ''}`,
      };
    }
    return null;
  }

  /**
   * Helper to handle execution errors consistently
   * Throws with consistent formatting
   */
  protected handleExecutionError(error: unknown, context = ''): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const fullMessage = context ? `${context}: ${errorMessage}` : errorMessage;
    throw new Error(fullMessage);
  }

  /**
   * Helper to validate an array parameter
   */
  protected validateArrayParameter(value: unknown, fieldName: string, minLength = 0, fieldPath = ''): ValidationError | null {
    if (!Array.isArray(value)) {
      return {
        code: 'INVALID_PARAMETERS',
        message: `${fieldName} must be an array${fieldPath ? ` at ${fieldPath}` : ''}`,
      };
    }
    if (value.length < minLength) {
      return {
        code: 'INVALID_PARAMETERS',
        message: `${fieldName} must contain at least ${minLength} item(s)${fieldPath ? ` at ${fieldPath}` : ''}`,
      };
    }
    return null;
  }

  /**
   * Get the node type from the constructor name
   * Useful for logging and debugging
   */
  protected getNodeType(): string {
    return this.constructor.name.toLowerCase();
  }
}
