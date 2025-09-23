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

      // Create the execution context for the code
      const secureEnv = this.getOptions()?.secureEnv || {};

      // Helper to access last output of a node within current execution
      const $lastOutputOf = (ref: string): ExecutionItem[] => {
        try {
          if (!execution?.results || !ref) return [];
          for (let i = execution.results.length - 1; i >= 0; i--) {
            const entry = execution.results[i];
            if (entry?.nodeRef === ref) {
              return entry.items ?? [];
            }
          }
          return [];
        } catch {
          return [];
        }
      };

      const context = {
        // Inputs and state helpers
        input: inputData,
        $input: () => inputData,
        $lastOutputOf,

        state: execution?.state || {},
        env: (key: string) => (typeof key === 'string' ? secureEnv[key] : undefined),
        envAll: () => ({ ...secureEnv }),

        // Console shims
        console: {
          log: (...args: unknown[]) => console.log('[Code Node]:', ...args),
          error: (...args: unknown[]) => console.error('[Code Node]:', ...args),
          warn: (...args: unknown[]) => console.warn('[Code Node]:', ...args),
        },

        // Common utilities
        JSON: JSON,
        Math: Math,
        Date: Date,

        // Hard disables for security
        setTimeout: undefined,
        setInterval: undefined,
        require: undefined,
        process: undefined,
        global: undefined,
        eval: undefined,
        Function: undefined,
      };

      // Execute the code with timeout
      const result = await this.executeCodeWithTimeout(params.code, context, params.timeout || 5000);

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
  private async executeCodeWithTimeout(code: string, context: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Code execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        // Create a function from the code with the context as parameters
        const contextKeys = Object.keys(context);
        const contextValues = Object.values(context);

        // Wrap the code in a function that returns the result
        const wrappedCode = `
          try {
            ${code}
          } catch (error) {
            throw new Error('Code execution error: ' + error.message);
          }
        `;

        // Use Function constructor to create the function (safer than eval)
        const func = new Function(...contextKeys, wrappedCode);
        const result = func.apply(null, contextValues);

        // Handle both sync and async results
        if (result && typeof result.then === 'function') {
          result
            .then((asyncResult: unknown) => {
              clearTimeout(timeoutId);
              resolve(asyncResult);
            })
            .catch((error: Error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
        } else {
          clearTimeout(timeoutId);
          resolve(result);
        }
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
        // Try to parse as function to check basic syntax
        new Function(params.code);
      } catch (syntaxError) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: `Code syntax error: ${syntaxError instanceof Error ? syntaxError.message : 'Unknown syntax error'}`,
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
