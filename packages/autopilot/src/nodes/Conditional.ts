/**
 * Conditional Class
 *
 * Evaluates JSONata expressions to determine workflow branching.
 * Works as both standalone node and embedded parameter in other nodes.
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
    if (!this.params.condition) {
      throw new Error('Conditional node requires a condition expression');
    }

    console.log(`Executing conditional: ${this.params.condition}`);

    try {
      // Ensure we have execution context
      if (!this.options?.execution) {
        throw new Error('Execution context is required for conditional evaluation');
      }

      // Evaluate expression using centralized Eval class
      const result = await this.eval.evaluateExpression(this.params.condition, this.eval.buildContext(this.options.execution));

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
    if (!this.params.condition || this.params.condition.trim() === '') {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Condition expression is required',
      });
    }

    // Validate JSONata expression syntax
    if (this.params.condition) {
      const validation = this.eval.validateExpression(this.params.condition);
      if (!validation.valid) {
        errors.push(...(validation.errors || []));
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : [],
    };
  }
}
