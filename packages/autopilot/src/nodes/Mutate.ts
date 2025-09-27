/**
 * Mutate Node
 *
 * Dedicated node for execution state mutations using JSON Patch operations.
 * Handles only state changes, not input->output transformations.
 */

import { applyPatch, deepClone, Operation } from 'fast-json-patch';
import { NodeHandler } from '@/types/node-handler';
import { ValidationResult, ValidationError, Execution, ExecutionState, ExecutionItem } from '@/types';
import type { TransformOperation, MutateParams } from '@/types/node-parameters';
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
   * Execute state mutation operations on execution state
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    if (!this.params.mutations || this.params.mutations.length === 0) {
      return input || ExecutionItemUtils.wrapSingle({ mutationsApplied: 0, operations: [] });
    }

    if (!this.options?.execution) {
      throw new Error('Mutate node requires execution context');
    }

    console.log('[Mutate] Applying mutations:', this.params.mutations.length, 'operations');
    console.log('[Mutate] Mutation details:', this.params.mutations.map(m => ({
      operation: m.operation,
      path: m.path,
      valueType: Array.isArray(m.value) ? `array(${m.value.length})` : typeof m.value
    })));

    // Apply mutations to execution state
    await this.applyTransforms(this.params.mutations, this.options.execution);

    // Return summary of what was mutated
    const operations = this.params.mutations.map((t) => `${t.operation} ${t.path}`);
    
    console.log('[Mutate] Mutations completed:', operations);
    
    return ExecutionItemUtils.wrapSingle({
      mutationsApplied: this.params.mutations.length,
      operations,
    });
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
        console.log('[Mutate] Processing transform:', {
          operation: transform.operation,
          path: transform.path,
          valueType: Array.isArray(transform.value) ? `array(${transform.value.length})` : typeof transform.value
        });
        
        // For 'add' operations, ensure intermediate paths exist
        if (transform.operation === 'add') {
          this.ensureIntermediatePaths(execution.state, transform.path);
        }

        // Convert single transform to JSON Patch operation with current state
        // Force fresh evaluation by creating a new Eval instance each time
        const freshEval = new Eval();
        const patchOperations = await this.convertSingleTransformToJsonPatch(transform, execution, freshEval);
        
        console.log('[Mutate] Patch operations:', JSON.stringify(patchOperations, null, 2));

        // Apply patch to a wrapper object to handle the root state correctly
        const stateWrapper = { state: execution.state };
        const patchedWrapper = applyPatch(stateWrapper, patchOperations, false, false).newDocument;

        // Update execution state immediately so next transform can see the changes
        execution.state = patchedWrapper.state;
        
        console.log('[Mutate] State after transform - messages count:', 
          Array.isArray(execution.state.messages) ? execution.state.messages.length : 'not an array');
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
   * Convert single transform to JSON Patch Operation with fresh evaluation
   */
  private async convertSingleTransformToJsonPatch(
    transform: TransformOperation,
    _execution: Execution,
    _evalInstance: Eval
  ): Promise<Operation[]> {
    // Silence unused parameter warnings explicitly
    void _execution;
    void _evalInstance;

    // Values are expected to be resolved by the Engine prior to Mutate execution
    // (both for dedicated Mutate nodes and inline_mutate). Avoid re-resolving here
    // to prevent double template expansion, which can mistakenly evaluate nested
    // {{ ... }} inside serialized JSON payloads.
    const resolvedValue = transform.value;
    const resolvedFrom = transform.from;

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

    return [operation];
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
