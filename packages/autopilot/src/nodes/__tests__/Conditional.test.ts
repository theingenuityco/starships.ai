/**
 * Conditional Node Handler Tests
 *
 * Tests for JSONata-based branching logic in workflows
 */

import { Conditional } from '../Conditional';
import type { ConditionalParams } from '@/types/node-parameters';
import type { Execution } from '@/types';

// Mock jsonata library
const mockJsonata = jest.fn();
jest.mock('jsonata', () => mockJsonata);

describe('Conditional Node Handler', () => {
  const mockExecution: Execution = {
    status: 'running',
    results: [
      { nodeRef: 'start', data: { initialized: true } },
      { nodeRef: 'previous', data: { value: 42, success: true } },
    ],
    state: {
      user: { isPremium: true, level: 'gold' },
      config: { debug: false },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementation
    mockJsonata.mockReturnValue({
      evaluate: jest.fn().mockReturnValue(true),
    });
  });

  describe('Basic Conditional Functionality', () => {
    it('should evaluate simple boolean expression', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium = true',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.isPremium = true');
      expect(mockEvaluate).toHaveBeenCalledWith(mockExecution);
    });

    it('should evaluate string comparison expression', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.level = "gold"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.level = "gold"');
    });

    it('should evaluate numeric comparison expression', async () => {
      const params: ConditionalParams = {
        expression: 'results[-1].data.value > 40',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('results[-1].data.value > 40');
    });

    it('should return false for failing conditions', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium = false',
      };

      const mockEvaluate = jest.fn().mockReturnValue(false);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: false });
    });
  });

  describe('Complex Expression Evaluation', () => {
    it('should handle complex logical operations', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium and results[-1].data.success',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.isPremium and results[-1].data.success');
    });

    it('should handle nested object access', async () => {
      const params: ConditionalParams = {
        expression: 'results[$ ~> $filter(function($v) { $v.nodeRef = "previous" })][-1].data.value > 30',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
    });

    it('should handle array operations', async () => {
      const executionWithArrays: Execution = {
        ...mockExecution,
        state: {
          items: [1, 2, 3, 4, 5],
          threshold: 3,
        },
      };

      const params: ConditionalParams = {
        expression: '$count(state.items[$>state.threshold]) > 1',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithArrays,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(executionWithArrays);
    });

    it('should handle string matching operations', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.level ~> /^(gold|platinum)$/',
      };

      const mockEvaluate = jest.fn().mockReturnValue('gold');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: 'gold' });
    });
  });

  describe('Return Value Types', () => {
    it('should return boolean values', async () => {
      const params: ConditionalParams = {
        expression: 'true',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.condition).toBe(true);
      expect(typeof result.condition).toBe('boolean');
    });

    it('should return string values', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.level',
      };

      const mockEvaluate = jest.fn().mockReturnValue('premium');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.condition).toBe('premium');
      expect(typeof result.condition).toBe('string');
    });

    it('should return numeric values', async () => {
      const params: ConditionalParams = {
        expression: 'results[-1].data.value',
      };

      const mockEvaluate = jest.fn().mockReturnValue(42);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.condition).toBe(42);
      expect(typeof result.condition).toBe('number');
    });

    it('should handle null/undefined values', async () => {
      const params: ConditionalParams = {
        expression: 'state.nonexistent',
      };

      const mockEvaluate = jest.fn().mockReturnValue(undefined);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.condition).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle JSONata syntax errors', async () => {
      const params: ConditionalParams = {
        expression: 'invalid expression $$',
      };

      mockJsonata.mockImplementation(() => {
        throw new Error('JSONata syntax error');
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      await expect(conditional.execute()).rejects.toThrow('Conditional evaluation failed: JSONata syntax error');
    });

    it('should handle evaluation runtime errors', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.method()',
      };

      const mockEvaluate = jest.fn().mockImplementation(() => {
        throw new Error('method is not a function');
      });

      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      await expect(conditional.execute()).rejects.toThrow('Conditional evaluation failed: method is not a function');
    });

    it('should handle missing execution context', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium',
      };

      const conditional = new Conditional(params, {
        // Missing execution context
      });

      await expect(conditional.execute()).rejects.toThrow('Execution context is required for conditional evaluation');
    });
  });

  describe('Timeout Handling', () => {
    it('should respect custom timeout', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium',
        timeout: 1000,
      };

      // Mock slow evaluation
      const mockEvaluate = jest.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve(true), 2000);
        });
      });

      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      await expect(conditional.execute()).rejects.toThrow('Conditional evaluation timeout after 1000ms');
    });

    it('should use default timeout when not specified', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
    });
  });

  describe('Validation', () => {
    it('should validate required expression parameter', () => {
      const params = {
        // Missing expression
        timeout: 5000,
      } as ConditionalParams;

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Expression is required',
        })
      );
    });

    it('should validate timeout parameter range', () => {
      const params: ConditionalParams = {
        expression: 'true',
        timeout: -1000, // Invalid negative timeout
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PARAMETERS',
          message: 'Timeout must be greater than 0',
        })
      );
    });

    it('should pass validation with valid parameters', () => {
      const params: ConditionalParams = {
        expression: 'state.user.isPremium = true',
        timeout: 5000,
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });
  });

  describe('Execution Context Access', () => {
    it('should have access to execution status', async () => {
      const params: ConditionalParams = {
        expression: 'status = "running"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(mockExecution);
    });

    it('should have access to current node ref', async () => {
      const executionWithCurrentNode: Execution = {
        ...mockExecution,
        currentNodeRef: 'conditional-1',
      };

      const params: ConditionalParams = {
        expression: 'currentNodeRef = "conditional-1"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithCurrentNode,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(executionWithCurrentNode);
    });

    it('should handle empty results array', async () => {
      const executionWithoutResults: Execution = {
        ...mockExecution,
        results: [],
      };

      const params: ConditionalParams = {
        expression: '$count(results) = 0',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithoutResults,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(executionWithoutResults);
    });
  });

  describe('Real-world Conditional Scenarios', () => {
    it('should handle user permission checks', async () => {
      const params: ConditionalParams = {
        expression: 'state.user.role in ["admin", "moderator"] and state.user.active = true',
      };

      const executionWithUser: Execution = {
        ...mockExecution,
        state: {
          user: { role: 'admin', active: true },
        },
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithUser,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
    });

    it('should handle business logic conditions', async () => {
      const params: ConditionalParams = {
        expression: 'state.order.total > 100 and state.customer.loyaltyPoints > 500',
      };

      const executionWithBusiness: Execution = {
        ...mockExecution,
        state: {
          order: { total: 150.0, items: 3 },
          customer: { loyaltyPoints: 750, tier: 'gold' },
        },
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithBusiness,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: true });
    });

    it('should handle workflow routing decisions', async () => {
      const params: ConditionalParams = {
        expression: 'results[-1].data.confidence > 0.8 ? "high_confidence" : "review_needed"',
      };

      const executionWithConfidence: Execution = {
        ...mockExecution,
        results: [{ nodeRef: 'analysis', data: { confidence: 0.95, category: 'positive' } }],
      };

      const mockEvaluate = jest.fn().mockReturnValue('high_confidence');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithConfidence,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ condition: 'high_confidence' });
    });
  });
});
