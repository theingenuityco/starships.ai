/**
 * Tool Class
 *
 * Executable tool node for function calling support.
 * Lightweight wrapper that executes the configured blueprint with provided arguments.
 */

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { EngineConfig } from '@/engine/Engine';
import { LocalRunner } from '@/runner/LocalRunner';
import { ChildProcessRunner } from '@/runner/ChildProcessRunner';

export class Tool extends BaseNode<ToolParams> {
  constructor(params: ToolParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the tool with provided arguments
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();

    try {
      // Extract tool arguments from input
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      // console.log(`[TOOL NODE ${params.name}] Input data:`, JSON.stringify(inputData));
      const toolArgs = this.extractToolArguments(inputData);
      // console.log(`[TOOL NODE ${params.name}] Extracted tool args:`, JSON.stringify(toolArgs));

      // Emit tool_started event
      const eventCallback = this.getOptions()?.eventCallback;
      if (eventCallback) {
        await eventCallback({
          type: 'tool_started',
          timestamp: new Date().toISOString(),
          data: {
            toolName: params.name,
            arguments: toolArgs,
            toolCallId: params.toolCallId,
          },
        });
      }

      // Use the tool blueprint from parameters
      if (!params.blueprint) {
        throw new Error(`Tool '${params.name}' missing blueprint parameter`);
      }

      // Execute the tool's blueprint using depth-aware Runner selection
      // IMPORTANT: propagate parent execution to set correct execution.depth (nested = depth>0)
      const parentExecution = this.getOptions()?.execution;
      // console.log(`[TOOL NODE ${params.name}] Creating execution with toolArgs:`, JSON.stringify(toolArgs));
      const subExec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(toolArgs), parentExecution);

      const engineConfig: EngineConfig = {
        eventCallback: this.getEventCallback(),
        failOnNodeError: true,
        secureEnv: this.getOptions()?.secureEnv,
      };
      const depth = subExec.depth ?? 0;
      const runner = depth === 0 ? new ChildProcessRunner() : new LocalRunner();
      const items = await runner.run(params.blueprint, subExec, engineConfig);
      const result = ExecutionItemUtils.unwrapSingle(items);

      // Emit tool_complete event
      if (eventCallback) {
        const resultData = result && typeof result === 'object' ? (result as Record<string, unknown>) : { value: result };
        await eventCallback({
          type: 'tool_complete',
          timestamp: new Date().toISOString(),
          data: {
            toolName: params.name,
            arguments: toolArgs,
            result: resultData,
            toolCallId: params.toolCallId,
          },
        });
      }

      return ExecutionItemUtils.wrapSingle(result, input?.[0]);
    } catch (error) {
      // Emit tool_complete event with error
      const eventCallback = this.getOptions()?.eventCallback;
      const errorMessage = error instanceof Error ? error.message : 'Unknown tool error';
      if (eventCallback) {
        try {
          await eventCallback({
            type: 'tool_complete',
            timestamp: new Date().toISOString(),
            data: {
              toolName: params.name,
              error: errorMessage,
              toolCallId: params.toolCallId,
            },
          });
        } catch {
          // Ignore callback errors to avoid masking the original error
        }
      }
      throw this.handleExecutionError(error, `Tool '${params.name}' execution failed`);
    }
  }

  /**
   * Extract tool arguments from input data
   * Tools should receive properly formatted arguments from their callers
   */
  private extractToolArguments(inputData: unknown): Record<string, unknown> {
    // Expect object input
    if (typeof inputData === 'object' && inputData !== null) {
      return inputData as Record<string, unknown>;
    }
    
    // Default to empty object for tools that don't need input
    return {};
  }

  /**
   * Validate tool configuration
   */
  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const params = this.getParams();

    // Required fields validation
    const nameError = this.validateRequiredField(params.name, 'Tool name');
    if (nameError) errors.push(nameError);

    const descriptionError = this.validateRequiredField(params.description, 'Tool description');
    if (descriptionError) errors.push(descriptionError);

    // Parameters validation
    if (!params.parameters || typeof params.parameters !== 'object') {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: 'Tool parameters must be defined as an object',
      });
    } else {
      if (params.parameters.type !== 'object') {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'Tool parameters type must be "object"',
        });
      }

      if (!params.parameters.properties || typeof params.parameters.properties !== 'object') {
        errors.push({
          code: 'INVALID_PARAMETERS',
          message: 'Tool parameters must define properties',
        });
      }
    }

    // Blueprint is required for all Tool nodes
    if (!params.blueprint) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Tool blueprint is required',
      });
    } else {
      const nodes = params.blueprint.nodes || [];
      const hasStartNode = Array.isArray(nodes) && nodes.some((n) => n.type === 'start');
      if (!hasStartNode) {
        errors.push({
          code: 'MISSING_START_NODE',
          message: 'Tool blueprint must have a start node',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
