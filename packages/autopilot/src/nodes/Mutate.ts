/**
 * Mutate Node
 *
 * Dedicated node for execution state mutations using JSON Patch operations.
 * Handles only state changes, not input->output transformations.
 */

import { deepClone, Operation } from 'fast-json-patch';
import { NodeHandler } from '@/types/node-handler';
import { ValidationResult, ValidationError, Execution, ExecutionState, ExecutionItem } from '@/types';
import type { TransformOperation, MutateParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { Eval } from '@/engine/Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { nanoid } from 'nanoid';

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
   * Execute state mutation operations (Note: This node cannot function without execution context)
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    if (!this.params.mutations || this.params.mutations.length === 0) {
      return input || ExecutionItemUtils.wrapSingle({ mutationsApplied: 0, operations: [] });
    }

    // Since execution context is no longer available via NodeHandlerOptions,
    // this node cannot perform actual state mutations
    throw new Error('Mutate node cannot function without execution context. Use inline mutations in the Engine instead.');
  }

  /**
   * Apply transform operations to execution state (deprecated - cannot function without execution context)
   */
  private async applyTransforms(): Promise<void> {
    throw new Error('Mutate node cannot apply transforms without execution context');
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
  private async convertToJsonPatchOperations(transforms: TransformOperation[], inputData?: unknown): Promise<Operation[]> {
    const operations: Operation[] = [];
    const context = this.createMinimalContext(inputData);

    for (const transform of transforms) {
      // Resolve template expressions in the value
      let resolvedValue = transform.value;
      if (transform.value !== undefined) {
        resolvedValue = await this.eval.evaluateExpression(String(transform.value), context);
      }

      // Resolve template expressions in the from path (for copy/move operations)
      let resolvedFrom = transform.from;
      if (transform.from !== undefined) {
        resolvedFrom = (await this.eval.evaluateExpression(String(transform.from), context)) as string;
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
   * Create minimal evaluation context from input data
   */
  private createMinimalContext(inputData?: unknown) {
    return {
      state: {},
      outputs: {},
      status: 'running' as const,
      currentNodeRef: undefined,
      input: inputData,

      // Helper functions
      $output: () => undefined,
      $input: (path?: string) => this.extractPath(inputData, path),
      $now: () => new Date().toISOString(),
      $random: () => nanoid(),
      $count: (array: unknown[]) => (Array.isArray(array) ? array.length : 0),
    };
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
   * Validate mutate operations
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if mutations are provided
    if (!this.params.mutations || this.params.mutations.length === 0) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Mutate node requires at least one mutation operation',
      });
      return {
        valid: false,
        errors,
      };
    }

    // Validate mutation operations
    const validation = this.validateTransforms(this.params.mutations);
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
