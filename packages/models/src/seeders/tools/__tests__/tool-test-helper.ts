/**
 * Tool Test Helper
 * Comprehensive testing utilities for end-to-end tool validation using autopilot
 */

import { Tool } from '@starships/autopilot/src/nodes/Tool';
import { Engine } from '@starships/autopilot/src/engine/Engine';
import { ExecutionItemUtils } from '@starships/autopilot/src/utils/ExecutionItemUtils';
import type { ToolParams, Blueprint } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';
import type { ExecutionItem } from '@starships/autopilot';

/**
 * Test result interfaces
 */
export interface ToolTestResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface ExecutionTestResult {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

export interface ValidationTestResult {
  structureValid: boolean;
  parametersValid: boolean;
  blueprintValid: boolean;
  templateValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Mock environment for testing tools that require external dependencies
 */
export class MockSecureEnv {
  public env: Record<string, string> = {};

  constructor(initialEnv: Record<string, string> = {}) {
    this.env = { ...initialEnv };
  }

  get(key: string): string | undefined {
    return this.env[key];
  }

  set(key: string, value: string): void {
    this.env[key] = value;
  }

  setMultiple(envVars: Record<string, string>): void {
    Object.assign(this.env, envVars);
  }

  clear(): void {
    this.env = {};
  }
}

/**
 * Main tool test helper class
 */
export class ToolTestHelper {
  private toolParams: ToolParams;
  private toolTemplate?: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>;
  private toolName: string;
  private mockEnv: MockSecureEnv;
  private eventLogs: unknown[] = [];

  constructor(
    toolParams: ToolParams,
    toolTemplate?: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
    toolName?: string
  ) {
    this.toolParams = toolParams;
    this.toolTemplate = toolTemplate;
    this.toolName = toolName || toolParams.name;
    this.mockEnv = new MockSecureEnv();
  }

  /**
   * Set up mock environment variables
   */
  setMockEnv(envVars: Record<string, string>): void {
    this.mockEnv.setMultiple(envVars);
  }

  /**
   * Clear event logs
   */
  clearEventLogs(): void {
    this.eventLogs = [];
  }

  /**
   * Get event logs
   */
  getEventLogs(): unknown[] {
    return [...this.eventLogs];
  }

  /**
   * Event callback for capturing events during execution
   */
  private eventCallback = async (event: unknown): Promise<void> => {
    this.eventLogs.push(event);
  };

