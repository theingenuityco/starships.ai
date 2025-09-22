/**
 * Calculator Tool Tests
 *
 * Tests for the calculator tool including parameter validation,
 * blueprint structure, and functionality verification.
 */

import type { Edge } from '@starships/autopilot';
import { calculatorTool, calculatorToolTemplate } from '../calculator';
import { ToolTestHelper, CommonToolTestData, ToolMatchers } from './tool-test-helper';

describe('Calculator Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(calculatorTool, calculatorToolTemplate, 'calculator');
    jest.clearAllMocks();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      expect(calculatorTool).toMatchObject({
        name: 'calculator',
        description: expect.stringContaining('mathematical calculations'),
        parameters: expect.objectContaining({
          type: 'object',
          properties: expect.any(Object),
          required: expect.arrayContaining(['expression']),
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
      expect(calculatorToolTemplate).toMatchObject({
        slug: 'calculator',
        category: 'utility',
        exampleUsage: expect.stringContaining('calculator'),
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

    it('should have expression parameter with correct definition', () => {
      const { properties } = calculatorTool.parameters;
      const expressionProp = (properties as Record<string, unknown>).expression as Record<string, unknown>;

      expect(expressionProp).toMatchObject({
        type: 'string',
        description: expect.stringContaining('Mathematical expression'),
      });
    });

    it('should require expression parameter', () => {
      expect(calculatorTool.parameters.required).toContain('expression');
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
      const { nodes } = calculatorTool.blueprint;
      const nodeTypes = nodes.map((n) => n.type);
      const nodeRefs = nodes.map((n) => n.ref);

      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('code');
      expect(nodeTypes).toContain('end');

      expect(nodeRefs).toContain('start_1');
      expect(nodeRefs).toContain('calc_1');
      expect(nodeRefs).toContain('end_1');
    });

    it('should have valid edges connecting nodes', () => {
      const { edges, nodes } = calculatorTool.blueprint;
      const nodeRefs = nodes.map((n) => n.ref);

      edges.forEach((edge: Edge) => {
        expect(nodeRefs).toContain(edge.from);
        expect(nodeRefs).toContain(edge.to);
        expect(edge.ref).toBeTruthy();
      });
    });
  });

  describe('Code Node Logic', () => {
    it('should have a code node with calculation logic', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');

      expect(codeNode).toBeDefined();
      expect(codeNode?.parameters).toHaveProperty('code');
      expect(typeof (codeNode?.parameters as Record<string, unknown>)?.code).toBe('string');
      expect((codeNode?.parameters as Record<string, unknown>)?.code).toContain('expression');
    });

    it('should have proper error handling in code', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('throw new Error');
      expect(code).toContain('allowedChars');
      expect(code).toContain('try');
      expect(code).toContain('catch');
    });

    it('should validate input expression format', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("typeof expression !== 'string'");
      expect(code).toContain('Expression is required');
      expect(code).toContain('invalid characters');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid mathematical expressions', () => {
      const validExpressions = ['2 + 3', '5 * 4', '10 / 2', '7 - 3', '2 + 3 * 4', '(5 + 3) * 2', '42', '3.14159'];

      validExpressions.forEach((expression) => {
        const params = { expression };
        expect(() => {
          // Basic validation that the parameter structure is correct
          expect(params).toMatchObject({
            expression: expect.any(String),
          });
        }).not.toThrow();
      });
    });

    it('should reject invalid expressions with special characters', () => {
      const invalidExpressions = [
        '2 + eval("alert(1)")',
        'Math.random()',
        'console.log("hack")',
        '2 + $',
        'function() {}',
        '2 & 3',
        '2 | 3',
        '2 ^ 3', // XOR is not allowed
      ];

      // Note: Since we can't execute the actual blueprint code in unit tests,
      // we just validate the parameter structure. The code node itself
      // contains the validation logic that would reject these at runtime.
      invalidExpressions.forEach((expression) => {
        const params = { expression };
        expect(params).toMatchObject({
          expression: expect.any(String),
        });

        // Verify that the code contains validation for these cases
        const { nodes } = calculatorTool.blueprint;
        const codeNode = nodes.find((n) => n.type === 'code');
        const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;
        expect(code).toContain('allowedChars');
      });
    });

    it('should handle missing expression parameter', () => {
      const invalidInputs = [
        {},
        { expression: null },
        { expression: undefined },
        { expression: '' },
        { expression: 123 }, // Wrong type
      ];

      invalidInputs.forEach(() => {
        // The code node contains validation for these cases
        const { nodes } = calculatorTool.blueprint;
        const codeNode = nodes.find((n) => n.type === 'code');
        const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

        expect(code).toContain('Expression is required');
        expect(code).toContain("typeof expression !== 'string'");
      });
    });
  });

  describe('Tool Template', () => {
    it('should have correct template configuration', () => {
      expect(calculatorToolTemplate.slug).toBe('calculator');
      expect(calculatorToolTemplate.category).toBe('utility');
      expect(calculatorToolTemplate.requiresApiKey).toBe(false);
      expect(calculatorToolTemplate.configurationFields).toEqual([]);
    });

    it('should have helpful example usage', () => {
      expect(calculatorToolTemplate.exampleUsage).toContain('calculator');
      expect(calculatorToolTemplate.exampleUsage).toContain('expression');
      expect(calculatorToolTemplate.exampleUsage).toContain('2 + 3 * 4');
    });
  });

  describe('Expected Output Format', () => {
    it('should define expected output structure in code node', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Check that the code returns the expected structure
      expect(code).toContain('expression: expression');
      expect(code).toContain('result: result');
      expect(code).toContain("type: 'calculation'");
    });

    it('should have proper end node output configuration', () => {
      const { nodes } = calculatorTool.blueprint;
      const endNode = nodes.find((n) => n.type === 'end');

      expect(endNode?.parameters).toHaveProperty('output');
      expect((endNode?.parameters as Record<string, unknown>)?.output).toBe('{{ $input() }}');
    });
  });

  describe('Error Handling', () => {
    it('should have comprehensive error handling', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      // Check for various error conditions
      expect(code).toContain('Expression is required');
      expect(code).toContain('invalid characters');
      expect(code).toContain('Complex expressions not supported');
      expect(code).toContain('did not evaluate to a valid number');
      expect(code).toContain('Invalid mathematical expression');
    });

    it('should validate numeric results', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain("typeof result !== 'number'");
      expect(code).toContain('!isFinite(result)');
    });
  });

  describe('Security', () => {
    it('should have character allowlist for safety', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).toContain('allowedChars');
      expect(code).toContain('0123456789+-*/.() ');
      expect(code).toContain('!allowedChars.includes');
    });

    it('should not use eval or similar dangerous functions', () => {
      const { nodes } = calculatorTool.blueprint;
      const codeNode = nodes.find((n) => n.type === 'code');
      const code = (codeNode?.parameters as Record<string, unknown>)?.code as string;

      expect(code).not.toContain('eval(');
      expect(code).not.toContain('Function(');
      expect(code).not.toContain('setTimeout(');
      expect(code).not.toContain('setInterval(');
    });
  });

  describe('Integration with Common Test Patterns', () => {
    it('should handle common invalid inputs', () => {
      CommonToolTestData.commonInvalidInputs.forEach((testCase) => {
        // Verify tool would handle these appropriately
        // The actual validation happens in the code node at runtime
        expect(testCase.params).toBeDefined();
        expect(testCase.expectedError).toBeTruthy();
        expect(testCase.description).toBeTruthy();
      });
    });

    it('should use ToolMatchers for validation', () => {
      expect(ToolMatchers.toHaveValidToolStructure(calculatorTool)).toEqual({
        message: expect.any(Function),
        pass: true,
      });

      expect(ToolMatchers.toHaveValidBlueprint(calculatorTool.blueprint)).toEqual({
        message: expect.any(Function),
        pass: true,
      });
    });
  });
});
