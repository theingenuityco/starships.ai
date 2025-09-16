/**
 * Transform Node
 *
 * Dedicated node for state mutations using JSON Patch operations.
 * Contains all transform processing logic internally without separate processor class.
 */

import { applyPatch, deepClone, Operation } from 'fast-json-patch';
import { NodeHandler } from '@/types/node-handler';
import { ValidationResult, ValidationError, Execution, ExecutionState } from '@/types';
import type { TransformOperation, TransformParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { Eval } from '@/engine/Eval';

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

export class Transform implements NodeHandler {
  private params: TransformParams;
  private options?: NodeHandlerOptions;
  private safetyManager = new TransformSafetyManager();
  private eval = new Eval();

  constructor(params: TransformParams, options?: NodeHandlerOptions) {
    this.params = params;
    this.options = options;
  }

  /**
   * Execute transform operations on execution state or input data
   */
  async execute(input?: unknown): Promise<unknown> {
    if (!this.params.transforms || this.params.transforms.length === 0) {
      return input !== undefined ? input : { transformsApplied: 0, operations: [] };
    }

    if (!this.options?.execution) {
      throw new Error('Transform node requires execution context');
    }

    // Check execution mode based on input presence
    if (input !== undefined) {
      // Data flow mode: Transform the input data
      return await this.transformInputData(input, this.params.transforms);
    } else {
      // State mode: Apply transforms to execution state (existing behavior)
      await this.applyTransforms(this.params.transforms, this.options.execution);

      // Return summary of what was transformed
      const operations = this.params.transforms.map((t) => `${t.operation} ${t.path}`);
      return {
        transformsApplied: this.params.transforms.length,
        operations,
      };
    }
  }

  /**
   * Transform input data using JSON Patch operations
   */
  private async transformInputData(data: unknown, transforms: TransformOperation[]): Promise<unknown> {
    if (!transforms || transforms.length === 0) return data;

    let result = data;

    try {
      // Apply transforms one at a time so each can see the updated data
      for (const transform of transforms) {
        // Convert single transform to JSON Patch operation with current data
        const patchOperations = await this.convertToJsonPatchOperationsForInput(transform, result);

        // Apply patch to the data directly
        const patchedResult = applyPatch(result, patchOperations, false, false).newDocument;

        // Update result immediately so next transform can see the changes
        result = patchedResult;
      }

      return result;
    } catch (error) {
      throw new Error(`Data transformation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert TransformOperation to JSON Patch Operation for input data
   */
  private async convertToJsonPatchOperationsForInput(transform: TransformOperation, currentData: unknown): Promise<Operation[]> {
    // Create a temporary execution context for template resolution
    const tempExecution = this.options?.execution || {
      status: 'running' as const,
      state: {},
      nodeOutputs: {},
    };

    // Resolve template expressions in the value with current data as input
    let resolvedValue = transform.value;
    if (transform.value !== undefined) {
      resolvedValue = await this.eval.resolveTemplates(transform.value, tempExecution, currentData);
    }

    // Resolve template expressions in the from path
    let resolvedFrom = transform.from;
    if (transform.from !== undefined) {
      resolvedFrom = (await this.eval.resolveTemplates(transform.from, tempExecution, currentData)) as string;
    }

    // Create JSON Patch operation
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

    return [operation];
  }

  /**
   * Apply transform operations to execution state
   */
  private async applyTransforms(transforms: TransformOperation[], execution: Execution): Promise<void> {
    if (!transforms || transforms.length === 0) return;

    // Create execution snapshot for rollback
    const executionSnapshot = this.safetyManager.createExecutionSnapshot(execution);

    try {
      // Apply transforms one at a time so each can see the updated state
      for (const transform of transforms) {
        // For 'add' operations, ensure intermediate paths exist
        if (transform.operation === 'add') {
          this.ensureIntermediatePaths(execution.state, transform.path);
        }

        // Convert single transform to JSON Patch operation with current state
        const patchOperations = await this.convertToJsonPatchOperations([transform], execution);

        // Apply patch to a wrapper object to handle the root state correctly
        const stateWrapper = { state: execution.state };
        const patchedWrapper = applyPatch(stateWrapper, patchOperations, false, false).newDocument;

        // Update execution state immediately so next transform can see the changes
        execution.state = patchedWrapper.state;
      }

      // Validate final state changes
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
   * Validate transform operations
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if transforms are provided
    if (!this.params.transforms || this.params.transforms.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Transform node requires at least one transform operation',
      });
      return {
        valid: false,
        errors,
      };
    }

    // Validate transform operations
    const validation = this.validateTransforms(this.params.transforms);
    if (!validation.valid) {
      errors.push(...(validation.errors || []));
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate transform operations
   */
  private validateTransforms(transforms: TransformOperation[]): ValidationResult {
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
