/**
 * Tool Execution Helper
 *
 * Utilities for actually executing tool blueprints and testing their functionality
 * rather than just validating their structure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ToolParams } from '@starships/autopilot';

/**
 * Simple tool executor that can run code nodes for testing
 */
export class ToolExecutor {
  constructor(private tool: ToolParams) {}

  /**
   * Execute a tool with given input parameters
   */
  async execute(input: Record<string, unknown>): Promise<unknown> {
    const { nodes } = this.tool.blueprint;

    // For simple tools, find and execute code nodes directly
    const codeNode = nodes.find((n) => n.type === 'code');
    if (codeNode) {
      return this.executeCodeNode(codeNode as any, input);
    }

    // For tools without code nodes (like echo), process the end node
    const endNode = nodes.find((n) => n.type === 'end');
    if (endNode) {
      return this.processEndNode(endNode as any, input);
    }

    throw new Error('No executable nodes found in tool');
  }

  /**
   * Execute a code node with the given input
   */
  private executeCodeNode(node: { ref: string; parameters?: { code?: string } }, input: Record<string, unknown>): unknown {
    const code = node.parameters?.code;
    if (!code) {
      throw new Error(`No code found in node ${node.ref}`);
    }

    try {
      // Create a function that has access to the input
      const func = new Function('input', code);

      // Execute the code
      const result = func(input);
      return result;
    } catch (error: any) {
      throw new Error(`Code execution failed: ${error.message}`);
    }
  }

  /**
   * Process end node output using template expressions
   */
  private processEndNode(node: any, input: Record<string, unknown>): unknown {
    const output = node.parameters?.output;
    if (!output) {
      return input;
    }

    // If it's a template string, handle it simply
    if (typeof output === 'string' && output === '{{ $input() }}') {
      return input;
    }

    // If it's an object with template expressions, process each property
    if (typeof output === 'object' && output !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(output)) {
        if (typeof value === 'string') {
          if (value.includes('$lastOutputOf("__initial__")[0].json.message')) {
            result[key] = input.message;
          } else if (value.includes('$lastOutputOf("__initial__")[0].json.metadata')) {
            result[key] = input.metadata || {};
          } else if (value.includes('new Date().toISOString()')) {
            result[key] = new Date().toISOString();
          } else {
            result[key] = value;
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    }

    return output;
  }
}

/**
 * Test scenarios for tools
 */
export interface ToolTestScenario {
  name: string;
  input: Record<string, unknown>;
  expectSuccess: boolean;
  expectedError?: string;
  validate?: (output: unknown) => boolean;
}

/**
 * Test runner for tools with common patterns
 */
export class ToolTestRunner {
  private executor: ToolExecutor;

  constructor(private tool: ToolParams) {
    this.executor = new ToolExecutor(tool);
  }

  /**
   * Test a single scenario
   */
  async testScenario(scenario: ToolTestScenario): Promise<{
    name: string;
    passed: boolean;
    error?: string;
    output?: unknown;
  }> {
    try {
      const output = await this.executor.execute(scenario.input);

      if (!scenario.expectSuccess) {
        return {
          name: scenario.name,
          passed: false,
          error: 'Expected error but execution succeeded',
          output,
        };
      }

      const validationPassed = scenario.validate ? scenario.validate(output) : true;

      return {
        name: scenario.name,
        passed: validationPassed,
        output,
        error: validationPassed ? undefined : 'Validation failed',
      };
    } catch (error: any) {
      if (scenario.expectSuccess) {
        return {
          name: scenario.name,
          passed: false,
          error: error.message,
        };
      }

      const messageMatch = scenario.expectedError ? error.message.includes(scenario.expectedError) : true;

      return {
        name: scenario.name,
        passed: messageMatch,
        error: error.message,
      };
    }
  }

  /**
   * Test multiple scenarios
   */
  async testScenarios(scenarios: ToolTestScenario[]): Promise<
    Array<{
      name: string;
      passed: boolean;
      error?: string;
      output?: unknown;
    }>
  > {
    const results = [];

    for (const scenario of scenarios) {
      const result = await this.testScenario(scenario);
      results.push(result);
    }

    return results;
  }

  /**
   * Quick test for valid input
   */
  async testValidInput(input: Record<string, unknown>, validate?: (output: unknown) => boolean): Promise<unknown> {
    const output = await this.executor.execute(input);
    if (validate && !validate(output)) {
      throw new Error('Output validation failed');
    }
    return output;
  }

  /**
   * Quick test for invalid input that should throw
   */
  async testInvalidInput(input: Record<string, unknown>, expectedError?: string): Promise<void> {
    try {
      await this.executor.execute(input);
      throw new Error('Expected execution to fail but it succeeded');
    } catch (error: any) {
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(`Expected error containing "${expectedError}" but got: ${error.message}`);
      }
    }
  }
}

/**
 * Common test scenarios for different tool types
 */
export const CommonToolScenarios = {
  calculator: [
    {
      name: 'simple addition',
      input: { expression: '2+3' },
      expectSuccess: true,
      validate: (output: any) => output?.result === 5,
    },
    {
      name: 'simple multiplication',
      input: { expression: '4*5' },
      expectSuccess: true,
      validate: (output: any) => output?.result === 20,
    },
    {
      name: 'empty expression',
      input: { expression: '' },
      expectSuccess: false,
      expectedError: 'Expression is required',
    },
    {
      name: 'invalid characters',
      input: { expression: '2+eval("alert(1)")' },
      expectSuccess: false,
      expectedError: 'invalid characters',
    },
  ],

  echo: [
    {
      name: 'simple message',
      input: { message: 'Hello, world!' },
      expectSuccess: true,
      validate: (output: any) => output?.message === 'Hello, world!',
    },
    {
      name: 'message with metadata',
      input: { message: 'Test', metadata: { key: 'value' } },
      expectSuccess: true,
      validate: (output: any) => output?.message === 'Test' && output?.metadata?.key === 'value',
    },
    {
      name: 'missing message',
      input: {},
      expectSuccess: true, // Echo tool should handle this gracefully
      validate: (output: any) => output !== null,
    },
  ],

  time: [
    {
      name: 'default time format',
      input: {},
      expectSuccess: true,
      validate: (output: any) => typeof output?.currentTime === 'string',
    },
    {
      name: 'UTC timezone',
      input: { timezone: 'UTC', format: 'ISO' },
      expectSuccess: true,
      validate: (output: any) => output?.timezone === 'UTC' && typeof output?.currentTime === 'string',
    },
    {
      name: 'timestamp format',
      input: { format: 'timestamp' },
      expectSuccess: true,
      validate: (output: any) => typeof output?.timestamp === 'number',
    },
  ],
};
