/**
 * Conditional Class
 *
 * Evaluates JSONata expressions to determine workflow branching
 */

import jsonata from 'jsonata';
import { NodeHandler } from '@/types/node-handler';
import { ConditionalParams, ValidationResult, ValidationError } from '@/types';

export interface ConditionalResult {
  result: unknown;
  condition: string | boolean;
}

export class Conditional implements NodeHandler {
  private params: ConditionalParams;

  constructor(params: ConditionalParams) {
    this.params = params;
  }

  /**
   * Execute the conditional expression
   */
  async execute(): Promise<ConditionalResult> {
    console.log(`Executing conditional: ${this.params.expression}`);

    try {
      // Create JSONata expression
      const expression = jsonata(this.params.expression);

      // Evaluate expression against current execution state
      // Note: In a real implementation, you'd pass the current workflow state here
      const result = await expression.evaluate({});

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
        message: 'JSONata expression is required',
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
    if (this.params.timeout !== undefined && this.params.timeout < 100) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Timeout should be at least 100ms',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
