/**
 * Conditional Class
 *
 * Evaluates JSONata expressions to determine workflow branching.
 * Works as both standalone node and embedded parameter in other nodes.
 */

import { NodeHandler } from '@/types/node-handler';
import { ConditionalParams, ValidationResult, ValidationError, NodeHandlerOptions, ExecutionItem } from '@/types';
import { Eval } from '@/engine/Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { nanoid } from 'nanoid';

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
   * Execute the conditional expression with optional input items
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    if (!this.params.condition) {
      throw new Error('Conditional node requires a condition expression');
    }

    try {
      // Create minimal evaluation context from input data
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      const context = this.createMinimalContext(inputData);
      const result = await this.eval.evaluateExpression(this.params.condition, context);

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

      const conditionalResult = {
        result,
        condition,
      };

      return ExecutionItemUtils.wrapSingle(conditionalResult, input?.[0]);
    } catch (error) {
      throw new Error(`Conditional evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create minimal evaluation context from input data
   */
  private createMinimalContext(inputData?: unknown) {
    return {
      state: {},
      outputs: {},
      status: 'running' as const,
      currentNodeRef: undefined,
      input: inputData,

      // Helper functions
      $output: () => undefined,
      $input: (path?: string) => this.extractPath(inputData, path),
      $now: () => new Date().toISOString(),
      $random: () => nanoid(),
      $count: (array: unknown[]) => (Array.isArray(array) ? array.length : 0),
    };
  }

  /**
   * Extract data from a path using dot notation
   */
  private extractPath(data: unknown, path?: string): unknown {
    if (!path) return data;
    if (!data || typeof data !== 'object') return undefined;

    const keys = path.split('.');
    let result: unknown = data;

    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = (result as Record<string, unknown>)[key];
      } else {
        return undefined;
      }
    }

    return result;
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
