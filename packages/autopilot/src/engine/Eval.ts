/**
 * Expression Evaluation Engine
 *
 * Centralized template expression evaluation and JSONata processing system.
 * Handles {{ jsonataExpression }} syntax and provides context-aware evaluation.
 */

import jsonata from 'jsonata';
import type { Execution, ExecutionState, NodeResult, ExecutionStatus, ValidationResult, ValidationError } from '@/types';

/**
 * Evaluation context available to JSONata expressions
 */
export interface EvalContext {
  state: ExecutionState;
  results: NodeResult[];
  status: ExecutionStatus;
  currentNodeRef?: string;

  // Helper functions
  $nodeResult: (nodeRef: string) => NodeResult | undefined;
  $lastResult: () => NodeResult | undefined;
  $now: () => string;
  $random: () => string;
  $count: (array: unknown[]) => number;
}

/**
 * Options for expression evaluation
 */
export interface EvalOptions {
  allowedContextKeys?: string[];
  forbiddenFunctions?: string[];
  timeout?: number;
}

/**
 * Centralized expression evaluation engine
 */
export class Eval {
  private static readonly TEMPLATE_REGEX = /\{\{\s*(.*?)\s*\}\}/g;

  /**
   * Build evaluation context from execution state
   */
  buildContext(execution: Execution): EvalContext {
    return {
      state: execution.state,
      results: execution.results,
      status: execution.status,
      currentNodeRef: execution.currentNodeRef,

      // Helper functions
      $nodeResult: (nodeRef: string) => execution.results.find((r) => r.nodeRef === nodeRef),
      $lastResult: () => execution.results[execution.results.length - 1],
      $now: () => new Date().toISOString(),
      $random: () => Math.random().toString(36).substring(2, 15),
      $count: (array: unknown[]) => (Array.isArray(array) ? array.length : 0),
    };
  }

  /**
   * Evaluate a JSONata expression with context
   */
  async evaluateExpression(expression: string, context: EvalContext, options?: EvalOptions): Promise<unknown> {
    try {
      const jsonataExpr = jsonata(expression.trim());

      // Note: JSONata timeout would need to be implemented differently if needed
      // For now, we rely on JavaScript's natural execution timeout
      if (options?.timeout) {
        // Could implement Promise.race with setTimeout if timeout is critical
        console.warn('JSONata timeout option is not currently supported');
      }

      return await jsonataExpr.evaluate(context);
    } catch (error) {
      throw new Error(`Expression evaluation failed for "${expression}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a value contains template expressions
   */
  hasTemplateExpressions(value: unknown): boolean {
    if (typeof value === 'string') {
      return Eval.TEMPLATE_REGEX.test(value);
    } else if (Array.isArray(value)) {
      return value.some((item) => this.hasTemplateExpressions(item));
    } else if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((val) => this.hasTemplateExpressions(val));
    }
    return false;
  }

  /**
   * Resolve template expressions in any value type
   */
  async resolveTemplates(value: unknown, execution: Execution, options?: EvalOptions): Promise<unknown> {
    const context = this.buildContext(execution);
    return await this.processValue(value, context, options);
  }

  /**
   * Validate template expressions in a value
   */
  validateTemplateExpressions(value: unknown, options?: EvalOptions): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateValue(value, errors, options);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate a JSONata expression syntax
   */
  validateExpression(expression: string, options?: EvalOptions): ValidationResult {
    const errors: ValidationError[] = [];

    try {
      // Test JSONata syntax
      jsonata(expression.trim());

      // Additional validation checks
      if (options?.forbiddenFunctions) {
        for (const forbiddenFunc of options.forbiddenFunctions) {
          if (expression.includes(forbiddenFunc)) {
            errors.push({
              code: 'FORBIDDEN_FUNCTION',
              message: `Forbidden function "${forbiddenFunc}" used in expression`,
            });
          }
        }
      }

      if (options?.allowedContextKeys) {
        // Basic check for context key usage
        const usesDisallowedKey = options.allowedContextKeys.every((key) => !expression.includes(key));
        if (usesDisallowedKey) {
          errors.push({
            code: 'INVALID_CONTEXT_ACCESS',
            message: 'Expression uses disallowed context keys',
          });
        }
      }
    } catch (error) {
      errors.push({
        code: 'INVALID_JSONATA_EXPRESSION',
        message: `Invalid JSONata expression: ${error instanceof Error ? error.message : 'Syntax error'}`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process any value type for template resolution
   */
  private async processValue(value: unknown, context: EvalContext, options?: EvalOptions): Promise<unknown> {
    if (typeof value === 'string') {
      return await this.resolveStringTemplates(value, context, options);
    } else if (Array.isArray(value)) {
      return await Promise.all(value.map((item) => this.processValue(item, context, options)));
    } else if (value && typeof value === 'object') {
      return await this.resolveObjectTemplates(value as Record<string, unknown>, context, options);
    }
    return value;
  }

  /**
   * Resolve template expressions in a string
   */
  private async resolveStringTemplates(str: string, context: EvalContext, options?: EvalOptions): Promise<unknown> {
    const matches = Array.from(str.matchAll(Eval.TEMPLATE_REGEX));

    if (matches.length === 0) return str;

    // Handle full-string replacement vs partial replacement
    if (matches.length === 1 && matches[0][0] === str) {
      // Full string is a template - return the actual resolved type
      return await this.evaluateExpression(matches[0][1], context, options);
    } else {
      // Partial replacement - substitute within string
      let result = str;
      for (const match of matches) {
        const resolved = await this.evaluateExpression(match[1], context, options);
        result = result.replace(match[0], String(resolved));
      }
      return result;
    }
  }

  /**
   * Resolve template expressions in an object
   */
  private async resolveObjectTemplates(
    obj: Record<string, unknown>,
    context: EvalContext,
    options?: EvalOptions
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await this.processValue(value, context, options);
    }
    return result;
  }

  /**
   * Recursively validate template expressions in a value
   */
  private validateValue(value: unknown, errors: ValidationError[], options?: EvalOptions, path = ''): void {
    if (typeof value === 'string') {
      this.validateStringTemplates(value, errors, options, path);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => this.validateValue(item, errors, options, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        this.validateValue(val, errors, options, path ? `${path}.${key}` : key);
      }
    }
  }

  /**
   * Validate template expressions in a string
   */
  private validateStringTemplates(str: string, errors: ValidationError[], options?: EvalOptions, path = ''): void {
    const matches = Array.from(str.matchAll(Eval.TEMPLATE_REGEX));

    for (const match of matches) {
      const expression = match[1];
      const validation = this.validateExpression(expression, options);

      if (!validation.valid) {
        const expressionErrors =
          validation.errors?.map((e) => ({
            ...e,
            message: `${path ? `${path}: ` : ''}${e.message}`,
          })) || [];
        errors.push(...expressionErrors);
      }
    }
  }

  /**
   * Create a new Eval instance
   */
  static create(): Eval {
    return new Eval();
  }
}
