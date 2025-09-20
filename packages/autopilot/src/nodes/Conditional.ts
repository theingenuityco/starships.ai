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

export interface ConditionalResult {
  result: unknown;
  edgeCondition?: string;
}

interface RegexMatchResult {
  match: string;
  start: number;
  end: number;
  groups: string[];
  next: () => RegexMatchResult | undefined;
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
    // Check if condition parameter exists
    if (!('condition' in this.params)) {
      throw new Error('Conditional node requires a condition expression');
    }

    // Handle case where template resolved to undefined/null (template couldn't resolve)
    if (this.params.condition === undefined || this.params.condition === null) {
      const conditionalResult = {
        result: this.params.condition,
      };
      return ExecutionItemUtils.wrapSingle(conditionalResult, input?.[0]);
    }

    // Handle empty string
    if (typeof this.params.condition === 'string' && this.params.condition.trim() === '') {
      throw new Error('Conditional node requires a condition expression');
    }

    try {
      let result: unknown;
      let edgeCondition: string | undefined;

      // Handle case where condition is already resolved by Engine template processing
      if (typeof this.params.condition !== 'string') {
        // Condition was already evaluated - use the resolved value
        result = this.params.condition;
        if (result === null || result === undefined) {
          // Don't set edgeCondition when result is null/undefined
        } else if (typeof result === 'boolean') {
          edgeCondition = result.toString();
        } else if (typeof result === 'object' && result !== null) {
          // Handle regex match objects from JSONata ~> operator
          if (this.isRegexMatchResult(result)) {
            edgeCondition = result.match;
            result = result.match; // Also update the result value
          } else {
            edgeCondition = String(result);
          }
        } else {
          edgeCondition = String(result);
        }
      } else {
        // Check if condition contains JSONata template expressions via Eval
        const hasTemplateExpression = this.eval.hasTemplateExpressions(this.params.condition);

        if (hasTemplateExpression) {
          // Ensure we have execution context for JSONata evaluation
          if (!this.options?.execution) {
            throw new Error('Execution context is required for conditional evaluation');
          }

          // Evaluate JSONata expression using centralized Eval class with input data
          const inputData = ExecutionItemUtils.unwrapSingle(input);
          result = await this.eval.resolveTemplates(this.params.condition, this.options.execution, inputData);

          // Convert result to string condition - handle special cases
          if (result === null || result === undefined) {
            // Don't set edgeCondition when result is null/undefined
          } else if (typeof result === 'boolean') {
            edgeCondition = result.toString();
          } else if (typeof result === 'object' && result !== null) {
            // Handle regex match objects from JSONata ~> operator
            if (this.isRegexMatchResult(result)) {
              edgeCondition = result.match;
              result = result.match; // Also update the result value
            } else {
              edgeCondition = String(result);
            }
          } else {
            edgeCondition = String(result);
          }
        } else {
          // Static string - return as is
          result = this.params.condition;
          edgeCondition = this.params.condition;
        }
      }

      const conditionalResult: ConditionalResult = {
        result,
        ...(edgeCondition !== undefined && { edgeCondition }),
      };

      return ExecutionItemUtils.wrapSingle(conditionalResult, input?.[0]);
    } catch (error) {
      throw new Error(`Conditional evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate conditional configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if condition parameter exists at all (even if undefined after template resolution)
    if (!('condition' in this.params)) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Condition expression is required',
      });
    } else {
      // If condition is a string, validate template expressions
      if (typeof this.params.condition === 'string') {
        // Empty string is invalid
        if (this.params.condition.trim() === '') {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: 'Condition expression is required',
          });
        } else {
          // Check for template expressions and validate them
          const hasTemplateExpression = this.eval.hasTemplateExpressions(this.params.condition);
          if (hasTemplateExpression) {
            const validation = this.eval.validateTemplateExpressions(this.params.condition);
            if (!validation.valid) {
              errors.push(...(validation.errors || []));
            }
          }
          // Static strings don't need additional validation
        }
      }
      // Non-string values (including null, undefined from template resolution) are valid
      // They will be handled during execution
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : [],
    };
  }

  /**
   * Type guard to check if result is a regex match object
   */
  private isRegexMatchResult(result: unknown): result is RegexMatchResult {
    return typeof result === 'object' && result !== null && 'match' in result && typeof (result as RegexMatchResult).match === 'string';
  }
}
