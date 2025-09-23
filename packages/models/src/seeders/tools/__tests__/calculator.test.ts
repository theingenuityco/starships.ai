/**
 * Calculator Tool Tests
 * Direct end-to-end tests using real autopilot Tool execution
 */

import { calculatorTool, calculatorToolTemplate } from '../calculator';
import { Tool, ExecutionItemUtils } from '@starships/autopilot';
import type { ExecutionItem, NodeHandlerOptions } from '@starships/autopilot';

describe('Calculator Tool', () => {
  async function executeTool(input: unknown) {
    const options: NodeHandlerOptions = {
      eventCallback: jest.fn(),
    };

    const toolNode = new Tool(calculatorTool, options);

    // Validate tool first
    const validation = toolNode.validate();
    expect(validation.valid).toBe(true);

    const inputData = input || {};
    const executionItem: ExecutionItem = {
      json: inputData,
      pairedItem: { item: 0 },
    };

    const result = await toolNode.execute([executionItem]);
    return ExecutionItemUtils.unwrapSingle(result);
  }

  describe('Tool Structure Validation', () => {
    it('should have valid tool structure', () => {
      expect(calculatorTool.name).toBe('calculator');
      expect(calculatorTool.description).toContain('mathematical');
      expect(calculatorTool.description.length).toBeGreaterThan(10);
      expect(calculatorTool.parameters).toBeDefined();
      expect(calculatorTool.blueprint).toBeDefined();
    });

    it('should require expression parameter', () => {
      expect(calculatorTool.parameters.required).toContain('expression');

      const expressionProp = calculatorTool.parameters.properties?.expression as { type: string; description: string };
      expect(expressionProp?.type).toBe('string');
      expect(expressionProp?.description).toBeDefined();
    });

    it('should have valid blueprint structure', () => {
      const blueprint = calculatorTool.blueprint;

      // Check basic structure
      expect(Array.isArray(blueprint.nodes)).toBe(true);
      expect(Array.isArray(blueprint.edges)).toBe(true);

      // Check for required nodes
      const nodeTypes = blueprint.nodes.map((n) => n.type);
      expect(nodeTypes).toContain('start');
      expect(nodeTypes).toContain('end');
      expect(nodeTypes).toContain('code'); // calculation logic

      // Verify node connectivity
      const nodeRefs = new Set(blueprint.nodes.map((n) => n.ref));
      for (const edge of blueprint.edges) {
        expect(nodeRefs.has(edge.from)).toBe(true);
        expect(nodeRefs.has(edge.to)).toBe(true);
      }

      // Should have calculation logic node
      const hasCalcNode = blueprint.nodes.some((n) => n.type === 'code' && n.name?.toLowerCase().includes('calculate'));
      expect(hasCalcNode).toBe(true);
    });
  });

  describe('Template Configuration', () => {
    it('should have consistent template configuration', () => {
      expect(calculatorToolTemplate.name).toBe(calculatorTool.name);
      expect(calculatorToolTemplate.description).toBe(calculatorTool.description);
      expect(calculatorToolTemplate.parameters).toEqual(calculatorTool.parameters);
      expect(calculatorToolTemplate.blueprint).toEqual(calculatorTool.blueprint);

      expect(calculatorToolTemplate.slug).toBe('calculator');
      expect(calculatorToolTemplate.category).toBe('utility');
      expect(calculatorToolTemplate.requiresApiKey).toBe(false);
      expect(calculatorToolTemplate.exampleUsage).toBeDefined();
    });
  });

  describe('Real Tool Execution', () => {
    it('should execute simple addition', async () => {
      const input = { expression: '5 + 3' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      expect(typeof result).toBe('object');

      const calcResult = result as { expression: string; result: number; type: string };
      expect(calcResult.expression).toBe('5 + 3');
      expect(calcResult.result).toBe(8);
      expect(calcResult.type).toBe('calculation');
    });

    it('should execute expression with precedence', async () => {
      const input = { expression: '2 + 3 * 4' };
      const result = await executeTool(input);

      expect(result).toBeDefined();

      const calcResult = result as { expression: string; result: number; type: string };
      expect(calcResult.expression).toBe('2 + 3 * 4');
      expect(calcResult.result).toBe(14); // Proper precedence: 2 + (3 * 4) = 14
      expect(calcResult.type).toBe('calculation');
    });

    it('should execute simple multiplication', async () => {
      const input = { expression: '6 * 7' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(calcResult.result).toBe(42);
    });

    it('should handle single numbers', async () => {
      const input = { expression: '42' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(calcResult.result).toBe(42);
    });

    it('should handle expressions with parentheses', async () => {
      const input = { expression: '(10 + 5) * 2' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(calcResult.result).toBe(30); // (10 + 5) * 2 = 15 * 2 = 30
    });

    it('should handle decimal numbers', async () => {
      const input = { expression: '3.5 + 2.5' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(calcResult.result).toBe(6);
    });

    it('should handle division', async () => {
      const input = { expression: '15 / 3' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(calcResult.result).toBe(5);
    });

    it('should handle division by zero', async () => {
      const input = { expression: '5 / 0' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect([Infinity, 'Infinity']).toContain(calcResult.result);
    });

    it('should handle complex expressions', async () => {
      const input = { expression: '(10 + 5) * 2.5 / 3' };
      const result = await executeTool(input);

      expect(result).toBeDefined();
      const calcResult = result as { result: number };
      expect(typeof calcResult.result).toBe('number');
      // (15 * 2.5) / 3 = 37.5 / 3 = 12.5
      expect(calcResult.result).toBeCloseTo(12.5);
    });
  });

  describe('Error Handling with Real Execution', () => {
    it('should handle missing expression', async () => {
      const input = {}; // Missing expression

      await expect(executeTool(input)).rejects.toThrow('Expression is required');
    });

    it('should handle invalid expression type', async () => {
      const input = { expression: 123 }; // Should be string

      await expect(executeTool(input)).rejects.toThrow('must be a string');
    });

    it('should handle expressions with invalid characters', async () => {
      const input = { expression: '2 + 3; alert("hack")' };

      await expect(executeTool(input)).rejects.toThrow('invalid characters');
    });

    it('should handle complex unsupported expressions', async () => {
      const input = { expression: 'Math.pow(2, 8)' };

      await expect(executeTool(input)).rejects.toThrow('Complex expressions not supported');
    });

    it('should handle empty expression', async () => {
      const input = { expression: '' };

      await expect(executeTool(input)).rejects.toThrow('Expression is required');
    });

    it('should handle expressions with dangerous JavaScript code', async () => {
      const dangerousExpressions = [
        'eval("2+2")',
        'require("fs")',
        'process.exit()',
        '2+2; console.log("hack")',
        'function hack() { return 1; }',
      ];

      for (const expr of dangerousExpressions) {
        const input = { expression: expr };

        await expect(executeTool(input)).rejects.toThrow('invalid characters');
      }
    });

    it('should only allow basic math operations', async () => {
      const allowedChars = '0123456789+-*/.() ';
      const input = { expression: '(10 + 5) * 2.5 / 3' };

      // Verify all characters are allowed
      for (const char of input.expression) {
        expect(allowedChars.includes(char)).toBe(true);
      }

      const result = await executeTool(input);
      expect(result).toBeDefined();

      const calcResult = result as { result: number };
      expect(typeof calcResult.result).toBe('number');
    });

    it('should handle malformed expressions', async () => {
      const malformedExpressions = ['2 +', '* 3', '(2 + 3', '2 + 3)', '2 ++ 3', '2 + + 3'];

      for (const expr of malformedExpressions) {
        const input = { expression: expr };

        // These might succeed or fail depending on the implementation
        // The key is they shouldn't crash the system
        try {
          await executeTool(input);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });
});
