/**
 * Expression Evaluation Engine
 *
 * Centralized template expression evaluation and JSONata processing system.
 * Handles {{ jsonataExpression }} syntax and provides context-aware evaluation.
 */

import jsonata from 'jsonata';
import type { Execution, ExecutionState, ExecutionStatus, ValidationResult, ValidationError, ExecutionItem } from '@/types';

/**
 * Evaluation context available to JSONata expressions
 */
export interface EvalContext {
  state: ExecutionState;
  outputs: Array<{ nodeRef: string; items: ExecutionItem[] }>; // Updated to array format
  status: ExecutionStatus;
  currentNodeRef?: string;
  input?: unknown;

  // Only custom helper functions that aren't built into JSONata
  $lastOutputOf: (nodeRef: string) => unknown;
  $input: (path?: string) => unknown;
  $random: () => number; // Custom random function since JSONata's might not be available in all versions
  $exists: (value: unknown) => boolean; // Re-add since it's used in tests and might not be available in all JSONata versions
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
  buildContext(execution: Execution, inputData?: unknown): EvalContext {
    const context = {
      state: execution.state,
      outputs: execution.results, // Use array format directly
      status: execution.status,
      currentNodeRef: execution.currentNodeRef,
      input: inputData,

      // Only custom helper functions
      $lastOutputOf: (nodeRef: string) => this.findLatestNodeResult(execution, nodeRef),
      $input: (path?: string) => this.extractPath(inputData, path),
      $random: () => Math.random(), // Simple custom random function
      $exists: (value: unknown) => value !== null && value !== undefined,
    };

    return context;
  }

  private findLatestNodeResult(execution: Execution, nodeRef: string): unknown {
    // Find latest result for the specified node (reverse search for efficiency)
    for (let i = execution.results.length - 1; i >= 0; i--) {
      if (execution.results[i].nodeRef === nodeRef) {
        return execution.results[i].items;
      }
    }
    return undefined;
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
   * Evaluate a JSONata expression with context
   */
  async evaluateExpression(expression: string, context: EvalContext, options?: EvalOptions): Promise<unknown> {
    try {
      const jsonataExpr = jsonata(expression.trim());

      // Register custom functions with JSONata (use $-prefixed only)
      jsonataExpr.registerFunction('$lastOutputOf', context.$lastOutputOf);
      jsonataExpr.registerFunction('$input', context.$input);
      jsonataExpr.registerFunction('$random', context.$random);
      jsonataExpr.registerFunction('$exists', context.$exists);

      // Note: JSONata timeout would need to be implemented differently if needed
      // For now, we rely on JavaScript's natural execution timeout
      if (options?.timeout) {
        // Could implement Promise.race with setTimeout if timeout is critical
        console.warn('JSONata timeout option is not currently supported');
      }

      return await jsonataExpr.evaluate(context);
    } catch (error) {
      // Dead simple - just log everything raw
      console.error('Expression evaluation failed:', expression, error);
      throw new Error(`Expression evaluation failed for "${expression}": ${error instanceof Error ? error.message : String(error)}`);
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
  async resolveTemplates(value: unknown, execution: Execution, inputData?: unknown, options?: EvalOptions): Promise<unknown> {
    const context = this.buildContext(execution, inputData);
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
      const jsonataExpr = jsonata(expression.trim());

      // Register custom functions for validation (with dummy implementations, $-prefixed only)
      jsonataExpr.registerFunction('$lastOutputOf', () => null);
      jsonataExpr.registerFunction('$input', () => null);
      jsonataExpr.registerFunction('$random', () => 0);
      jsonataExpr.registerFunction('$exists', () => false);

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
      // Dead simple - just log everything raw
      console.error('JSONata validation failed:', expression, error);
      errors.push({
        code: 'INVALID_JSONATA_EXPRESSION',
        message: `Invalid JSONata expression: ${error instanceof Error ? error.message : String(error)}`,
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
