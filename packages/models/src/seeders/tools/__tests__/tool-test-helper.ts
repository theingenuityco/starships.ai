/**
 * Tool Test Helper Utilities
 *
 * Provides common test utilities and patterns for testing Daedalus tools,
 * including validation of tool structure, blueprint validation, and parameter testing.
 */

import type { ToolParams, Edge } from '@starships/autopilot';
import type { ToolTemplateModel } from '@starships/protocol';

/**
 * Common test data patterns for tools
 */
export interface ToolTestData {
  validInputs: Array<{
    params: Record<string, unknown>;
    description: string;
    expectedOutput?: unknown;
  }>;
  invalidInputs: Array<{
    params: Record<string, unknown>;
    expectedError: string;
    description: string;
  }>;
  blueprintTests: Array<{
    description: string;
    expectedNodes: string[];
    expectedEdges: number;
  }>;
}

/**
 * Tool test suite helper
 */
export class ToolTestHelper {
  constructor(
    private tool: ToolParams,
    private toolTemplate: Omit<ToolTemplateModel, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
    private toolName: string
  ) {}

  /**
   * Test tool structure and metadata
   */
  testToolStructure() {
    const results = [];

    // Test basic tool structure
    results.push({
      description: 'should have required tool properties',
      hasName: typeof this.tool.name === 'string' && this.tool.name.length > 0,
      hasDescription: typeof this.tool.description === 'string' && this.tool.description.length > 0,
      hasParameters: typeof this.tool.parameters === 'object' && this.tool.parameters !== null,
      hasBlueprint: typeof this.tool.blueprint === 'object' && this.tool.blueprint !== null,
    });

    // Test template structure
    results.push({
      description: 'should have required template properties',
      hasSlug: typeof this.toolTemplate.slug === 'string' && this.toolTemplate.slug.length > 0,
      hasCategory: typeof this.toolTemplate.category === 'string' && this.toolTemplate.category.length > 0,
      hasExampleUsage: typeof this.toolTemplate.exampleUsage === 'string' && this.toolTemplate.exampleUsage.length > 0,
      hasRequiresApiKey: typeof this.toolTemplate.requiresApiKey === 'boolean',
      hasConfigurationFields: Array.isArray(this.toolTemplate.configurationFields),
    });

    return results;
  }

  /**
   * Test parameter schema validation
   */
  testParameterSchema() {
    const results = [];
    const { parameters } = this.tool;

    // Test parameter structure
    results.push({
      description: 'should have valid parameter schema',
      isObject: parameters.type === 'object',
      hasProperties: typeof parameters.properties === 'object',
      hasRequired: Array.isArray(parameters.required) || parameters.required === undefined,
    });

    // Test individual properties
    if (parameters.properties) {
      const properties = parameters.properties as Record<string, unknown>;
      Object.entries(properties).forEach(([key, prop]) => {
        results.push({
          description: `should have valid property definition for ${key}`,
          property: key,
          hasType: typeof (prop as Record<string, unknown>)?.type === 'string',
          hasDescription: typeof (prop as Record<string, unknown>)?.description === 'string',
          isValid: this.validatePropertyDefinition(prop as Record<string, unknown>),
        });
      });
    }

    return results;
  }

  /**
   * Test blueprint structure and validation
   */
  testBlueprintStructure() {
    const results = [];
    const { blueprint } = this.tool;

    // Test basic blueprint structure
    results.push({
      description: 'should have valid blueprint structure',
      hasNodes: Array.isArray(blueprint.nodes),
      hasEdges: Array.isArray(blueprint.edges),
      hasMetadata: typeof blueprint.metadata === 'object',
      nodeCount: blueprint.nodes?.length || 0,
      edgeCount: blueprint.edges?.length || 0,
    });

    // Test node structure
    if (blueprint.nodes) {
      blueprint.nodes.forEach((node, index) => {
        results.push({
          description: `should have valid node structure at index ${index}`,
          nodeIndex: index,
          hasRef: typeof node.ref === 'string',
          hasType: typeof node.type === 'string',
          hasName: typeof node.name === 'string',
          hasValidType: this.validateNodeType(node.type),
          node: node.ref,
        });
      });
    }

    // Test edge structure
    if (blueprint.edges) {
      blueprint.edges.forEach((edge: Edge, index: number) => {
        const nodeRefs = blueprint.nodes?.map((n) => n.ref) || [];
        results.push({
          description: `should have valid edge structure at index ${index}`,
          edgeIndex: index,
          hasRef: typeof edge.ref === 'string',
          hasFrom: typeof edge.from === 'string',
          hasTo: typeof edge.to === 'string',
          fromExists: nodeRefs.includes(edge.from),
          toExists: nodeRefs.includes(edge.to),
          edge: edge.ref,
        });
      });
    }

    return results;
  }

  /**
   * Test start and end nodes presence
   */
  testStartEndNodes() {
    const { nodes } = this.tool.blueprint;
    const startNodes = nodes?.filter((n) => n.type === 'start') || [];
    const endNodes = nodes?.filter((n) => n.type === 'end') || [];

    return {
      description: 'should have proper start and end nodes',
      hasStartNode: startNodes.length > 0,
      hasEndNode: endNodes.length > 0,
      startNodeCount: startNodes.length,
      endNodeCount: endNodes.length,
      startNodes: startNodes.map((n) => n.ref),
      endNodes: endNodes.map((n) => n.ref),
    };
  }

