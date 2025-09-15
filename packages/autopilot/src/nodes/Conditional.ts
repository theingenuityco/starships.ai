/**
 * Conditional Class
 *
 * Evaluates JSONata expressions to determine workflow branching
 */

import { NodeHandler } from '@/types/node-handler';
import { ConditionalParams, ValidationResult, ValidationError, NodeHandlerOptions } from '@/types';
import { Eval } from '@/engine/Eval';

export interface ConditionalResult {
  result: unknown;
  condition: string | boolean | number | null | undefined;
}

export class Conditional implements NodeHandler {
  private params: ConditionalParams;
  private options?: NodeHandlerOptions;
  private eval = new Eval();

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
      // Ensure we have execution context
      if (!this.options?.execution) {
        throw new Error('Execution context is required for conditional evaluation');
      }

      // Evaluate expression using centralized Eval class
      const result = await this.eval.evaluateExpression(this.params.expression, this.eval.buildContext(this.options.execution));

      // Convert result to boolean or string condition
      let condition: string | boolean | number | null | undefined;
      if (typeof result === 'boolean') {
        condition = result;
      } else if (typeof result === 'string') {
        condition = result;
      } else if (typeof result === 'number') {
        condition = result;
      } else if (result === undefined || result === null) {
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
      const validation = this.eval.validateExpression(this.params.expression);
      if (!validation.valid) {
        errors.push(...(validation.errors || []));
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
