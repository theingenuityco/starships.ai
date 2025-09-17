/**
 * Transform Node
 *
 * Dedicated node for input->output transformations using JSON Patch operations.
 * Only handles data flow transformations, not state mutations.
 */

import { applyPatch, Operation } from 'fast-json-patch';
import { BaseNode } from './BaseNode';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import type { TransformOperation, TransformParams } from '@/types/node-parameters';
import type { NodeHandlerOptions } from '@/types/node-handler';
import { Eval } from '@/engine/Eval';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { nanoid } from 'nanoid';

export class Transform extends BaseNode<TransformParams> {
  private eval = new Eval();

  constructor(params: TransformParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute transform operations on input data (input->output transformations only)
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();
    if (!params.transforms || params.transforms.length === 0) {
      return input || ExecutionItemUtils.wrapSingle({ transformsApplied: 0, operations: [] });
    }

    // Transform node now only handles input data transformations
    if (!input || input.length === 0) {
      throw this.handleExecutionError(
        new Error('Transform node requires input data for input->output transformations. Use Mutate node for state mutations.')
      );
    }

    try {
      // Transform the input data
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      const transformedData = await this.transformInputData(inputData, params.transforms);
      return ExecutionItemUtils.wrapSingle(transformedData, input[0]);
    } catch (error) {
      throw this.handleExecutionError(error, 'Transform execution failed');
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
    // Create minimal context for template resolution using input data
    const context = this.createMinimalContext(currentData);

    // Resolve template expressions in the value with current data as input
    let resolvedValue = transform.value;
    if (transform.value !== undefined) {
      resolvedValue = await this.eval.evaluateExpression(String(transform.value), context);
    }

    // Resolve template expressions in the from path
    let resolvedFrom = transform.from;
    if (transform.from !== undefined) {
      resolvedFrom = (await this.eval.evaluateExpression(String(transform.from), context)) as string;
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
   * Validate transform operations for input data transformations
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Check if transforms are provided
    if (!params.transforms || params.transforms.length === 0) {
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
    const validation = this.validateTransforms(params.transforms);
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
   * Validate a single transform operation for input data transformations
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
    }
    // Note: For input data transformations, paths don't need to start with "/state"

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
