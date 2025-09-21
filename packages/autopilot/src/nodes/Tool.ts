/**
 * Tool Class
 *
 * Executable tool node for function calling support.
 * Handles tool execution logic based on tool parameters and input arguments.
 */

import { BaseNode } from './BaseNode';
import type { ToolParams } from '@/types/node-parameters';
import { ValidationResult, ValidationError, ExecutionItem } from '@/types';
import { NodeHandlerOptions } from '@/types/node-handler';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Engine } from '@/engine/Engine';
import type { LLMResponse, LlmMessage, LlmToolCall } from '@/types/llm';

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
      const inputArgs = this.extractToolArguments(inputData);

      // Fallback: if args weren't provided via input, pull them from the last LLM output (execution context)
      const execArgs = this.getArgsFromExecutionContext(params.name);
      const toolArgs = this.mergeArgs(inputArgs, execArgs);

      // Extract tool call ID from the execution context for proper linking
      const toolCallId = this.getToolCallIdFromExecutionContext(params.name);

      // Emit tool_started event
      const eventCallback = this.getOptions()?.eventCallback;
      if (eventCallback) {
        await eventCallback({
          type: 'tool_started',
          timestamp: new Date().toISOString(),
          data: {
            toolName: params.name,
            toolCallId: toolCallId,
            arguments: toolArgs,
          },
        });
      }

      // Use the tool blueprint from parameters (passed via template resolution from Agent)
      if (!params.blueprint) {
        throw new Error(`Tool '${params.name}' missing blueprint parameter`);
      }

      // Execute the tool's blueprint like Workflow does (fresh Engine + Execution)
      const engine = new Engine({ eventCallback: this.getEventCallback() });
      const subExec = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(toolArgs));
      const items = await engine.executeBlueprint(params.blueprint, subExec);
      const result = ExecutionItemUtils.unwrapSingle(items);

      // Emit tool_complete event
      if (eventCallback) {
        const resultData = result && typeof result === 'object' ? (result as Record<string, unknown>) : { value: result };
        await eventCallback({
          type: 'tool_complete',
          timestamp: new Date().toISOString(),
          data: {
            toolName: params.name,
            toolCallId: toolCallId,
            arguments: toolArgs,
            result: resultData,
          },
        });
      }

      return ExecutionItemUtils.wrapSingle(result, input?.[0]);
    } catch (error) {
      // Emit tool_complete event with error
      const eventCallback = this.getOptions()?.eventCallback;
      if (eventCallback) {
        try {
          await eventCallback({
            type: 'tool_complete',
            timestamp: new Date().toISOString(),
            data: {
              toolName: params.name,
              error: error instanceof Error ? error.message : 'Unknown tool error',
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
   */
  private extractToolArguments(inputData: unknown): Record<string, unknown> {
    if (typeof inputData === 'object' && inputData !== null) {
      // If input is an object with tool_call structure
      const input = inputData as Record<string, unknown>;
      if (input.function && typeof input.function === 'object') {
        const functionCall = input.function as Record<string, unknown>;
        if (typeof functionCall.arguments === 'string') {
          try {
            return JSON.parse(functionCall.arguments);
          } catch {
            return {};
          }
        }
      }
      // If input is direct arguments object
      return input;
    }
    // If input is a JSON string of args
    if (typeof inputData === 'string') {
      try {
        const parsed = JSON.parse(inputData);
        if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
    return {};
  }

  /**
   * Fallback: read tool_call arguments from the last LLM output in execution context
   */
  private getArgsFromExecutionContext(toolName: string): Record<string, unknown> {
    const exec = this.getOptions()?.execution;
    if (!exec || !Array.isArray(exec.results)) return {};

    // Walk backwards over results to find the most recent LLM response with tool_calls
    for (let i = exec.results.length - 1; i >= 0; i--) {
      const items = exec.results[i]?.items;
      const firstJson = items?.[0]?.json;
      if (!firstJson || typeof firstJson !== 'object') continue;

      // Narrow shape to partial LLMResponse
      const resp = firstJson as Partial<LLMResponse>;
      const choices = resp.choices;
      if (Array.isArray(choices) && choices[0]?.message) {
        const msg = choices[0].message as LlmMessage;
        const toolCalls = msg.tool_calls as LlmToolCall[] | undefined;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          // Prefer exact tool name match; otherwise use the first
          const match = toolCalls.find((tc) => tc?.function?.name === toolName) ?? toolCalls[0];
          const argStr = match?.function?.arguments;
          if (typeof argStr === 'string') {
            try {
              return JSON.parse(argStr);
            } catch {
              return {};
            }
          } else if (argStr && typeof argStr === 'object') {
            // In case provider returns already-parsed object (rare)
            return argStr as Record<string, unknown>;
          }
        }
      }
    }
    return {};
  }

  /**
   * Merge primary and fallback args (fallback provides defaults)
   */
  private mergeArgs(primary: Record<string, unknown>, fallback: Record<string, unknown>): Record<string, unknown> {
    return { ...fallback, ...primary };
  }

  /**
   * Extract tool call ID from the last LLM output in execution context
   * This links the tool result back to the original tool call
   */
  private getToolCallIdFromExecutionContext(toolName: string): string | undefined {
    const exec = this.getOptions()?.execution;
    if (!exec || !Array.isArray(exec.results)) return undefined;

    // Walk backwards over results to find the most recent LLM response with tool_calls
    for (let i = exec.results.length - 1; i >= 0; i--) {
      const items = exec.results[i]?.items;
      const firstJson = items?.[0]?.json;
      if (!firstJson || typeof firstJson !== 'object') continue;

      // Narrow shape to partial LLMResponse
      const resp = firstJson as Partial<LLMResponse>;
      const choices = resp.choices;
      if (Array.isArray(choices) && choices[0]?.message) {
        const msg = choices[0].message as LlmMessage;
        const toolCalls = msg.tool_calls as LlmToolCall[] | undefined;
        if (Array.isArray(toolCalls) && toolCalls.length > 0) {
          // Find the tool call that matches this tool name
          const match = toolCalls.find((tc) => tc?.function?.name === toolName);
          return match?.id;
        }
      }
    }
    return undefined;
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
