/**
 * Tool Class
 *
 * Executable tool node for function calling support.
 * Lightweight wrapper that executes the configured blueprint with provided arguments.
 */

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError, ExecutionItem, Execution } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { EngineConfig } from '@/engine/Engine';
import { RunnerFactory } from '@/runner/RunnerFactory';
import type { Runner } from '@/runner/Runner';
import type { Blueprint } from '@/types/blueprint';

export class Tool extends BaseNode<ToolParams> {
  constructor(params: ToolParams, options?: NodeHandlerOptions) {
    super(params, options);
  }

  /**
   * Execute the tool with provided arguments
   */
  async execute(input?: ExecutionItem[]): Promise<ExecutionItem[]> {
    const params = this.getParams();

    // Will hold nested execution context; populated before running the sub-blueprint
    let subExec: Execution | undefined;
    // Root-level event depth matches the parent execution depth (top-level = 0)
    const parentDepth = this.getOptions()?.execution?.depth ?? 0;
    const eventDepth = parentDepth;

    try {
      // Extract tool arguments from input
      const inputData = ExecutionItemUtils.unwrapSingle(input);
      const toolArgs = this.extractToolArguments(inputData);

      // Emit tool_started event
      const eventCallback = this.getOptions()?.eventCallback;
      if (eventCallback) {
        await eventCallback({
          type: 'tool_started',
          timestamp: new Date().toISOString(),
          executionDepth: eventDepth,
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
      subExec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(toolArgs), parentExecution);

      const engineConfig: EngineConfig & Record<string, unknown> = {
        ...(this.getOptions()?.runnerConfig || {}),
        eventCallback: this.getEventCallback(),
        failOnNodeError: true,
        // Propagate runner override to nested engines; Tool.execute() will only use it at depth===0
        runner: this.getOptions()?.runner,
        onCancel: this.getOptions()?.onCancel,
        runtimeEnv: this.getOptions()?.runtimeEnv,
        hostRuntime: this.getOptions()?.hostRuntime,
      };
      const depth = subExec.depth ?? 0;
      const selectedRunner: Runner =
        depth === 0 ? (this.getOptions()?.runner ?? RunnerFactory.getTopLevelRunner(depth)) : RunnerFactory.getTopLevelRunner(depth);

      // If the runner supports cancellation controllers, prefer that path so hosts can stop execution.
      type RunnerController = { promise: Promise<ExecutionItem[]>; cancel: () => void };
      type RunnerWithController = Runner & {
        runWithController: (bp: Blueprint, exec: Execution, cfg?: EngineConfig) => RunnerController;
      };
      const runnerWithController = selectedRunner as Runner & { runWithController?: (bp: Blueprint, exec: Execution, cfg?: EngineConfig) => RunnerController };
      const hasRunWithController = typeof runnerWithController.runWithController === 'function';
      
      let items: ExecutionItem[];
      if (hasRunWithController && runnerWithController.runWithController) {
        try {
          const ctl = runnerWithController.runWithController(params.blueprint, subExec, engineConfig);
          items = await ctl.promise;
        } catch (err) {
          // If the error is an abort/cancellation error, re-throw it to stop tool execution
          const isAbortError =
            (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted') || err.message.includes('cancelled'))) ||
            (err instanceof DOMException && err.name === 'AbortError') ||
            (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') ||
            String(err).includes('aborted') ||
            String(err).includes('cancelled');
          
          if (isAbortError) {
            console.log('[STOP-DEBUG] Tool.execute: Tool execution was cancelled', {
              toolName: params.name,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err;
          }
          throw err;
        }
      } else {
        items = await selectedRunner.run(params.blueprint, subExec, engineConfig);
      }
      const result = ExecutionItemUtils.unwrapSingle(items);

      // Emit tool_complete event
      if (eventCallback) {
        const resultData = result && typeof result === 'object' ? (result as Record<string, unknown>) : { value: result };
        await eventCallback({
          type: 'tool_complete',
          timestamp: new Date().toISOString(),
          executionDepth: eventDepth,
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
      // Check if this is a cancellation/abort error - if so, don't emit tool_complete
      // The conversation was stopped, so we shouldn't process any tool results
      const isAbortError =
        (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted') || error.message.includes('cancelled') || error.message.includes('stopped'))) ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') ||
        String(error).includes('aborted') ||
        String(error).includes('cancelled') ||
        String(error).includes('stopped') ||
        String(error).includes('Remote runner execution cancelled');
      
      if (isAbortError) {
        console.log('[STOP-DEBUG] Tool.execute: Tool was cancelled, not emitting tool_complete event', {
          toolName: params.name,
          error: error instanceof Error ? error.message : String(error),
        });
        // Re-throw the error without emitting tool_complete
        throw error;
      }
      
      // Emit tool_complete event with error and structured result payload for consumers
      const eventCallback = this.getOptions()?.eventCallback;
      const errorMessage = error instanceof Error ? error.message : 'Unknown tool error';

      // Build rich error details so the LLM/consumers can use actionable diagnostics
      const parentDepth = this.getOptions()?.execution?.depth ?? 0;
      const depth = subExec?.depth ?? parentDepth + 1;
      const runnerKind = depth === 0 ? 'child' : 'local';
      const details = {
        name: error instanceof Error ? error.name : 'Error',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        cause:
          error && typeof error === 'object' && 'cause' in (error as Record<string, unknown>)
            ? (error as Record<string, unknown>).cause
            : undefined,
        nodeRef: subExec?.currentNodeRef,
        depth,
        runner: runnerKind,
        toolName: params.name,
        toolCallId: params.toolCallId,
        timestamp: new Date().toISOString(),
      };

      // Prepare structured error payload once so both events and return value are consistent
      const inputItem = input?.[0];
      const errorPayload = { ok: false, error: errorMessage, details };

      if (eventCallback) {
        try {
          await eventCallback({
            type: 'tool_complete',
            timestamp: new Date().toISOString(),
            executionDepth: eventDepth,
            data: {
              toolName: params.name,
              toolCallId: params.toolCallId,
              error: errorMessage,
              // Provide structured details on error as well (same shape as success 'result')
              result: errorPayload,
            },
          });
        } catch {
          // Ignore callback errors to avoid masking the original error
        }
      }

      // Return an ExecutionItem that marks error and carries structured json payload
      return [
        {
          json: errorPayload,
          error: errorMessage,
          pairedItem: inputItem?.pairedItem || { item: 0 },
          binary: inputItem?.binary,
        },
      ];
    }
  }

  /**
   * Extract tool arguments from upstream input
   * Accepted inputs:
   * - Plain object (already parsed args) -> passthrough
   * - Missing/empty arguments (undefined, null, empty string, or whitespace-only string) -> {}
   * Any other input results in an error. Tools do not parse or derive arguments.
   */
  private extractToolArguments(inputData: unknown): Record<string, unknown> {
    // Allow no-argument calls by returning an empty object
    if (inputData == null) {
      return {};
    }
    if (typeof inputData === 'string') {
      if (inputData.trim().length === 0) {
        return {};
      }
      throw new Error('Tool arguments must be provided as a plain object input.');
    }
    if (typeof inputData === 'object' && !Array.isArray(inputData)) {
      return inputData as Record<string, unknown>;
    }
    throw new Error('Tool arguments must be provided as a plain object input.');
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