  /**
   * Test tool structure and metadata
   */
  testToolStructure(): ToolTestResult {
    const errors: string[] = [];

    // Required fields
    if (!this.toolParams.name || typeof this.toolParams.name !== 'string') {
      errors.push('Tool name is required and must be a string');
    }

    if (!this.toolParams.description || typeof this.toolParams.description !== 'string') {
      errors.push('Tool description is required and must be a string');
    }

    if (!this.toolParams.parameters || typeof this.toolParams.parameters !== 'object') {
      errors.push('Tool parameters are required and must be an object');
    }

    if (!this.toolParams.blueprint || typeof this.toolParams.blueprint !== 'object') {
      errors.push('Tool blueprint is required and must be an object');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Test parameter schema validation
   */
  testParameterSchema(): ToolTestResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const params = this.toolParams.parameters;

    if (!params) {
      errors.push('Parameters object is missing');
      return { valid: false, errors };
    }

    // Check parameter structure
    if (params.type !== 'object') {
      errors.push('Parameters type must be "object"');
    }

    if (!params.properties || typeof params.properties !== 'object') {
      errors.push('Parameters must define properties');
    } else {
      // Check property definitions
      for (const [propName, propDef] of Object.entries(params.properties)) {
        if (typeof propDef !== 'object') {
          errors.push(`Property ${propName} definition must be an object`);
          continue;
        }

        const prop = propDef as unknown as Record<string, unknown>;
        if (!prop.type) {
          warnings.push(`Property ${propName} should have a type`);
        }

        if (!prop.description) {
          warnings.push(`Property ${propName} should have a description`);
        }
      }
    }

    // Check required fields
    if (params.required && !Array.isArray(params.required)) {
      errors.push('Required field must be an array');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Test blueprint structure and connectivity
   */
  testBlueprintStructure(): ToolTestResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    const blueprint = this.toolParams.blueprint;

    if (!blueprint) {
      errors.push('Blueprint is missing');
      return { valid: false, errors };
    }

    // Check nodes
    if (!Array.isArray(blueprint.nodes)) {
      errors.push('Blueprint nodes must be an array');
      return { valid: false, errors };
    }

    // Check edges
    if (!Array.isArray(blueprint.edges)) {
      errors.push('Blueprint edges must be an array');
      return { valid: false, errors };
    }

    // Validate node structure
    const nodeRefs = new Set<string>();
    let hasStart = false;
    let hasEnd = false;

    for (const node of blueprint.nodes) {
      if (!node.ref) {
        errors.push('Node missing ref');
        continue;
      }

      if (nodeRefs.has(node.ref)) {
        errors.push(`Duplicate node ref: ${node.ref}`);
      }
      nodeRefs.add(node.ref);

      if (!node.type) {
        errors.push(`Node ${node.ref} missing type`);
      }

      if (node.type === 'start') hasStart = true;
      if (node.type === 'end') hasEnd = true;
    }

    if (!hasStart) errors.push('Blueprint must have a start node');
    if (!hasEnd) errors.push('Blueprint must have an end node');

    // Validate edge connectivity
    for (const edge of blueprint.edges) {
      if (!edge.from || !edge.to) {
        errors.push(`Edge ${edge.ref || '?'} missing from/to`);
        continue;
      }

      if (!nodeRefs.has(edge.from)) {
        errors.push(`Edge references unknown from node: ${edge.from}`);
      }

      if (!nodeRefs.has(edge.to)) {
        errors.push(`Edge references unknown to node: ${edge.to}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Test template consistency (if template is provided)
   */
  testTemplateConsistency(): ToolTestResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.toolTemplate) {
      warnings.push('No template provided for consistency check');
      return { valid: true, errors, warnings };
    }

    // Check consistency between toolParams and template
    if (this.toolParams.name !== this.toolTemplate.name) {
      errors.push('Tool name inconsistency between params and template');
    }

    if (this.toolParams.description !== this.toolTemplate.description) {
      errors.push('Tool description inconsistency between params and template');
    }

    // Check template specific fields
    if (!this.toolTemplate.slug) {
      errors.push('Template missing slug');
    }

    if (!this.toolTemplate.category) {
      errors.push('Template missing category');
    }

    if (typeof this.toolTemplate.requiresApiKey !== 'boolean') {
      warnings.push('Template should specify requiresApiKey boolean');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Execute tool with given input and return results
   */
  async executeToolDirect(input: unknown): Promise<ExecutionTestResult> {
    const startTime = Date.now();

    try {
      const tool = new Tool(this.toolParams, {
        eventCallback: this.eventCallback,
        secureEnv: this.mockEnv.env,
      });

      const inputItem: ExecutionItem[] = ExecutionItemUtils.wrapSingle(input);
      const result = await tool.execute(inputItem);
      const unwrapped = ExecutionItemUtils.unwrapSingle(result);

      return {
        success: true,
        result: unwrapped,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute tool through autopilot engine (full end-to-end test)
   */
  async executeToolViaEngine(input: unknown, mockEnv?: Record<string, string>): Promise<ExecutionTestResult> {
    const startTime = Date.now();

    try {
      if (mockEnv) {
        this.setMockEnv(mockEnv);
      }

      const engine = new Engine({
        eventCallback: this.eventCallback,
        failOnNodeError: true,
        secureEnv: this.mockEnv.env,
      });

      const execution = ExecutionItemUtils.createExecution(ExecutionItemUtils.wrapSingle(input));
      const results = await engine.executeBlueprint(this.toolParams.blueprint, execution);
      const result = ExecutionItemUtils.unwrapSingle(results);

      return {
        success: true,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Run comprehensive validation tests
   */
  runAllValidationTests(): ValidationTestResult {
    const structureResult = this.testToolStructure();
    const parametersResult = this.testParameterSchema();
    const blueprintResult = this.testBlueprintStructure();
    const templateResult = this.testTemplateConsistency();

    const allErrors = [...structureResult.errors, ...parametersResult.errors, ...blueprintResult.errors, ...templateResult.errors];

    const allWarnings = [
      ...(structureResult.warnings || []),
      ...(parametersResult.warnings || []),
      ...(blueprintResult.warnings || []),
      ...(templateResult.warnings || []),
    ];

    return {
      structureValid: structureResult.valid,
      parametersValid: parametersResult.valid,
      blueprintValid: blueprintResult.valid,
      templateValid: templateResult.valid,
      errors: allErrors,
      warnings: allWarnings,
    };
  }
}

/**
 * Common test data for tool testing
 */
export class CommonToolTestData {
  static readonly VALID_CALCULATOR_INPUT = {
    expression: '2 + 3 * 4',
  };

  static readonly VALID_ECHO_INPUT = {
    message: 'Hello, tools!',
    metadata: { test: true },
  };

  static readonly VALID_TIME_INPUT = {
    timezone: 'UTC',
    format: 'ISO',
  };

  static readonly MOCK_API_ENV = {
    BASE_URL: 'https://api.test.com',
    AUTH_TOKEN: 'mock-auth-token',
    STARSHIP_ID: 'test-starship-123',
  };

  static readonly VALID_BLUEPRINT = {
    nodes: [
      { ref: 'start_1', type: 'start', name: 'Start', description: '', parameters: {} },
      { ref: 'end_1', type: 'end', name: 'End', description: '', parameters: {} },
    ],
    edges: [{ ref: 'e1', from: 'start_1', to: 'end_1' }],
    metadata: {},
  };
}

/**
 * Custom Jest matchers for tool testing
 */
export const ToolMatchers = {
  toHaveValidToolStructure(received: ToolParams) {
    const helper = new ToolTestHelper(received);
    const result = helper.testToolStructure();

    return {
      message: () => `Expected tool to have valid structure, but found errors: ${result.errors.join(', ')}`,
      pass: result.valid,
    };
  },

  toHaveValidBlueprint(received: Blueprint) {
    const mockToolParams: ToolParams = {
      name: 'test',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      blueprint: received,
    };

    const helper = new ToolTestHelper(mockToolParams);
    const result = helper.testBlueprintStructure();

    return {
      message: () => `Expected blueprint to be valid, but found errors: ${result.errors.join(', ')}`,
      pass: result.valid,
    };
  },
};
