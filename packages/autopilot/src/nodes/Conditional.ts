/**
 * Conditional Class
 *
 * Evaluates JSONata expressions to determine workflow branching
 */

import jsonata from 'jsonata';
import { NodeHandler } from '@/types/node-handler';
import { ConditionalParams, ValidationResult, ValidationError, NodeHandlerOptions } from '@/types';

export interface ConditionalResult {
  result: unknown;
  condition: string | boolean;
}

export class Conditional implements NodeHandler {
  private params: ConditionalParams;
  private options?: NodeHandlerOptions;

  constructor(params: ConditionalParams, options?: NodeHandlerOptions) {
    this.params = params;
    this.options = options;
  }

  /**
   * Execute the conditional expression
   */
  async execute(): Promise<ConditionalResult> {
    console.log(`Executing conditional: ${this.params.expression}`);

    try {
      // Create JSONata expression
      const expression = jsonata(this.params.expression);

      // Get execution state for JSONata evaluation
      const executionContext = {
        // Include current execution state
        state: this.options?.execution?.state || {},
        // Include previous node results for reference
        results: this.options?.execution?.results || [],
        // Include execution status and metadata
        status: this.options?.execution?.status || 'not_started',
        currentNodeRef: this.options?.execution?.currentNodeRef,
      };

      // Evaluate expression against current execution context
      const result = await expression.evaluate(executionContext);

      // Convert result to boolean or string condition
      let condition: string | boolean;
      if (typeof result === 'boolean') {
        condition = result;
      } else if (typeof result === 'string') {
        condition = result;
      } else {
        condition = Boolean(result);
      }

      return {
        result,
        condition,
      };
    } catch (error) {
      throw new Error(`Conditional evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate conditional configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Required fields
    if (!this.params.expression || this.params.expression.trim() === '') {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Expression is required',
      });
    }

    // Validate JSONata expression syntax
    if (this.params.expression) {
      try {
        jsonata(this.params.expression);
      } catch (error) {
        errors.push({
          code: 'INVALID_JSONATA_EXPRESSION',
          message: `Invalid JSONata expression: ${error instanceof Error ? error.message : 'Syntax error'}`,
        });
      }
    }

    // Timeout validation
    if (this.params.timeout !== undefined && this.params.timeout <= 0) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Timeout must be greater than 0',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : [],
    };
  }
}
