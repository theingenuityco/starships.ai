/**
 * Transform Processing System
 *
 * Handles state mutation operations using JSON Patch-like operations with fast-json-patch.
 * Provides safe, atomic state updates with rollback capabilities.
 */

import { applyPatch, deepClone, Operation } from 'fast-json-patch';
import type { Execution, ExecutionState, ValidationResult, ValidationError } from '@/types';
import type { TransformOperation } from '@/types/node-parameters';
import { Eval } from './Eval';

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
        message: 'Transform operations resulted in invalid state structure',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Core transform processor that handles state mutations using JSON Patch operations
 */
export class TransformProcessor {
  private safetyManager = new TransformSafetyManager();
  private eval = new Eval();

  /**
   * Apply transform operations to execution state
   */
  async applyTransforms(transforms: TransformOperation[], execution: Execution): Promise<void> {
    if (!transforms || transforms.length === 0) return;

    // Create execution snapshot for rollback
    const executionSnapshot = this.safetyManager.createExecutionSnapshot(execution);

    try {
      // Convert transforms to JSON Patch operations
      const patchOperations = await this.convertToJsonPatchOperations(transforms, execution);

      // Apply patches to a wrapper object to handle the root state correctly
      const stateWrapper = { state: execution.state };
      const patchedWrapper = applyPatch(stateWrapper, patchOperations, false, false).newDocument;

      // Update execution state
      execution.state = patchedWrapper.state;

      // Validate state changes
      const validation = this.safetyManager.validateStateChanges(executionSnapshot.state, execution.state);
      if (!validation.valid) {
        throw new Error(`State validation failed: ${validation.errors?.map((e) => e.message).join(', ')}`);
      }
    } catch (error) {
      // Rollback state on any failure
      this.safetyManager.rollbackExecution(execution, executionSnapshot);
      throw error;
    }
  }

  /**
   * Validate transform operations
   */
  validateTransforms(transforms: TransformOperation[]): ValidationResult {
    const errors: ValidationError[] = [];

    for (let i = 0; i < transforms.length; i++) {
      const transform = transforms[i];
      const validation = this.validateTransformOperation(transform, `transforms[${i}]`);
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
   * Convert TransformOperation to JSON Patch Operation with template resolution
   */
  private async convertToJsonPatchOperations(transforms: TransformOperation[], execution: Execution): Promise<Operation[]> {
    const operations: Operation[] = [];

    for (const transform of transforms) {
      // Resolve template expressions in the value
      let resolvedValue = transform.value;
      if (transform.value !== undefined) {
        resolvedValue = await this.eval.resolveTemplates(transform.value, execution);
      }

      // Resolve template expressions in the from path (for copy/move operations)
      let resolvedFrom = transform.from;
      if (transform.from !== undefined) {
        resolvedFrom = (await this.eval.resolveTemplates(transform.from, execution)) as string;
      }

      // Create JSON Patch operation based on operation type
      let operation: Operation;

      switch (transform.operation) {
        case 'add':
          operation = {
            op: 'add',
            path: transform.path,
            value: resolvedValue,
          };
          break;
        case 'replace':
          operation = {
            op: 'replace',
            path: transform.path,
            value: resolvedValue,
          };
          break;
        case 'test':
          operation = {
            op: 'test',
            path: transform.path,
            value: resolvedValue,
          };
          break;
        case 'remove':
          operation = {
            op: 'remove',
            path: transform.path,
          };
          break;
        case 'copy':
          if (!resolvedFrom) {
            throw new Error(`Copy operation requires "from" path for transform at ${transform.path}`);
          }
          operation = {
            op: 'copy',
            path: transform.path,
            from: resolvedFrom,
          };
          break;
        case 'move':
          if (!resolvedFrom) {
            throw new Error(`Move operation requires "from" path for transform at ${transform.path}`);
          }
          operation = {
            op: 'move',
            path: transform.path,
            from: resolvedFrom,
          };
          break;
        default:
          throw new Error(`Unsupported transform operation: ${transform.operation}`);
      }

      operations.push(operation);
    }

    return operations;
  }

  /**
   * Validate a single transform operation
   */
  private validateTransformOperation(transform: TransformOperation, path = ''): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate operation type
    const validOperations = ['add', 'replace', 'remove', 'copy', 'move', 'test'];
    if (!validOperations.includes(transform.operation)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Invalid transform operation "${transform.operation}" at ${path}`,
      });
    }

    // Validate path
    if (!transform.path || typeof transform.path !== 'string') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Transform path is required and must be a string at ${path}`,
      });
    } else if (!transform.path.startsWith('/state')) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Transform path must start with "/state" at ${path}`,
      });
    }

    // Validate operation-specific requirements
    switch (transform.operation) {
      case 'add':
      case 'replace':
      case 'test':
        if (transform.value === undefined) {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Transform operation "${transform.operation}" requires a value at ${path}`,
          });
        }
        break;
      case 'copy':
      case 'move':
        if (!transform.from || typeof transform.from !== 'string') {
          errors.push({
            code: 'MISSING_REQUIRED_FIELD',
            message: `Transform operation "${transform.operation}" requires a "from" path at ${path}`,
          });
        } else if (!transform.from.startsWith('/state')) {
          errors.push({
            code: 'INVALID_PARAMETERS',
            message: `Transform "from" path must start with "/state" at ${path}`,
          });
        }
        break;
    }

    // Validate template expressions in value if present
    if (transform.value !== undefined) {
      const templateValidation = this.eval.validateTemplateExpressions(transform.value);
      if (!templateValidation.valid) {
        const templateErrors =
          templateValidation.errors?.map((e: ValidationError) => ({
            ...e,
            message: `${path}.value: ${e.message}`,
          })) || [];
        errors.push(...templateErrors);
      }
    }

    // Validate template expressions in from path if present
    if (transform.from !== undefined) {
      const templateValidation = this.eval.validateTemplateExpressions(transform.from);
      if (!templateValidation.valid) {
        const templateErrors =
          templateValidation.errors?.map((e: ValidationError) => ({
            ...e,
            message: `${path}.from: ${e.message}`,
          })) || [];
        errors.push(...templateErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
