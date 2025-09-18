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
      const toolArgs = this.extractToolArguments(inputData);

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
    return {};
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
   */
  private executeCalculator(args: Record<string, unknown>): unknown {
    const { expression } = args;
    if (typeof expression !== 'string') {
      throw new Error('Calculator requires a string expression');
    }

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
    const supportedTools = ['calculator', 'get_current_time', 'echo'];
    if (!supportedTools.includes(params.name)) {
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
