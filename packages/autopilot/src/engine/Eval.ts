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

  // Helper functions
  $lastOutputOf: (nodeRef: string) => unknown;
  $input: (path?: string) => unknown;
  $now: () => string;
  $filter: (array: unknown[], predicate: (item: unknown, index?: number) => boolean) => unknown[];
  $map: (array: unknown[], mapper: (item: unknown, index?: number) => unknown) => unknown[];
  $reduce: (array: unknown[], reducer: (acc: unknown, item: unknown, index?: number) => unknown, initialValue?: unknown) => unknown;
  $merge: (...objects: Record<string, unknown>[]) => Record<string, unknown>;
  $clone: (value: unknown) => unknown;
  $find: (array: unknown[], predicate: (item: unknown, index?: number) => boolean) => unknown;
  $count: (array: unknown[]) => number;
  $trim: (str: string) => string;
  $join: (array: unknown[], separator?: string) => string;
  $omit: (obj: Record<string, unknown>, keys: string[]) => Record<string, unknown>;
  $pick: (obj: Record<string, unknown>, keys: string[]) => Record<string, unknown>;
  $has: (obj: Record<string, unknown>, key: string) => boolean;
  $exists: (value: unknown) => boolean;
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
    return {
      state: execution.state,
      outputs: execution.results, // Use array format directly
      status: execution.status,
      currentNodeRef: execution.currentNodeRef,
      input: inputData,

      // Helper functions
      $lastOutputOf: (nodeRef: string) => this.findLatestNodeResult(execution, nodeRef),
      $input: (path?: string) => this.extractPath(inputData, path),
      $now: () => new Date().toISOString(),
      $filter: (array: unknown[], predicate: (item: unknown, index?: number) => boolean) => this.filterArray(array, predicate),
      $map: (array: unknown[], mapper: (item: unknown, index?: number) => unknown) => this.mapArray(array, mapper),
      $reduce: (array: unknown[], reducer: (acc: unknown, item: unknown, index?: number) => unknown, initialValue?: unknown) =>
        this.reduceArray(array, reducer, initialValue),
      $merge: (...objects: Record<string, unknown>[]) => this.mergeObjects(...objects),
      $clone: (value: unknown) => this.cloneValue(value),
      $find: (array: unknown[], predicate: (item: unknown, index?: number) => boolean) => this.findInArray(array, predicate),
      $count: (array: unknown[]) => this.countArray(array),
      $trim: (str: string) => this.trimString(str),
      $join: (array: unknown[], separator?: string) => this.joinArray(array, separator),
      $omit: (obj: Record<string, unknown>, keys: string[]) => this.omitKeys(obj, keys),
      $pick: (obj: Record<string, unknown>, keys: string[]) => this.pickKeys(obj, keys),
      $has: (obj: Record<string, unknown>, key: string) => this.hasKey(obj, key),
      $exists: (value: unknown) => this.valueExists(value),
    };
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
   * Filter array helper function
   */
  private filterArray(array: unknown[], predicate: (item: unknown, index?: number) => boolean): unknown[] {
    if (!Array.isArray(array)) return [];
    return array.filter(predicate);
  }

  /**
   * Map array helper function
   */
  private mapArray(array: unknown[], mapper: (item: unknown, index?: number) => unknown): unknown[] {
    if (!Array.isArray(array)) return [];
    return array.map(mapper);
  }

  /**
   * Reduce array helper function
   */
  private reduceArray(
    array: unknown[],
    reducer: (acc: unknown, item: unknown, index?: number) => unknown,
    initialValue?: unknown
  ): unknown {
    if (!Array.isArray(array)) return initialValue;
    return initialValue !== undefined ? array.reduce(reducer, initialValue) : array.reduce(reducer);
  }

  /**
   * Merge objects helper function
   */
  private mergeObjects(...objects: Record<string, unknown>[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const obj of objects) {
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        Object.assign(result, obj);
      }
    }
    return result;
  }

  /**
   * Deep clone helper function
   */
  private cloneValue(value: unknown): unknown {
    if (value === null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.cloneValue(item));
    }

    if (value instanceof Date) {
      return new Date(value.getTime());
    }

    if (typeof value === 'object') {
      const cloned: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        cloned[key] = this.cloneValue(val);
      }
      return cloned;
    }

    return value;
  }

  /**
   * Find first element in array matching predicate
   */
  private findInArray(array: unknown[], predicate: (item: unknown, index?: number) => boolean): unknown {
    if (!Array.isArray(array)) return undefined;
    return array.find(predicate);
  }

  /**
   * Count elements in array
   */
  private countArray(array: unknown[]): number {
    if (!Array.isArray(array)) return 0;
    return array.length;
  }

  /**
   * Trim whitespace from string
   */
  private trimString(str: string): string {
    if (typeof str !== 'string') return String(str);
    return str.trim();
  }

  /**
   * Join array elements into string
   */
  private joinArray(array: unknown[], separator: string = ','): string {
    if (!Array.isArray(array)) return '';
    return array.map((item) => String(item)).join(separator);
  }

  /**
   * Create new object omitting specified keys
   */
  private omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const result: Record<string, unknown> = {};
    const keysToOmit = new Set(keys);

    for (const [key, value] of Object.entries(obj)) {
      if (!keysToOmit.has(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Create new object picking only specified keys
   */
  private pickKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }

    return result;
  }

  /**
   * Check if object has specified key
   */
  private hasKey(obj: Record<string, unknown>, key: string): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    return key in obj;
  }

  /**
   * Check if value exists (not null or undefined)
   */
  private valueExists(value: unknown): boolean {
    return value !== null && value !== undefined;
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
      // Add more detailed error logging for debugging
      console.error(`JSONata validation failed for expression: "${expression}"`, error);
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
