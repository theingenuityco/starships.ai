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

      // Execute the tool based on its name and parameters
      const result = await this.executeToolLogic(params, toolArgs);

      return ExecutionItemUtils.wrapSingle(result, input?.[0]);
    } catch (error) {
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
   * Execute tool logic based on tool name and arguments
   */
  private async executeToolLogic(params: ToolParams, args: Record<string, unknown>): Promise<unknown> {
    const { name } = params;

    // Built-in tools - can be extended with more tools
    switch (name) {
      case 'calculator':
        return this.executeCalculator(args);
      case 'get_current_time':
        return this.getCurrentTime(args);
      case 'echo':
        return this.executeEcho(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Built-in calculator tool
   * Accepts flexible inputs and coerces them to a safe expression string:
   * - { expression: "2 + 3 * 4" }
   * - { equation: "2 + 3 * 4" } or { value: "2 + 3 * 4" }
   * - { a: 2, b: 3, operator: "*" }
   */
  private executeCalculator(args: Record<string, unknown>): unknown {
    // Prefer "expression", but accept common alternates
    let expr: unknown = (args as Record<string, unknown>)?.expression;

    if (expr === undefined) {
      const maybeEq = (args as Record<string, unknown>)?.equation;
      const maybeVal = (args as Record<string, unknown>)?.value;

      if (typeof maybeEq === 'string' || typeof maybeEq === 'number') {
        expr = maybeEq;
      } else if (typeof maybeVal === 'string' || typeof maybeVal === 'number') {
        expr = maybeVal;
      } else {
        const a = (args as Record<string, unknown>)?.a;
        const b = (args as Record<string, unknown>)?.b;
        const op = (args as Record<string, unknown>)?.operator || (args as Record<string, unknown>)?.op;

        if ((typeof a === 'number' || typeof a === 'string') && (typeof b === 'number' || typeof b === 'string')) {
          const operator = typeof op === 'string' && ['+', '-', '*', '/', '%'].includes(op) ? (op as string) : '+';
          expr = `${a} ${operator} ${b}`;
        }
      }
    }

    // Coerce numbers to strings
    if (typeof expr === 'number') {
      expr = String(expr);
    }

    if (typeof expr !== 'string' || expr.trim() === '') {
      throw new Error('Calculator requires a string expression');
    }

    const expression = expr.trim();

    try {
      // Simple evaluation - in production, use a safe math evaluator
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
      if (sanitized !== expression) {
        throw new Error('Invalid characters in expression');
      }

      const result = Function(`"use strict"; return (${sanitized})`)();
      return {
        expression: expression,
        result: result,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new Error(`Calculator error: ${error instanceof Error ? error.message : 'Invalid expression'}`);
    }
  }

  /**
   * Built-in current time tool
   */
  private getCurrentTime(args: Record<string, unknown>): unknown {
    const { timezone = 'UTC', format = 'ISO' } = args;

    const now = new Date();
    let timeString: string;

    if (format === 'ISO') {
      timeString = now.toISOString();
    } else if (format === 'locale') {
      timeString = now.toLocaleString(undefined, { timeZone: timezone as string });
    } else {
      timeString = now.toString();
    }

    return {
      timestamp: timeString,
      timezone: timezone,
      format: format,
      unix: Math.floor(now.getTime() / 1000),
    };
  }

  /**
   * Built-in echo tool for testing
   */
  private executeEcho(args: Record<string, unknown>): unknown {
    return {
      echo: args,
      timestamp: new Date().toISOString(),
    };
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

    // Tool name validation (must be one of supported tools)
    // Skip validation if name contains template syntax (will be resolved at execution time)
    const supportedTools = ['calculator', 'get_current_time', 'echo'];
    const isTemplate = params.name.includes('{{') && params.name.includes('}}');
    if (!isTemplate && !supportedTools.includes(params.name)) {
      errors.push({
        code: 'INVALID_PARAMETERS',
        message: `Unsupported tool '${params.name}'. Supported tools: ${supportedTools.join(', ')}`,
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
