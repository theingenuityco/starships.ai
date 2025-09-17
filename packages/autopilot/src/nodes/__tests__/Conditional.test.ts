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
      { nodeRef: 'start', items: [{ json: { initialized: true }, pairedItem: { item: 0 } }] },
      { nodeRef: 'previous', items: [{ json: { value: 42, success: true }, pairedItem: { item: 0 } }] },
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
    it('should handle static string conditions', async () => {
      const params: ConditionalParams = {
        condition: 'premium_user',
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'premium_user', result: 'premium_user' });
      // JSONata should not be called for static strings
      expect(mockJsonata).not.toHaveBeenCalled();
    });

    it('should evaluate JSONata expressions with template syntax', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.isPremium = true }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      // JSONata should be called for template expressions
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should evaluate JSONata string comparison expression', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.level = "gold" }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should evaluate JSONata numeric comparison expression', async () => {
      const params: ConditionalParams = {
        condition: '{{ results[-1].data.value > 40 }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should return false for failing JSONata conditions', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.isPremium = false }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(false);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'false', result: false });
      expect(mockJsonata).toHaveBeenCalled();
    });
  });

  describe('Complex Expression Evaluation', () => {
    it('should handle complex logical operations', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.isPremium and results[-1].data.success }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle nested object access', async () => {
      const params: ConditionalParams = {
        condition: '{{ results[$ ~> $filter(function($v) { $v.nodeRef = "previous" })][-1].data.value > 30 }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
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
        condition: '{{ $count(state.items[$>state.threshold]) > 1 }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithArrays,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle string matching operations', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.level ~> /^(gold|platinum)$/ }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue('gold');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'gold', result: 'gold' });
      expect(mockJsonata).toHaveBeenCalled();
    });
  });

  describe('Return Value Types', () => {
    it('should return static string values', async () => {
      const params: ConditionalParams = {
        condition: 'high_priority',
      };

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result[0].json).toEqual({ edgeCondition: 'high_priority', result: 'high_priority' });
      expect(result.length).toBe(1);
      expect(mockJsonata).not.toHaveBeenCalled();
    });

    it('should return JSONata evaluated string values', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.level }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue('premium');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result[0].json).toEqual({ edgeCondition: 'premium', result: 'premium' });
      expect(result.length).toBe(1);
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should return JSONata evaluated numeric values', async () => {
      const params: ConditionalParams = {
        condition: '{{ results[-1].data.value }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(42);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result[0].json).toEqual({ edgeCondition: '42', result: 42 });
      expect(result.length).toBe(1);
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle null/undefined JSONata values', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.nonexistent }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(undefined);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result[0].json).toEqual({ edgeCondition: 'null', result: undefined });
      expect(result.length).toBe(1);
      expect(mockJsonata).toHaveBeenCalled();
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

    it('should handle missing execution context for JSONata expressions', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.isPremium }}',
      };

      const conditional = new Conditional(params, {
        // Missing execution context
      });

      await expect(conditional.execute()).rejects.toThrow('Execution context is required for conditional evaluation');
    });

    it('should not require execution context for static strings', async () => {
      const params: ConditionalParams = {
        condition: 'static_value',
      };

      const conditional = new Conditional(params, {
        // Missing execution context
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'static_value', result: 'static_value' });
      expect(mockJsonata).not.toHaveBeenCalled();
    });
  });

  describe('Virtual Node Pattern', () => {
    it('should work as standalone conditional node', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.isPremium = true }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should integrate with Engine virtual node pattern', () => {
      // This test verifies the virtual node pattern integration
      // The actual testing is done through Engine integration tests
      const params: ConditionalParams = {
        condition: 'static_edge_value',
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
        condition: 'valid_static_condition',
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
        condition: '{{ status = "running" }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: mockExecution,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should have access to current node ref', async () => {
      const executionWithCurrentNode: Execution = {
        ...mockExecution,
        currentNodeRef: 'conditional-1',
      };

      const params: ConditionalParams = {
        condition: '{{ currentNodeRef = "conditional-1" }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithCurrentNode,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle empty results array', async () => {
      const executionWithoutResults: Execution = {
        ...mockExecution,
        results: [],
      };

      const params: ConditionalParams = {
        condition: '{{ $count(outputs) = 0 }}',
      };

      const mockEvaluate = jest.fn().mockReturnValue(true);
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithoutResults,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });
  });

  describe('Real-world Conditional Scenarios', () => {
    it('should handle user permission checks', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.user.role in ["admin", "moderator"] and state.user.active = true }}',
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

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle business logic conditions', async () => {
      const params: ConditionalParams = {
        condition: '{{ state.order.total > 100 and state.customer.loyaltyPoints > 500 }}',
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

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'true', result: true });
      expect(mockJsonata).toHaveBeenCalled();
    });

    it('should handle workflow routing decisions', async () => {
      const params: ConditionalParams = {
        condition: '{{ outputs[-1].items[0].json.confidence > 0.8 ? "high_confidence" : "review_needed" }}',
      };

      const executionWithConfidence: Execution = {
        ...mockExecution,
        results: [{ nodeRef: 'analysis', items: [{ json: { confidence: 0.95, category: 'positive' }, pairedItem: { item: 0 } }] }],
      };

      const mockEvaluate = jest.fn().mockReturnValue('high_confidence');
      mockJsonata.mockReturnValue({
        evaluate: mockEvaluate,
      });

      const conditional = new Conditional(params, {
        execution: executionWithConfidence,
      });

      const result = await conditional.execute();

      expect(result).toHaveLength(1);
      expect(result[0].json).toEqual({ edgeCondition: 'high_confidence', result: 'high_confidence' });
      expect(mockJsonata).toHaveBeenCalled();
    });
  });
});
