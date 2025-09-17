/**
 * Conditional Node Handler Tests
 *
 * Tests for JSONata-based branching logic in workflows
 */

import { Conditional } from '../Conditional';
import type { ConditionalParams } from '@/types/node-parameters';
import type { Execution } from '@/types';

// Mock jsonata library
jest.mock('jsonata');

import jsonata from 'jsonata';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockJsonata = jsonata as jest.MockedFunction<any>;

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
        condition: 'state.user.isPremium = true',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.isPremium = true');
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          state: mockExecution.state,
          results: mockExecution.results,
          status: mockExecution.status,
          currentNodeRef: mockExecution.currentNodeRef,
          $nodeResult: expect.any(Function),
          $lastResult: expect.any(Function),
          $now: expect.any(Function),
          $random: expect.any(Function),
          $count: expect.any(Function),
        })
      );
    });

    it('should evaluate string comparison expression', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.level = "gold"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.level = "gold"');
    });

    it('should evaluate numeric comparison expression', async () => {
      const params: ConditionalParams = {
        condition: 'results[-1].data.value > 40',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('results[-1].data.value > 40');
    });

    it('should return false for failing conditions', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.isPremium = false',
      };

      const mockEvaluate = jest.fn().mockReturnValue(false);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: false, condition: false });
    });
  });

  describe('Complex Expression Evaluation', () => {
    it('should handle complex logical operations', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.isPremium and results[-1].data.success',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.isPremium and results[-1].data.success');
    });

    it('should handle nested object access', async () => {
      const params: ConditionalParams = {
        condition: 'results[$ ~> $filter(function($v) { $v.nodeRef = "previous" })][-1].data.value > 30',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
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
        condition: '$count(state.items[$>state.threshold]) > 1',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithArrays,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          state: executionWithArrays.state,
          results: executionWithArrays.results,
          status: executionWithArrays.status,
          currentNodeRef: executionWithArrays.currentNodeRef,
          $nodeResult: expect.any(Function),
          $lastResult: expect.any(Function),
          $now: expect.any(Function),
          $random: expect.any(Function),
          $count: expect.any(Function),
        })
      );
    });

    it('should handle string matching operations', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.level ~> /^(gold|platinum)$/',
      };

      const mockEvaluate = jest.fn().mockReturnValue('gold');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: 'gold', condition: 'gold' });
    });
  });

  describe('Return Value Types', () => {
    it('should return boolean values', async () => {
      const params: ConditionalParams = {
        condition: 'true',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.result).toBe(true);
      expect(result.condition).toBe(true);
      expect(typeof result.condition).toBe('boolean');
    });

    it('should return string values', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.level',
      };

      const mockEvaluate = jest.fn().mockReturnValue('premium');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.result).toBe('premium');
      expect(result.condition).toBe('premium');
      expect(typeof result.condition).toBe('string');
    });

    it('should return numeric values', async () => {
      const params: ConditionalParams = {
        condition: 'results[-1].data.value',
      };

      const mockEvaluate = jest.fn().mockReturnValue(42);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.result).toBe(42);
      expect(result.condition).toBe(42);
      expect(typeof result.condition).toBe('number');
    });

    it('should handle null/undefined values', async () => {
      const params: ConditionalParams = {
        condition: 'state.nonexistent',
      };

      const mockEvaluate = jest.fn().mockReturnValue(undefined);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result.result).toBeUndefined();
      expect(result.condition).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle JSONata syntax errors', async () => {
      const params: ConditionalParams = {
        condition: 'invalid expression $$',
      };

      mockJsonata.mockImplementation(() => {
        throw new Error('JSONata syntax error');
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      await expect(conditional.execute()).rejects.toThrow('Conditional evaluation failed: Expression evaluation failed');
    });

    it('should handle evaluation runtime errors', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.method()',
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

      await expect(conditional.execute()).rejects.toThrow('Conditional evaluation failed: Expression evaluation failed');
    });

    it('should handle missing execution context', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.isPremium',
      };

      const conditional = new Conditional(params, {
        // Missing execution context
      });

      await expect(conditional.execute()).rejects.toThrow('Execution context is required for conditional evaluation');
    });
  });

  describe('Virtual Node Pattern', () => {
    it('should work as standalone conditional node', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.isPremium = true',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockJsonata).toHaveBeenCalledWith('state.user.isPremium = true');
    });

    it('should integrate with Engine virtual node pattern', () => {
      // This test verifies the virtual node pattern integration
      // The actual testing is done through Engine integration tests
      const params: ConditionalParams = {
        condition: 'state.user.isPremium = true',
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();
      expect(validation.valid).toBe(true);
    });
  });

  describe('Validation', () => {
    it('should validate required condition parameter', () => {
      const params = {
        // Missing condition
      } as ConditionalParams;

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Condition expression is required',
        })
      );
    });

    it('should validate empty condition parameter', () => {
      const params: ConditionalParams = {
        condition: '',
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const validation = conditional.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Condition expression is required',
        })
      );
    });

    it('should pass validation with valid parameters', () => {
      const params: ConditionalParams = {
        condition: 'state.user.isPremium = true',
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
        condition: 'status = "running"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          state: mockExecution.state,
          results: mockExecution.results,
          status: mockExecution.status,
          currentNodeRef: mockExecution.currentNodeRef,
          $nodeResult: expect.any(Function),
          $lastResult: expect.any(Function),
          $now: expect.any(Function),
          $random: expect.any(Function),
          $count: expect.any(Function),
        })
      );
    });

    it('should have access to current node ref', async () => {
      const executionWithCurrentNode: Execution = {
        ...mockExecution,
        currentNodeRef: 'conditional-1',
      };

      const params: ConditionalParams = {
        condition: 'currentNodeRef = "conditional-1"',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithCurrentNode,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          state: executionWithCurrentNode.state,
          results: executionWithCurrentNode.results,
          status: executionWithCurrentNode.status,
          currentNodeRef: executionWithCurrentNode.currentNodeRef,
          $nodeResult: expect.any(Function),
          $lastResult: expect.any(Function),
          $now: expect.any(Function),
          $random: expect.any(Function),
          $count: expect.any(Function),
        })
      );
    });

    it('should handle empty results array', async () => {
      const executionWithoutResults: Execution = {
        ...mockExecution,
        results: [],
      };

      const params: ConditionalParams = {
        condition: '$count(results) = 0',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithoutResults,
      });

      const result = await conditional.execute();

      expect(result).toEqual({ result: true, condition: true });
      expect(mockEvaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          state: executionWithoutResults.state,
          results: executionWithoutResults.results,
          status: executionWithoutResults.status,
          currentNodeRef: executionWithoutResults.currentNodeRef,
          $nodeResult: expect.any(Function),
          $lastResult: expect.any(Function),
          $now: expect.any(Function),
          $random: expect.any(Function),
          $count: expect.any(Function),
        })
      );
    });
  });

  describe('Real-world Conditional Scenarios', () => {
    it('should handle user permission checks', async () => {
      const params: ConditionalParams = {
        condition: 'state.user.role in ["admin", "moderator"] and state.user.active = true',
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

      expect(result).toEqual({ result: true, condition: true });
    });

    it('should handle business logic conditions', async () => {
      const params: ConditionalParams = {
        condition: 'state.order.total > 100 and state.customer.loyaltyPoints > 500',
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

      expect(result).toEqual({ result: true, condition: true });
    });

    it('should handle workflow routing decisions', async () => {
      const params: ConditionalParams = {
        condition: 'results[-1].data.confidence > 0.8 ? "high_confidence" : "review_needed"',
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

      expect(result).toEqual({ result: 'high_confidence', condition: 'high_confidence' });
    });
  });
});
