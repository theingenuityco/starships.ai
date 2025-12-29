/**
 * Code Class
 *
 * Executable code node that runs JavaScript functions in a controlled environment.
 * Provides direct function execution capabilities for custom logic.
 */

import { BaseNode } from './BaseNode';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { CodeParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

export class Code extends BaseNode<CodeParams> {
  constructor(params: CodeParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the JavaScript code with provided input
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();

    try {
      // Get input data for the function
      const inputData = ExecutionItemUtils.unwrapSingle(input);

      // Get execution context for state and other data
      const execution = this.getOptions()?.execution;
      const runtimeEnv = this.getOptions()?.runtimeEnv || {};

      // Helper to access last output of a node with unwrapped json semantics
      const lastOutputOf = (ref: string): unknown => {
        if (!execution?.results || !ref) return undefined;
        for (let i = execution.results.length - 1; i >= 0; i--) {
          const entry = execution.results[i];
          if (entry?.nodeRef === ref) {
            const items = entry.items ?? [];
            if (!items.length) return undefined;
            if (items.length === 1) return items[0]?.json;
            return items.map((it) => it.json);
          }
        }
        return undefined;
      };

      // Build ctx surface matching the unified Context contract
      const ctx = {
        input: inputData,
        state: execution?.state || {},
        outputs: execution?.results || [],
        status: execution?.status ?? 'not_started',
        currentNodeRef: execution?.currentNodeRef,
        depth: execution?.depth ?? 0,
        lastOutputOf,
        exists: (value: unknown) => value !== undefined && value !== null,
        env: (key: string) => (typeof key === 'string' ? (runtimeEnv as Record<string, unknown>)[key] : undefined),
      };

      // Console shim for scoping
      const consoleShim = {
        log: (...args: unknown[]) => console.log('[Code Node]:', ...args),
        error: (...args: unknown[]) => console.error('[Code Node]:', ...args),
        warn: (...args: unknown[]) => console.warn('[Code Node]:', ...args),
      };

      // Execute the code with timeout
      const result = await this.executeCodeWithTimeout(params.code, ctx, consoleShim, params.timeout || 5000);

      // Sanitize non-finite numbers for JSON-safe transport (sentinel strings)
      const sanitizeNonFinite = (x: unknown): unknown => {
        if (typeof x === 'number') {
          if (!Number.isFinite(x)) {
            if (x === Infinity) return 'Infinity';
            if (x === -Infinity) return '-Infinity';
            return 'NaN';
          }
          return x;
        }
        if (Array.isArray(x)) return x.map(sanitizeNonFinite);
        if (x && typeof x === 'object') {
          const out: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
            out[k] = sanitizeNonFinite(v);
          }
          return out;
        }
        return x;
      };
      const safeResult = sanitizeNonFinite(result);
      return ExecutionItemUtils.wrapSingle(safeResult, input?.[0]);
    } catch (error) {
      throw this.handleExecutionError(error, `Code execution failed`);
    }
  }

  /**
   * Execute code with timeout protection
   */
  private async executeCodeWithTimeout(
    code: string,
    ctx: Record<string, unknown>,
    consoleShim: Record<string, unknown>,
    timeoutMs: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Code execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        // Wrap the user code and enforce async main(ctx) entrypoint
        const wrapped = `
          'use strict';
          try {
            ${code}
            if (typeof main !== 'function') {
              throw new Error("Missing async function main(ctx)");
            }
            // Return the result (may be a Promise)
            return main(ctx);
          } catch (error) {
            throw new Error('Code execution error: ' + (error && error.message ? error.message : String(error)));
          }
        `;

        // Shadow/block sensitive globals by parameter shadowing
        // Note: JSON/Math/Date remain available as normal JS built-ins
        const func = new Function(
          'ctx',
          'console',
          'setTimeout',
          'setInterval',
          'require',
          'Function',
          'process',
          'global',
          'globalThis',
          wrapped
        );

        const maybePromise = func(ctx, consoleShim, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
        Promise.resolve(maybePromise)
          .then((asyncResult: unknown) => {
            clearTimeout(timeoutId);
            resolve(asyncResult);
          })
          .catch((error: Error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Validate code node configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Required fields validation
    const codeError = this.validateRequiredField(params.code, 'Code');
    if (codeError) errors.push(codeError);

    // Code syntax validation (basic check)
    if (params.code) {
      try {
        // Try to compile with expected parameters (no execution)
        new Function('ctx', 'console', params.code);
      } catch (syntaxError) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: `Code syntax error: ${syntaxError instanceof Error ? syntaxError.message : 'Unknown syntax error'}`,
        });
      }

      // Require async function main(ctx) presence (strict API)
      const requiresMain = /async\s+function\s+main\s*\(/;
      if (!requiresMain.test(params.code)) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: `Missing required entrypoint: async function main(ctx)`,
        });
      }
    }

    // Timeout validation
    if (params.timeout !== undefined) {
      const timeoutError = this.validateMinimumValue(params.timeout, 'Timeout', 100);
      if (timeoutError) errors.push(timeoutError);
    }

    // Security check for dangerous patterns (allow Function constructor for safe evaluation)
    if (params.code) {
      const dangerousPatterns = [
        /require\s*\(/,
        /process\s*\./,
        /global\s*\./,
        /globalThis\s*\./,
        /import\s+/,
        /eval\s*\(/,
        /setTimeout\s*\(/,
        /setInterval\s*\(/,
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(params.code)) {
          errors.push({
            code: 'FORBIDDEN_FUNCTION',
            message: `Code contains potentially dangerous pattern: ${pattern.source}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
