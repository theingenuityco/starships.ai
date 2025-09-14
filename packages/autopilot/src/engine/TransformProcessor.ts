/**
 * Transform Processing System
 *
 * Handles state mutation operations using JSONata assignment expressions.
 * Provides safe, atomic state updates with rollback capabilities.
 */

import jsonata from 'jsonata';
import type { Execution, ExecutionState, NodeResult, ValidationResult, ValidationError } from '@/types';
import type { TransformContext } from './ParamProcessor';

/**
 * Transform safety manager for state snapshots and rollback
 */
class TransformSafetyManager {
  /**
   * Create state snapshot before applying transforms
   */
  createStateSnapshot(execution: Execution): ExecutionState {
    return JSON.parse(JSON.stringify(execution.state));
  }

  /**
   * Rollback state if transforms fail
   */
  rollbackState(execution: Execution, snapshot: ExecutionState): void {
    execution.state = snapshot;
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
        message: 'Transform operations resulted in invalid state structure',
      });
    }

    // Check for critical key deletions (if any are defined as critical)
    // This could be extended based on requirements

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Core transform processor that handles state mutations
 */
export class TransformProcessor {
  private safetyManager = new TransformSafetyManager();

  /**
   * Apply transform operations to execution state
   */
  async applyTransforms(transforms: string | string[], execution: Execution, nodeResult?: NodeResult): Promise<void> {
    if (!transforms) return;

    const transformArray = Array.isArray(transforms) ? transforms : [transforms];
    if (transformArray.length === 0) return;

    // Create state snapshot for rollback
    const stateSnapshot = this.safetyManager.createStateSnapshot(execution);

    try {
      // Build transform context
      const context = this.buildTransformContext(execution, nodeResult);

      // Apply transforms sequentially to maintain order
      for (const transform of transformArray) {
        await this.applySingleTransform(transform, execution, context);
      }

      // Validate state changes
      const validation = this.safetyManager.validateStateChanges(stateSnapshot, execution.state);
      if (!validation.valid) {
        throw new Error(`State validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`);
      }
    } catch (error) {
      // Rollback state on any failure
      this.safetyManager.rollbackState(execution, stateSnapshot);
      throw error;
    }
  }

  /**
   * Validate transform expressions
   */
  validateTransforms(transforms: string | string[]): ValidationResult {
    const errors: ValidationError[] = [];
    const transformArray = Array.isArray(transforms) ? transforms : [transforms];

    for (let i = 0; i < transformArray.length; i++) {
      const transform = transformArray[i];
      const validation = this.validateTransformSyntax(transform, `transforms[${i}]`);
      if (!validation.valid) {
        errors.push(...(validation.errors || []));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Apply a single transform expression
   */
  private async applySingleTransform(transform: string, execution: Execution, context: TransformContext): Promise<void> {
    try {
      // Validate transform syntax
      const validation = this.validateTransformSyntax(transform);
      if (!validation.valid) {
        throw new Error(`Transform validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`);
      }

      // Create JSONata expression
      const expr = jsonata(transform);

      // Apply transform to execution state
      // JSONata assignment expressions modify the context object directly
      await expr.evaluate(context);
    } catch (error) {
      throw new Error(`Transform failed for expression "${transform}": ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate transform syntax and security
   */
  private validateTransformSyntax(transform: string, path = ''): ValidationResult {
    const errors: ValidationError[] = [];

    // Check for assignment operator
    if (!transform.includes(':=')) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Transform expressions must use assignment operator (:=) at ${path}`,
      });
      return { valid: false, errors };
    }

    // Validate that left side starts with 'state.'
    const leftSide = transform.split(':=')[0].trim();
    if (!leftSide.startsWith('state.')) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Transform expressions can only modify execution state at ${path}`,
      });
    }

    // Additional security checks
    this.checkForbiddenOperations(transform, errors, path);

    // Validate JSONata syntax
    try {
      jsonata(transform);
    } catch (error) {
      errors.push({
        code: 'INVALID_JSONATA_EXPRESSION',
        message: `Invalid JSONata expression at ${path}: ${error instanceof Error ? error.message : 'Syntax error'}`,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check for forbidden operations in transform expressions
   */
  private checkForbiddenOperations(transform: string, errors: ValidationError[], path = ''): void {
    const forbidden = ['eval', 'Function', 'require', 'import', 'process', 'global', 'window'];

    for (const op of forbidden) {
      if (transform.includes(op)) {
        errors.push({
          code: 'FORBIDDEN_FUNCTION',
          message: `Forbidden operation "${op}" in transform expression at ${path}`,
        });
      }
    }
  }

  /**
   * Build transform context with mutation capabilities
   */
  private buildTransformContext(execution: Execution, nodeResult?: NodeResult): TransformContext {
    // Create a mutable reference to state for assignments
    const context: TransformContext = {
      state: execution.state, // This will be mutated by JSONata assignments
      results: execution.results,
      status: execution.status,
      currentNodeRef: execution.currentNodeRef,

      // Include current node result if provided
      $currentResult: () => nodeResult,
      $nodeResult: (nodeRef: string) => execution.results.find((r) => r.nodeRef === nodeRef),
      $lastResult: () => execution.results[execution.results.length - 1],
      $now: () => new Date().toISOString(),

      // Helper functions for common operations
      $increment: (path: string, amount = 1) => {
        const expr = jsonata(`${path} := (${path} ? ${path} : 0) + ${amount}`);
        return expr.evaluate(context);
      },

      $append: <T>(array: T[], item: T): T[] => {
        return Array.isArray(array) ? [...array, item] : [item];
      },

      $merge: (target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> => {
        return { ...target, ...source };
      },
    };

    return context;
  }
}