  /**
   * Test connectivity (all nodes should be reachable)
   */
  testConnectivity() {
    const { nodes, edges } = this.tool.blueprint;

    if (!nodes || !edges) {
      return {
        description: 'cannot test connectivity without nodes and edges',
        isConnected: false,
        error: 'Missing nodes or edges',
      };
    }

    const nodeRefs = nodes.map((n) => n.ref);
    const startNodes = nodes.filter((n) => n.type === 'start');

    if (startNodes.length === 0) {
      return {
        description: 'cannot test connectivity without start node',
        isConnected: false,
        error: 'No start node found',
      };
    }

    // Simple reachability check from start nodes
    const visited = new Set<string>();
    const queue = startNodes.map((n) => n.ref);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);

      // Find all nodes reachable from current
      edges
        .filter((e: Edge) => e.from === current)
        .forEach((e: Edge) => {
          if (!visited.has(e.to)) {
            queue.push(e.to);
          }
        });
    }

    const unreachableNodes = nodeRefs.filter((ref) => !visited.has(ref));

    return {
      description: 'should have all nodes reachable from start',
      isConnected: unreachableNodes.length === 0,
      reachableCount: visited.size,
      totalNodes: nodeRefs.length,
      unreachableNodes,
    };
  }

  /**
   * Validate property definition
   */
  private validatePropertyDefinition(prop: Record<string, unknown>): boolean {
    const requiredFields = ['type', 'description'];
    return requiredFields.every((field) => typeof prop[field] === 'string');
  }

  /**
   * Validate node type
   */
  private validateNodeType(type: string): boolean {
    const validTypes = [
      'start',
      'end',
      'agent',
      'workflow',
      'http_request',
      'llm',
      'user_prompt',
      'conditional',
      'transform',
      'mutate',
      'tool',
      'code',
    ];
    return validTypes.includes(type);
  }

  /**
   * Mock execution environment for testing code nodes
   */
  createMockExecutionContext(input: Record<string, unknown> = {}) {
    return {
      input,
      env: (key: string) => process.env[key],
      state: {},
      $lastOutputOf: () => [{ json: {} }],
      $input: () => input,
    };
  }

  /**
   * Test template consistency with tool
   */
  testTemplateConsistency() {
    return {
      description: 'should have consistent template and tool data',
      nameMatch: this.tool.name === this.toolTemplate.name,
      descriptionMatch: this.tool.description === this.toolTemplate.description,
      parametersMatch: JSON.stringify(this.tool.parameters) === JSON.stringify(this.toolTemplate.parameters),
      blueprintMatch: JSON.stringify(this.tool.blueprint) === JSON.stringify(this.toolTemplate.blueprint),
    };
  }
}

/**
 * Common test data generators for tools
 */
export const CommonToolTestData = {
  /**
   * Generate common invalid parameter tests
   */
  commonInvalidInputs: [
    { params: {}, expectedError: 'invalid input', description: 'empty input object' },
    { params: { invalidField: 'test' }, expectedError: 'invalid input', description: 'object with invalid fields' },
    { params: { requiredField: null }, expectedError: 'invalid input', description: 'object with null values' },
    { params: { requiredField: undefined }, expectedError: 'invalid input', description: 'object with undefined values' },
  ],

  /**
   * Generate edge case inputs
   */
  edgeCaseInputs: [
    { params: {}, description: 'empty object' },
    { params: { extra: 'field' }, description: 'unexpected field' },
  ],
};

/**
 * Jest matcher helpers for tool testing
 */
export const ToolMatchers = {
  /**
   * Check if a tool has valid structure
   */
  toHaveValidToolStructure: (received: ToolParams) => {
    const requiredFields = ['name', 'description', 'parameters', 'blueprint'];
    const hasAllFields = requiredFields.every((field) => received[field as keyof ToolParams] !== undefined);

    if (hasAllFields) {
      return {
        message: () => `expected tool not to have valid structure`,
        pass: true,
      };
    } else {
      const missingFields = requiredFields.filter((field) => received[field as keyof ToolParams] === undefined);
      return {
        message: () => `expected tool to have valid structure, missing: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
  },

  /**
   * Check if a blueprint has valid structure
   */
  toHaveValidBlueprint: (received: ToolParams['blueprint']) => {
    const hasNodes = Array.isArray(received.nodes);
    const hasEdges = Array.isArray(received.edges);
    const hasStartNode = received.nodes?.some((n) => n.type === 'start') || false;
    const hasEndNode = received.nodes?.some((n) => n.type === 'end') || false;

    const isValid = hasNodes && hasEdges && hasStartNode && hasEndNode;

    if (isValid) {
      return {
        message: () => `expected blueprint not to be valid`,
        pass: true,
      };
    } else {
      const issues: string[] = [];
      if (!hasNodes) issues.push('missing nodes array');
      if (!hasEdges) issues.push('missing edges array');
      if (!hasStartNode) issues.push('missing start node');
      if (!hasEndNode) issues.push('missing end node');

      return {
        message: () => `expected blueprint to be valid, issues: ${issues.join(', ')}`,
        pass: false,
      };
    }
  },
};
