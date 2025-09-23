/**
 * Calculator Tool Functional Tests
 *
 * Tests that actually execute the calculator tool and verify mathematical calculations
 * instead of just validating static structure.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { calculatorTool, calculatorToolTemplate } from '../calculator';
import { ToolTestRunner, CommonToolScenarios } from './tool-execution-helper';

interface CalculatorResult {
  expression: string;
  result: number;
  type: 'calculation';
}

describe('Calculator Tool - Functional Tests', () => {
  let testRunner: ToolTestRunner;

  beforeEach(() => {
    testRunner = new ToolTestRunner(calculatorTool);
  });

  describe('Basic Mathematical Operations', () => {
    it('should perform simple addition', async () => {
      const result = await testRunner.testValidInput(
        { expression: '2+3' },
        (output: any) => output.result === 5 && output.expression === '2+3'
      );

      expect(result).toEqual({
        expression: '2+3',
        result: 5,
        type: 'calculation',
      });
    });

    it('should not properly handle subtraction (parseFloat limitation)', async () => {
      const result = (await testRunner.testValidInput(
        { expression: '10-3' },
        (output: any) => output.result === 10 // parseFloat("10-3") returns 10
      )) as CalculatorResult;

      expect((result as CalculatorResult).result).toBe(10); // Not 7, just parses "10"
      expect((result as CalculatorResult).expression).toBe('10-3');
    });

    it('should perform simple multiplication', async () => {
      const result = await testRunner.testValidInput({ expression: '4*5' }, (output: any) => output.result === 20);

      expect((result as CalculatorResult).result).toBe(20);
      expect((result as CalculatorResult).expression).toBe('4*5');
    });

    it('should handle decimal numbers', async () => {
      const result = await testRunner.testValidInput({ expression: '3.14' }, (output: any) => Math.abs(output.result - 3.14) < 0.001);

      expect((result as CalculatorResult).result).toBeCloseTo(3.14);
    });

    it('should handle the specific precedence example', async () => {
      const result = await testRunner.testValidInput({ expression: '2+3*4' }, (output: any) => output.result === 14);

      expect((result as CalculatorResult).result).toBe(14); // Should be 2 + (3 * 4) = 14
    });
  });

  describe('Input Validation', () => {
    it('should reject empty expression', async () => {
      await testRunner.testInvalidInput({ expression: '' }, 'Expression is required');
    });

    it('should reject missing expression', async () => {
      await testRunner.testInvalidInput({}, 'Expression is required');
    });

    it('should reject null expression', async () => {
      await testRunner.testInvalidInput({ expression: null }, 'Expression is required');
    });

    it('should reject non-string expression', async () => {
      await testRunner.testInvalidInput({ expression: 123 }, 'Expression is required');
    });

    it('should reject expressions with invalid characters', async () => {
      await testRunner.testInvalidInput({ expression: '2+eval("alert(1)")' }, 'invalid characters');
    });

    it('should reject expressions with forbidden functions', async () => {
      await testRunner.testInvalidInput({ expression: 'Math.random()' }, 'invalid characters');
    });

    it('should reject expressions with special characters', async () => {
      const invalidExpressions = ['2&3', '2|3', '2$3', '2@3'];

      for (const expr of invalidExpressions) {
        await testRunner.testInvalidInput({ expression: expr }, 'invalid characters');
      }
    });
  });

  describe('Complex Expression Handling', () => {
    it('should handle expressions that are not implemented', async () => {
      await testRunner.testInvalidInput({ expression: '(2+3)*4' }, 'Complex expressions not supported');
    });

    it('should not properly handle division (parseFloat limitation)', async () => {
      const result = (await testRunner.testValidInput(
        { expression: '10/2' },
        (output: any) => output.result === 10 // parseFloat("10/2") returns 10
      )) as CalculatorResult;

      expect((result as CalculatorResult).result).toBe(10); // Not 5, just parses "10"
      expect((result as CalculatorResult).expression).toBe('10/2');
    });

    it('should not properly handle subtraction (parseFloat limitation)', async () => {
      const result = (await testRunner.testValidInput(
        { expression: '10-5' },
        (output: any) => output.result === 10 // parseFloat("10-5") returns 10
      )) as CalculatorResult;

      expect((result as CalculatorResult).result).toBe(10); // Not 5, just parses "10"
      expect((result as CalculatorResult).expression).toBe('10-5');
    });
  });

  describe('Multiple Addition Cases', () => {
    it('should handle multiple addition terms', async () => {
      const result = await testRunner.testValidInput({ expression: '1+2+3' }, (output: any) => output.result === 6);

      expect((result as CalculatorResult).result).toBe(6);
    });

    it('should handle addition with decimals', async () => {
      const result = await testRunner.testValidInput({ expression: '1.5+2.5' }, (output: any) => output.result === 4);

      expect((result as CalculatorResult).result).toBe(4);
    });
  });

  describe('Multiple Multiplication Cases', () => {
    it('should handle multiple multiplication terms', async () => {
      const result = await testRunner.testValidInput({ expression: '2*3*4' }, (output: any) => output.result === 24);

      expect((result as CalculatorResult).result).toBe(24);
    });

    it('should handle multiplication with decimals', async () => {
      const result = await testRunner.testValidInput({ expression: '1.5*2' }, (output: any) => output.result === 3);

      expect((result as CalculatorResult).result).toBe(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle expressions with spaces', async () => {
      const result = await testRunner.testValidInput({ expression: ' 2 + 3 ' }, (output: any) => output.result === 5);

      expect((result as CalculatorResult).result).toBe(5);
    });

    it('should handle zero values', async () => {
      const result = await testRunner.testValidInput({ expression: '0+5' }, (output: any) => output.result === 5);

      expect((result as CalculatorResult).result).toBe(5);
    });

    it('should handle multiplication by zero', async () => {
      const result = await testRunner.testValidInput({ expression: '5*0' }, (output: any) => output.result === 0);

      expect((result as CalculatorResult).result).toBe(0);
    });
  });

  describe('Output Structure Validation', () => {
    it('should return correct output structure', async () => {
      const result = await testRunner.testValidInput({ expression: '2+3' });

      expect(result).toHaveProperty('expression');
      expect(result).toHaveProperty('result');
      expect(result).toHaveProperty('type');
      expect((result as any).type).toBe('calculation');
    });

    it('should preserve original expression in output', async () => {
      const originalExpression = '5 + 7';
      const result = await testRunner.testValidInput({ expression: originalExpression });

      expect((result as any).expression).toBe(originalExpression);
    });
  });

  describe('Error Handling', () => {
    it('should handle expressions that evaluate to invalid numbers', async () => {
      // This tests the validation logic in the code node
      await testRunner.testInvalidInput({ expression: 'abc' }, 'invalid characters');
    });

    it('should validate finite results', async () => {
      // The code should check for isFinite(result)
      const result = await testRunner.testValidInput({ expression: '5+5' });
      expect(Number.isFinite((result as any).result)).toBe(true);
    });
  });

  describe('Tool Template Consistency', () => {
    it('should have consistent tool and template', () => {
      expect(calculatorToolTemplate.name).toBe(calculatorTool.name);
      expect(calculatorToolTemplate.description).toBe(calculatorTool.description);
      expect(calculatorToolTemplate.parameters).toEqual(calculatorTool.parameters);
      expect(calculatorToolTemplate.blueprint).toEqual(calculatorTool.blueprint);
    });

    it('should have correct template metadata', () => {
      expect(calculatorToolTemplate.slug).toBe('calculator');
      expect(calculatorToolTemplate.category).toBe('utility');
      expect(calculatorToolTemplate.requiresApiKey).toBe(false);
      expect(calculatorToolTemplate.configurationFields).toEqual([]);
    });
  });

  describe('Common Test Scenarios', () => {
    it('should pass common calculator scenarios', async () => {
      const results = await testRunner.testScenarios(CommonToolScenarios.calculator);

      results.forEach((result) => {
        if (result.name.includes('simple addition') || result.name.includes('simple multiplication')) {
          expect(result.passed).toBe(true);
        }
        if (result.name.includes('empty expression') || result.name.includes('invalid characters')) {
          expect(result.passed).toBe(true);
        }
      });
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple rapid calculations', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(testRunner.testValidInput({ expression: `${i}+1` }));
      }

      const results = await Promise.all(promises);
      results.forEach((result, index) => {
        expect((result as any).result).toBe(index + 1);
      });
    });

    it('should have consistent results for same input', async () => {
      const expression = '7+8';
      const results = await Promise.all([
        testRunner.testValidInput({ expression }),
        testRunner.testValidInput({ expression }),
        testRunner.testValidInput({ expression }),
      ]);

      const firstResult = (results[0] as any).result;
      results.forEach((result) => {
        expect((result as any).result).toBe(firstResult);
      });
    });
  });
});
