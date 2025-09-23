/**
 * Calculator Tool Tests
 * End-to-end tests for the calculator tool using autopilot Tool node
 */

import { calculatorTool, calculatorToolTemplate } from '../calculator';
import { ToolTestHelper, CommonToolTestData } from './tool-test-helper';

describe('Calculator Tool', () => {
  let testHelper: ToolTestHelper;

  beforeEach(() => {
    testHelper = new ToolTestHelper(calculatorTool, calculatorToolTemplate, 'calculator');
    testHelper.clearEventLogs();
  });

  describe('Tool Structure', () => {
    it('should have valid tool structure', () => {
      const result = testHelper.testToolStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct tool name', () => {
      expect(calculatorTool.name).toBe('calculator');
    });

    it('should have descriptive description', () => {
      expect(calculatorTool.description).toContain('mathematical');
      expect(calculatorTool.description.length).toBeGreaterThan(10);
    });
  });

  describe('Parameter Schema', () => {
    it('should have valid parameter schema', () => {
      const result = testHelper.testParameterSchema();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require expression parameter', () => {
      expect(calculatorTool.parameters.required).toContain('expression');
    });

    it('should define expression as string type', () => {
      const expressionProp = calculatorTool.parameters.properties?.expression as { type: string; description: string };
      expect(expressionProp?.type).toBe('string');
      expect(expressionProp?.description).toBeDefined();
    });
  });

  describe('Blueprint Structure', () => {
    it('should have valid blueprint structure', () => {
      const result = testHelper.testBlueprintStructure();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have start and end nodes', () => {
      const blueprint = calculatorTool.blueprint;
      const hasStart = blueprint.nodes.some((n) => n.type === 'start');
      const hasEnd = blueprint.nodes.some((n) => n.type === 'end');

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);
    });

    it('should have proper node connectivity', () => {
      const blueprint = calculatorTool.blueprint;
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));

      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }
    });

    it('should have calculation logic node', () => {
      const blueprint = calculatorTool.blueprint;
      const hasCalcNode = blueprint.nodes.some((n) => n.type === 'code' && n.name?.toLowerCase().includes('calculate'));
      expect(hasCalcNode).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      const result = testHelper.testTemplateConsistency();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should have correct template metadata', () => {
      expect(calculatorToolTemplate.slug).toBe('calculator');
      expect(calculatorToolTemplate.category).toBe('utility');
      expect(calculatorToolTemplate.requiresApiKey).toBe(false);
    });

    it('should have example usage', () => {
      expect(calculatorToolTemplate.exampleUsage).toBeDefined();
      if (calculatorToolTemplate.exampleUsage) {
        expect(calculatorToolTemplate.exampleUsage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Tool Execution', () => {
    it('should execute simple addition', async () => {
      const input = { expression: '5 + 3' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(typeof result.result).toBe('object');
    });

    it('should execute expression with precedence', async () => {
      const input = CommonToolTestData.VALID_CALCULATOR_INPUT; // "2 + 3 * 4"
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      // The result should be an object with expression and result
      if (result.result && typeof result.result === 'object') {
        const calcResult = result.result as { expression: string; result: number; type: string };
        expect(calcResult.expression).toBe('2 + 3 * 4');
        expect(calcResult.result).toBe(14); // Proper precedence: 2 + (3 * 4) = 14
        expect(calcResult.type).toBe('calculation');
      }
    });

    it('should execute simple multiplication', async () => {
      const input = { expression: '6 * 7' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const calcResult = result.result as { result: number };
        expect(calcResult.result).toBe(42);
      }
    });

    it('should handle single numbers', async () => {
      const input = { expression: '42' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      if (result.result && typeof result.result === 'object') {
        const calcResult = result.result as { result: number };
        expect(calcResult.result).toBe(42);
      }
    });

    it('should emit proper events during execution', async () => {
      const input = { expression: '5 + 5' };
      await testHelper.executeToolViaEngine(input);

      const events = testHelper.getEventLogs();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should complete within reasonable time', async () => {
      const input = { expression: '100 + 200' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle missing expression', async () => {
      const input = {}; // Missing expression
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Expression is required');
    });

    it('should handle invalid expression type', async () => {
      const input = { expression: 123 }; // Should be string
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle expressions with invalid characters', async () => {
      const input = { expression: '2 + 3; alert("hack")' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid characters');
    });

    it('should handle complex unsupported expressions', async () => {
      const input = { expression: 'Math.pow(2, 8)' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Complex expressions not supported');
    });

    it('should handle empty expression', async () => {
      const input = { expression: '' };
      const result = await testHelper.executeToolViaEngine(input);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Security', () => {
    it('should reject expressions with potentially dangerous code', async () => {
      const dangerousExpressions = [
        'eval("2+2")',
        'require("fs")',
        'process.exit()',
        '2+2; console.log("hack")',
        'function hack() { return 1; }',
      ];

      for (const expr of dangerousExpressions) {
        const input = { expression: expr };
        const result = await testHelper.executeToolViaEngine(input);

        expect(result.success).toBe(false);
        expect(result.error).toContain('invalid characters');
      }
    });

    it('should only allow basic math operations', async () => {
      const allowedChars = '0123456789+-*/.() ';
      const input = { expression: '(10 + 5) * 2.5 / 3' };

      // Verify all characters are allowed
      for (const char of input.expression) {
        expect(allowedChars.includes(char)).toBe(true);
      }

      const result = await testHelper.executeToolViaEngine(input);
      expect(result.success).toBe(true);
    });
  });

  describe('All Validation Tests', () => {
    it('should pass comprehensive validation', () => {
      const validation = testHelper.runAllValidationTests();

      expect(validation.structureValid).toBe(true);
      expect(validation.parametersValid).toBe(true);
      expect(validation.blueprintValid).toBe(true);
      expect(validation.templateValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });
});
