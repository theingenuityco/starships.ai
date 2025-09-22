/**
 * Expression Evaluation Engine
 *
 * Centralized template expression evaluation system.
 * Handles {{ jsExpression }} syntax and provides context-aware evaluation.
 */

import type {
  Execution,
  ExecutionState,
  ExecutionStatus,
  ValidationResult,
  ValidationError,
  ExecutionItem,
  ValidationErrorCode,
} from '@/types';

/**
 * Evaluation context available to JavaScript expressions
 */
export interface EvalContext {
  state: ExecutionState;
  outputs: Array<{ nodeRef: string; items: ExecutionItem[] }>; // Updated to array format
  status: ExecutionStatus;
  currentNodeRef?: string;
  input?: unknown;

  // Helper functions for workflow-specific operations
  $lastOutputOf: (nodeRef: string) => unknown;
  $input: (path?: string) => unknown;

  // Unified env/secret system (uniform naming across eval and code)
  env: (key: string) => unknown;
  envAll: () => Record<string, unknown>;
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

  constructor(private readonly secureEnv?: Record<string, string>) {}

  /**
   * Normalize/sanitize an extracted JS expression before compiling.
   * Some blueprint/template sources may JSON-escape quotes (e.g. \"lint\"),
   * which breaks Function(...) parsing. We unescape common JSON-escaped sequences.
   */
  private sanitizeExpression(expression: string): string {
    // Only operate on strings; keep it minimal and safe.
    let expr = String(expression ?? '');

    // Replace common JSON-escaped sequences first
    expr = expr.replace(/\\\\/g, '\\'); // unescape backslashes first
    expr = expr.replace(/\\"/g, '"'); // unescape double quotes
    expr = expr.replace(/\\'/g, "'"); // unescape single quotes

    // Trim whitespace
    expr = expr.trim();
    return expr;
  }

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

      // Workflow-specific helper functions
      // IMPORTANT: Do not mask missing outputs. Surface a descriptive error
      // so we can pinpoint why a nodeRef is unavailable in the current scope.
      $lastOutputOf: (nodeRef: string) => {
        const items = this.findLatestNodeResult(execution, nodeRef) as ExecutionItem[] | undefined;
        if (!items) {
          // Build small diagnostic to help locate root cause
          const available = execution.results.map((r) => r.nodeRef);
          const msg =
            `No output found for nodeRef="${nodeRef}". ` +
            `Current node="${execution.currentNodeRef ?? 'unknown'}". ` +
            `Available outputs: [${available.join(', ')}]. ` +
            `This typically occurs when a template references a node from a different workflow scope ` +
            `(e.g., using a nested tool's nodeRef like "lint" from the outer agent), or when the node has not executed yet.`;
          throw new Error(msg);
        }
        return items;
      },
      $input: (path?: string) => this.extractPath(inputData, path),

      // Unified env/secret system (uniform naming across eval and code)
      env: (key: string) => {
        if (!key || typeof key !== 'string') return undefined;
        return this.secureEnv?.[key];
      },
      envAll: () => {
        return { ...(this.secureEnv ?? {}) };
      },
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
   * Evaluate a JS expression with context
   * Note: For production, execute inside a hardened sandbox (e.g., child process or container).
   * This host implementation is minimal and intended for development use only.
   */
  async evaluateExpression(expression: string, context: EvalContext, options?: EvalOptions): Promise<unknown> {
    try {
      // Sanitize to handle JSON-escaped sequences like \"lint\"
      const exprRaw = String(expression ?? '');
      const expr = this.sanitizeExpression(exprRaw);
      if (!expr) return undefined;

      // Build a tiny evaluator. Using `with(ctx)` to make context keys available as identifiers.
      // IMPORTANT: This should run inside an isolate in production.
      const fn = new Function('ctx', `with (ctx) { return (${expr}); }`);

      const execPromise = Promise.resolve().then(() => fn(context));

      if (options?.timeout && Number.isFinite(options.timeout)) {
        const timeoutMs = Number(options.timeout);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Expression evaluation timed out')), timeoutMs)
        );
        return await Promise.race([execPromise, timeoutPromise]);
      }

      return await execPromise;
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
      // Create fresh regex to avoid global flag state issues
      const regex = /\{\{\s*(.*?)\s*\}\}/;
      return regex.test(value);
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
   * Validate a JS expression syntax
   */
  validateExpression(expression: string, options?: EvalOptions): ValidationResult {
    const errors: ValidationError[] = [];
    // Sanitize to support JSON-escaped sequences inside templates
    const expr = this.sanitizeExpression(String(expression ?? ''));

    try {
      // Additional validation checks (string-level)
      if (options?.forbiddenFunctions) {
        for (const forbiddenFunc of options.forbiddenFunctions) {
          if (expr.includes(forbiddenFunc)) {
            errors.push({
              code: 'FORBIDDEN_FUNCTION',
              message: `Forbidden function "${forbiddenFunc}" used in expression`,
            });
          }
        }
      }

      if (options?.allowedContextKeys) {
        // Basic check for context key usage
        const usesAllowed = options.allowedContextKeys.some((key) => expr.includes(key));
        if (!usesAllowed) {
          errors.push({
            code: 'INVALID_CONTEXT_ACCESS',
            message: 'Expression uses disallowed context keys',
          });
        }
      }

      // Compile-time syntax check (no execution)
      // new Function throws on syntax errors
      new Function('ctx', `with (ctx) { return (${expr}); }`);
    } catch (error) {
      // Dead simple - just log everything raw
      console.error('Expression validation failed:', expression, error);
      errors.push({
        code: 'INVALID_EXPRESSION' as ValidationErrorCode,
        message: `Invalid expression: ${error instanceof Error ? error.message : String(error)}`,
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
    // Create fresh regex to avoid global flag state issues
    const regex = /\{\{\s*(.*?)\s*\}\}/g;
    const matches = Array.from(str.matchAll(regex));

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
   * Heuristic: detect blueprint-like objects (definitions), not runtime data.
   * A blueprint has shape { nodes: [], edges: [] } where both are arrays.
   * These structures may contain their own {{ ... }} placeholders that are only
   * meaningful in their own (nested) execution scope. We must NOT resolve them here.
   */
  private isBlueprintLikeObject(val: unknown): boolean {
    if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
    const o = val as Record<string, unknown>;
    return Array.isArray(o.nodes) && Array.isArray(o.edges);
  }

  /**
   * Resolve template expressions in an object
   */
  private async resolveObjectTemplates(
    obj: Record<string, unknown>,
    context: EvalContext,
    options?: EvalOptions
  ): Promise<Record<string, unknown>> {
    // If the entire object looks like a blueprint, return it as-is (opaque)
    if (this.isBlueprintLikeObject(obj)) {
      return obj;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // If a specific key appears to hold a blueprint, keep it opaque
      if (key === 'blueprint' && this.isBlueprintLikeObject(value)) {
        result[key] = value;
        continue;
      }
      // Otherwise resolve recursively
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
    // Create fresh regex to avoid global flag state issues
    const regex = /\{\{\s*(.*?)\s*\}\}/g;
    const matches = Array.from(str.matchAll(regex));

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
