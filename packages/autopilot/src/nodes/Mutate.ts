/**
 * Mutate Node
 *
 * Dedicated node for execution state mutations using reducers (pure-return functions).
 * Handles only state changes, not input->output transformations.
 */

import { deepClone } from 'fast-json-patch';
import { NodeHandler } from '@/types/node-handler';
import { ValidationResult, ValidationError, Execution, ExecutionState, ExecutionItem } from '@/types';
import type { MutateParams, ReducerSpec } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { Eval } from '@/engine/Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';

/**
 * Transform safety manager for state snapshots and rollback
 */
class TransformSafetyManager {
  /**
   * Create state snapshot before applying transforms
   */
  createExecutionSnapshot(execution: Execution): Execution {
    return deepClone(execution);
  }

  /**
   * Rollback execution if transforms fail
   */
  rollbackExecution(execution: Execution, snapshot: Execution): void {
    execution.state = snapshot.state;
    // Note: Don't rollback results as they represent the actual node execution
  }

  /**
   * Validate state changes don't break execution
   */
  validateStateChanges(beforeState: ExecutionState, afterState: ExecutionState): ValidationResult {
    const errors: ValidationError[] = [];

    // Basic validation - ensure state is still an object
    if (!afterState || typeof afterState !== 'object') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Mutate operations resulted in invalid state structure',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export class Mutate implements NodeHandler {
  private params: MutateParams;
  private options?: NodeHandlerOptions;
  private safetyManager = new TransformSafetyManager();
  private eval = new Eval();

  constructor(params: MutateParams, options?: NodeHandlerOptions) {
    this.params = params;
    this.options = options;
  }

  /**
   * Execute reducers on execution state
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const reducers = this.normalizeReducers(this.params.reducers);
    if (!reducers.length) {
      return input || ExecutionItemUtils.wrapSingle({ reducersApplied: 0, names: [], changedKeys: [] });
    }

    if (!this.options?.execution) {
      throw new Error('Mutate node requires execution context');
    }

    const execution = this.options.execution;
    const snapshot = this.safetyManager.createExecutionSnapshot(execution);

    const names: string[] = [];
    const timingsMs: number[] = [];

    try {
      for (let i = 0; i < reducers.length; i++) {
        const r = reducers[i];
        const name = r.name || `reducer_${i + 1}`;

        // Evaluate guard (if present)
        if (typeof r.if === 'string' && r.if.trim().length > 0) {
          const guardResolved = (await this.eval.resolveTemplates(r.if, execution, undefined, {
            stringEvaluationMode: 'full-only',
          })) as unknown;
          if (!guardResolved) {
            continue; // skip
          }
        }

        const started = Date.now();
        const nextState = await this.runReducer(r.code, execution.state, this.buildReducerContext(input));
        timingsMs.push(Date.now() - started);

        if (!nextState || typeof nextState !== 'object' || Array.isArray(nextState)) {
          throw new Error(`Reducer '${name}' must return an object state`);
        }
        execution.state = nextState as Record<string, unknown>;
        names.push(name);
      }

      // Validate final state
      const validation = this.safetyManager.validateStateChanges(snapshot.state, execution.state);
      if (!validation.valid) {
        throw new Error(`State validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`);
      }
    } catch (error) {
      this.safetyManager.rollbackExecution(execution, snapshot);
      throw error;
    }

    // simple changed root keys
    const changedKeys = this.diffRootKeys(snapshot.state as Record<string, unknown>, execution.state as Record<string, unknown>);

    return ExecutionItemUtils.wrapSingle({ reducersApplied: names.length, names, changedKeys, timingsMs });
  }

  private normalizeReducers(specs?: ReducerSpec[]): Array<{ name?: string; if?: string; code: string; timeoutMs?: number }> {
    if (!Array.isArray(specs)) return [];
    return specs
      .map((s) => (typeof s === 'string' ? { code: s } : s))
      .filter(
        (s): s is { name?: string; if?: string; code: string; timeoutMs?: number } =>
          typeof (s as Record<string, unknown>).code === 'string'
      );
  }

  private buildReducerContext(input?: ExecutionItem[]): Record<string, unknown> {
    const execution = this.options?.execution;
    const runtimeConfig = this.options?.runtimeConfig || {};

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

    const inputData = ExecutionItemUtils.unwrapSingle(input);

    const ctx = {
      input: inputData,
      $input: () => inputData,
      $lastOutputOf,
      state: execution?.state || {},
      config: (key: string) => (typeof key === 'string' ? (runtimeConfig as Record<string, unknown>)[key] : undefined),
      configAll: () => ({ ...(runtimeConfig as Record<string, unknown>) }),
      // Utilities and safe builtins
      JSON: JSON,
      Math: Math,
      Date: Date,
      // Console shims
      console: {
        log: (...args: unknown[]) => console.log('[Mutate Reducer]:', ...args),
        error: (...args: unknown[]) => console.error('[Mutate Reducer]:', ...args),
        warn: (...args: unknown[]) => console.warn('[Mutate Reducer]:', ...args),
      },
      // Hard disables for security
      setTimeout: undefined,
      setInterval: undefined,
      require: undefined,
      process: undefined,
      global: undefined,
      eval: undefined,
      Function: undefined,
    } as Record<string, unknown>;

    return ctx;
  }

  private async runReducer(
    code: string,
    currentState: Record<string, unknown>,
    ctx: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const timeoutMs = 1000;
    return await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error(`Reducer execution timeout after ${timeoutMs}ms`)), timeoutMs);
      try {
        // Build function that evaluates reducer expression and invokes it
        const wrapped = `
          const __reducer = ${code};
          if (typeof __reducer !== 'function') { throw new Error('Reducer did not evaluate to a function'); }
          const __result = __reducer(state, ctx);
          return __result;
        `;
        const context: Record<string, unknown> = { state: currentState, ctx, ...ctx };
        const keys = Object.keys(context);
        const values = Object.values(context);
        const fn = new Function(...keys, wrapped);
        const result = fn.apply(null, values);
        const finish = (val: unknown) => {
          clearTimeout(timeoutId);
          resolve(val as Record<string, unknown>);
        };
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          (result as Promise<unknown>).then(finish).catch((e) => {
            clearTimeout(timeoutId);
            reject(e);
          });
        } else {
          finish(result);
        }
      } catch (e) {
        clearTimeout(timeoutId);
        reject(e);
      }
    });
  }

  private diffRootKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
    const keys = new Set<string>([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const changed: string[] = [];
    for (const k of keys) {
      if ((before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k]) changed.push(k);
    }
    return changed;
  }

  /**
   * Ensure intermediate paths exist in the state object for 'add' operations
   */
  private ensureIntermediatePaths(state: Record<string, unknown>, path: string): void {
    // Remove /state prefix if present since we're working directly on the state object
    const cleanPath = path.startsWith('/state/') ? path.substring('/state'.length) : path;

    if (!cleanPath || cleanPath === '/') return;

    // Split the path and remove empty segments
    const segments = cleanPath.split('/').filter((segment) => segment.length > 0);

    let current: Record<string, unknown> = state;

    // Create each intermediate object if it doesn't exist (except the last segment)
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];

      if (!(segment in current) || current[segment] === null || typeof current[segment] !== 'object') {
        current[segment] = {};
      }

      current = current[segment] as Record<string, unknown>;
    }
  }

  // Removed JSON Patch conversion logic

  /**
   * Validate reducers configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    const reducers = this.normalizeReducers(this.params.reducers);
    if (!reducers.length) {
      errors.push({ code: 'MISSING_REQUIRED_FIELD', message: 'Mutate node requires at least one reducer' });
      return { valid: false, errors };
    }

    // Validate guards and compile code
    for (let i = 0; i < reducers.length; i++) {
      const r = reducers[i];
      if (typeof r.if === 'string') {
        const guardValidation = this.eval.validateTemplateExpressions(r.if, { stringEvaluationMode: 'full-only' });
        if (!guardValidation.valid) {
          (guardValidation.errors || []).forEach((e) => errors.push({ code: e.code, message: `reducers[${i}].if: ${e.message}` }));
        }
      }
      // Basic syntax validation for reducer code
      try {
        // We only check that it parses and evaluates to a function at runtime; here do a light parse
        new Function('state', 'ctx', `const __reducer = ${r.code}; return typeof __reducer;`);
      } catch (syntaxError) {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: `reducers[${i}].code syntax error: ${syntaxError instanceof Error ? syntaxError.message : 'Unknown'}`,
        });
      }
    }

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
