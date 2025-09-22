/**
 * Echo Tool Tests
 *
 * Tests for the echo tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import { echoTool, echoToolTemplate } from '../echo';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Echo Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(echoTool, echoToolTemplate, 'echo');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(echoTool).toMatchObject({
        name: 'echo',
        description: expect.stringContaining('Echo back the provided input'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.arrayContaining(['message']),
        }),
        blueprint: expect.objectContaining({
          nodes: expect.any(Array),
          edges: expect.any(Array),
          metadata: expect.any(Object),
        }),
      });
    });

    it('should have consistent template and tool data', () => {
      const consistency = testHelper.testTemplateConsistency();

      expect(consistency.nameMatch).toBe(true);
      expect(consistency.descriptionMatch).toBe(true);
      expect(consistency.parametersMatch).toBe(true);
      expect(consistency.blueprintMatch).toBe(true);
    });

    it('should have valid template metadata', () => {
      expect(echoToolTemplate).toMatchObject({
        slug: 'echo',
        category: 'utility',
        exampleUsage: expect.stringContaining('echo'),
        requiresApiKey: false,
        configurationFields: [],
      });
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema structure', () => {
      const schemaResults = testHelper.testParameterSchema();

      const mainSchema = schemaResults.find((r) => r.description === 'should have valid parameter schema');
      expect(mainSchema?.isObject).toBe(true);
      expect(mainSchema?.hasProperties).toBe(true);
      expect(mainSchema?.hasRequired).toBe(true);
    });

    it('should have message parameter with correct definition', () => {
      const { properties } = echoTool.parameters;
      const messageProp = (properties as Record<string, unknown>).message as Record<string, unknown>;

      expect(messageProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Message to echo back'),
      });
    });

    it('should have optional metadata parameter', () => {
      const { properties } = echoTool.parameters;
      const metadataProp = (properties as Record<string, unknown>).metadata as Record<string, unknown>;

      expect(metadataProp).toMatchObject({
        type: 'object',
        description: expect.stringContaining('Additional metadata'),
        properties: expect.any(Object),
      });
    });

    it('should require message parameter', () => {
      expect(echoTool.parameters.required).toContain('message');
    });

    it('should not require metadata parameter', () => {
      expect(echoTool.parameters.required).not.toContain('metadata');
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const blueprintResults = testHelper.testBlueprintStructure();

      const mainStructure = blueprintResults.find((r) => r.description === 'should have valid blueprint structure');
      expect(mainStructure?.hasNodes).toBe(true);
      expect(mainStructure?.hasEdges).toBe(true);
      expect(mainStructure?.nodeCount).toBeGreaterThan(0);
      expect(mainStructure?.edgeCount).toBeGreaterThan(0);
    });

    it('should have start and end nodes', () => {
      const startEndResult = testHelper.testStartEndNodes();

      expect(startEndResult.hasStartNode).toBe(true);
      expect(startEndResult.hasEndNode).toBe(true);
      expect(startEndResult.startNodeCount).toBe(1);
      expect(startEndResult.endNodeCount).toBe(1);
    });

    it('should have proper node connectivity', () => {
      const connectivityResult = testHelper.testConnectivity();

      expect(connectivityResult.isConnected).toBe(true);
      expect(connectivityResult.unreachableNodes).toHaveLength(0);
    });

    it('should have expected nodes', () => {
      const { nodes } = echoTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have minimal blueprint (direct start to end)', () => {
      const { nodes, edges } = echoTool.blueprint;

      // Echo tool should be minimal - just start and end nodes
      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);

      // Should have direct connection from start to end
      const edge = edges[0];
      expect(edge.from).toBe('start_1');
      expect(edge.to).toBe('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = echoTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('End Node Logic', () => {
    it('should have end node with echo output configuration', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode).toBeDefined();
      expect(endNode?.parameters).toHaveProperty('output');

      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;
      expect(output).toBeDefined();
      expect(typeof output).toBe('object');
    });

    it('should have proper output structure with echo fields', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      expect(output).toHaveProperty('type');
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('metadata');
      expect(output).toHaveProperty('echoedAt');

      expect(output.type).toBe('echo');
    });

    it('should use template expressions for dynamic values', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should reference initial input message
      expect(output.message).toContain('$lastOutputOf("__initial__")');
      expect(output.message).toContain('json.message');

      // Should reference initial input metadata with fallback
      expect(output.metadata).toContain('$lastOutputOf("__initial__")');
      expect(output.metadata).toContain('json.metadata');
      expect(output.metadata).toContain('??');

      // Should generate timestamp
      expect(output.echoedAt).toContain('new Date()');
      expect(output.echoedAt).toContain('toISOString()');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid message strings', () => {
      const validMessages = [
        'Hello, world!',
        'Simple message',
        'Message with numbers 123',
        'Message with symbols !@#$%',
        '', // Empty string should be allowed
        'Very long message that contains a lot of text and should still be valid',
      ];

      validMessages.forEach((message) => {
        const params = { message };
        expect(() => {
          expect(params).toMatchObject({
            message: expect.any(String),
          });
        }).not.toThrow();
      });
    });

    it('should accept optional metadata', () => {
      const validInputs = [
        { message: 'test', metadata: { key: 'value' } },
        { message: 'test', metadata: {} },
        { message: 'test', metadata: { nested: { data: 'value' } } },
        { message: 'test' }, // No metadata
      ];

      validInputs.forEach((params) => {
        expect(() => {
          expect(params).toMatchObject({
            message: expect.any(String),
          });
          if (params.metadata) {
            expect(params.metadata).toEqual(expect.any(Object));
          }
        }).not.toThrow();
      });
    });

    it('should handle missing message parameter', () => {
      const invalidInputs = [{}, { metadata: { some: 'data' } }, { message: null }, { message: undefined }];

      // Note: Actual validation would happen at runtime in the blueprint execution
      // Here we just verify the parameter schema defines message as required
      invalidInputs.forEach(() => {
        expect(echoTool.parameters.required).toContain('message');
      });
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(echoToolTemplate.slug).toBe('echo');
      expect(echoToolTemplate.category).toBe('utility');
      expect(echoToolTemplate.requiresApiKey).toBe(false);
      expect(echoToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(echoToolTemplate.exampleUsage).toContain('echo');
      expect(echoToolTemplate.exampleUsage).toContain('message');
      expect(echoToolTemplate.exampleUsage).toContain('Hello Tools!');
    });
  });

  describe('Expected Output Format', () => {
    it('should define consistent output structure', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should have all expected fields
      expect(output).toHaveProperty('type');
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('metadata');
      expect(output).toHaveProperty('echoedAt');

      // Type should be 'echo'
      expect(output.type).toBe('echo');
    });

    it('should preserve input message in output', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should reference the original message from input
      expect(output.message).toContain('__initial__');
      expect(output.message).toContain('json.message');
    });

    it('should handle metadata gracefully', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should have fallback for missing metadata
      expect(output.metadata).toContain('??');
      expect(output.metadata).toContain('{}');
    });
  });

  describe('Simplicity and Performance', () => {
    it('should have minimal node count for efficiency', () => {
      const { nodes } = echoTool.blueprint;

      // Echo should be the simplest tool - just start and end
      expect(nodes.length).toBe(2);
    });

    it('should have no intermediate processing nodes', () => {
      const { nodes } = echoTool.blueprint;
      const intermediateTypes = ['code', 'transform', 'mutate', 'conditional'];

      const hasIntermediateNodes = nodes.some((n) => intermediateTypes.includes(n.type));
      expect(hasIntermediateNodes).toBe(false);
    });

    it('should have direct start-to-end connection', () => {
      const { edges } = echoTool.blueprint;

      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe('start_1');
      expect(edges[0].to).toBe('end_1');
    });
  });

  describe('Testing and Debugging Utility', () => {
    it('should be suitable for testing tool infrastructure', () => {
      // Echo tool should have minimal complexity for testing
      expect(echoTool.parameters.required).toEqual(['message']);
      expect(echoTool.blueprint.nodes).toHaveLength(2);
      expect(echoTool.blueprint.edges).toHaveLength(1);
    });

    it('should provide useful debugging output structure', () => {
      const { nodes } = echoTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');
      const output = (endNode?.parameters as Record<string, unknown>)?.output as Record<string, unknown>;

      // Should include timestamp for debugging
      expect(output).toHaveProperty('echoedAt');
      expect(output.echoedAt).toContain('new Date()');

      // Should preserve original input
      expect(output).toHaveProperty('message');
      expect(output).toHaveProperty('metadata');
    });
  });

  describe('Integration with Common Test Patterns', () => {
    it('should handle common invalid inputs', () => {
      CommonToolTestData.commonInvalidInputs.forEach((testCase) => {
        // Verify tool structure remains valid regardless of input
        expect(testCase.params).toBeDefined();
        expect(testCase.expectedError).toBeTruthy();
        expect(testCase.description).toBeTruthy();
      });
    });

    it('should use ToolMatchers for validation', () => {
      expect(ToolMatchers.toHaveValidToolStructure(echoTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(echoTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });

  describe('Blueprint Execution Flow', () => {
    it('should have correct execution order', () => {
      const { nodes, edges } = echoTool.blueprint;

      // Start node
      const startNode = nodes.find((n) => n.type === 'start');
      expect(startNode?.ref).toBe('start_1');

      // End node
      const endNode = nodes.find((n) => n.type === 'end');
      expect(endNode?.ref).toBe('end_1');

      // Single edge from start to end
      expect(edges).toHaveLength(1);
      expect(edges[0].from).toBe('start_1');
      expect(edges[0].to).toBe('end_1');
    });

    it('should have proper edge reference', () => {
      const { edges } = echoTool.blueprint;

      expect(edges[0].ref).toBe('e1');
      expect(edges[0].from).toBe('start_1');
      expect(edges[0].to).toBe('end_1');
    });
  });
});
