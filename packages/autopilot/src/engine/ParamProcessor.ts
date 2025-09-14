/**
 * Parameter Processing System
 *
 * Handles template expression resolution and transform operations for autopilot nodes.
 * Supports {{ jsonataExpression }} syntax for dynamic parameter resolution.
 */

import jsonata from 'jsonata';
import type { Execution, ExecutionState, NodeResult, ExecutionStatus, ValidationResult, ValidationError } from '@/types';

/**
 * Template context available to JSONata expressions
 */
export interface TemplateContext {
  state: ExecutionState;
  results: NodeResult[];
  status: ExecutionStatus;
  currentNodeRef?: string;

  // Helper functions
  $nodeResult: (nodeRef: string) => NodeResult | undefined;
  $lastResult: () => NodeResult | undefined;
  $now: () => string;
}

/**
 * Transform context extends template context with mutation capabilities
 */
export interface TransformContext extends TemplateContext {
  // Additional helpers for mutations
  $increment: (path: string, amount?: number) => void;
  $append: <T>(array: T[], item: T) => T[];
  $merge: (target: Record<string, unknown>, source: Record<string, unknown>) => Record<string, unknown>;
  $currentResult: () => NodeResult | undefined;
}

/**
 * Template validation options
 */
export interface TemplateValidationOptions {
  allowedContextKeys?: string[];
  requiredExpressions?: string[];
  forbiddenFunctions?: string[];
}

/**
 * Core parameter processor that handles template resolution and transforms
 */
export class ParamProcessor {
  private static readonly TEMPLATE_REGEX = /\{\{\s*(.*?)\s*\}\}/g;

  /**
   * Resolve template expressions in parameters
   */
  async resolveTemplates(params: unknown, execution: Execution): Promise<unknown> {
    const context = this.buildTemplateContext(execution);
    return await this.processValue(params, context);
  }

  /**
   * Check if a value contains template expressions
   */
  hasTemplateExpressions(value: unknown): boolean {
    if (typeof value === 'string') {
      return ParamProcessor.TEMPLATE_REGEX.test(value);
    } else if (Array.isArray(value)) {
      return value.some((item) => this.hasTemplateExpressions(item));
    } else if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((val) => this.hasTemplateExpressions(val));
    }
    return false;
  }

  /**
   * Validate template expressions in parameters
   */
  validateTemplateExpressions(params: unknown, options?: TemplateValidationOptions): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateValue(params, errors, options);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process any value type for template resolution
   */
  private async processValue(value: unknown, context: TemplateContext): Promise<unknown> {
    if (typeof value === 'string') {
      return await this.resolveStringTemplates(value, context);
    } else if (Array.isArray(value)) {
      return await Promise.all(value.map((item) => this.processValue(item, context)));
    } else if (value && typeof value === 'object') {
      return await this.resolveObjectTemplates(value as Record<string, unknown>, context);
    }
    return value;
  }

  /**
   * Resolve template expressions in a string
   */
  private async resolveStringTemplates(str: string, context: TemplateContext): Promise<unknown> {
    const matches = Array.from(str.matchAll(ParamProcessor.TEMPLATE_REGEX));

    if (matches.length === 0) return str;

    // Handle full-string replacement vs partial replacement
    if (matches.length === 1 && matches[0][0] === str) {
      // Full string is a template - return the actual resolved type
      return await this.evaluateExpression(matches[0][1], context);
    } else {
      // Partial replacement - substitute within string
      let result = str;
      for (const match of matches) {
        const resolved = await this.evaluateExpression(match[1], context);
        result = result.replace(match[0], String(resolved));
      }
      return result;
    }
  }

  /**
   * Resolve template expressions in an object
   */
  private async resolveObjectTemplates(obj: Record<string, unknown>, context: TemplateContext): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await this.processValue(value, context);
    }
    return result;
  }

  /**
   * Evaluate a single JSONata expression
   */
  private async evaluateExpression(expression: string, context: TemplateContext): Promise<unknown> {
    try {
      const jsonataExpr = jsonata(expression.trim());
      return await jsonataExpr.evaluate(context);
    } catch (error) {
      throw new Error(
        `Template evaluation failed for expression "${expression}": ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build template context from execution state
   */
  private buildTemplateContext(execution: Execution): TemplateContext {
    return {
      state: execution.state,
      results: execution.results,
      status: execution.status,
      currentNodeRef: execution.currentNodeRef,

      // Helper functions
      $nodeResult: (nodeRef: string) => execution.results.find((r) => r.nodeRef === nodeRef),
      $lastResult: () => execution.results[execution.results.length - 1],
      $now: () => new Date().toISOString(),
    };
  }

  /**
   * Recursively validate template expressions
   */
  private validateValue(value: unknown, errors: ValidationError[], options?: TemplateValidationOptions, path = ''): void {
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
  private validateStringTemplates(str: string, errors: ValidationError[], options?: TemplateValidationOptions, path = ''): void {
    const matches = Array.from(str.matchAll(ParamProcessor.TEMPLATE_REGEX));

    for (const match of matches) {
      const expression = match[1];

      try {
        // Validate JSONata syntax
        jsonata(expression.trim());

        // Additional validation checks
        if (options?.forbiddenFunctions) {
          for (const forbiddenFunc of options.forbiddenFunctions) {
            if (expression.includes(forbiddenFunc)) {
              errors.push({
                code: 'FORBIDDEN_FUNCTION',
                message: `Forbidden function "${forbiddenFunc}" used in template expression at ${path}`,
              });
            }
          }
        }

        if (options?.allowedContextKeys) {
          // Basic check for context key usage (could be more sophisticated)
          const usesDisallowedKey = options.allowedContextKeys.every((key) => !expression.includes(key));
          if (usesDisallowedKey) {
            errors.push({
              code: 'INVALID_CONTEXT_ACCESS',
              message: `Template expression at ${path} uses disallowed context keys`,
            });
          }
        }
      } catch (error) {
        errors.push({
          code: 'INVALID_JSONATA_EXPRESSION',
          message: `Invalid JSONata expression "${expression}" at ${path}: ${error instanceof Error ? error.message : 'Syntax error'}`,
        });
      }
    }
  }
}
