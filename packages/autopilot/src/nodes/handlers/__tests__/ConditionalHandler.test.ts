/**
 * ConditionalHandler Tests
 *
 * Tests for conditional node handler with simplified types
 */

import { ConditionalHandler } from '@/nodes/handlers/ConditionalHandler';
import { Node, Execution, ConditionalNodeParameters, NodeResult } from '@/types';

describe('ConditionalHandler', () => {
  let handler: ConditionalHandler;
  let mockNode: Node;
  let mockExecution: Execution;
  let mockSourceResult: NodeResult;

  beforeEach(() => {
    mockSourceResult = {
      nodeRef: 'source-node',
      data: { value: 42, status: 'active', items: [1, 2, 3] },
    };

    const parameters: ConditionalNodeParameters = {
      sourceNodeId: 'source-node',
      expression: '$$.value > 30', // Required field
      conditions: {
        high_value: '$$.value > 30',
        active_status: '$$.status = "active"',
        has_items: '$count($$.items) > 0',
      },
      defaultCondition: 'default',
    };

    mockNode = {
      ref: 'conditional-node',
      type: 'conditional',
      name: 'Conditional Node',
      description: 'Decision point in workflow',
      parameters,
    };

    handler = new ConditionalHandler(mockNode);
    mockExecution = global.createMockExecution();
    mockExecution.executionResults.set('source-node', mockSourceResult);
  });

  describe('execute', () => {
    it('should evaluate conditions and return matching condition', async () => {
      const result = await handler.execute(mockExecution);

      expect(result.status).toBe('not_started');
      expect(result.executionResults.size).toBe(2); // source + conditional

      const nodeResult = result.executionResults.get('conditional-node');
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('conditional-node');
      expect((nodeResult?.data as any)?.conditionMet).toBe('high_value'); // First matching condition
      expect(nodeResult?.nextEdgeCondition).toBe('high_value');
    });

    it('should return default condition when no conditions match', async () => {
      // Update source data to not match any conditions
      mockSourceResult.data = { value: 10, status: 'inactive', items: [] };
      mockExecution.executionResults.set('source-node', mockSourceResult);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('conditional-node');
      expect(nodeResult?.error).toBeUndefined();
      expect((nodeResult?.data as any)?.conditionMet).toBe('default');
      expect(nodeResult?.nextEdgeCondition).toBe('default');
    });

    it('should handle missing source node', async () => {
      mockExecution.executionResults.clear();

      await expect(handler.execute(mockExecution)).rejects.toThrow('Source node source-node not found in execution results');
    });

    it('should handle JSONata evaluation errors', async () => {
      // Create a node with invalid JSONata expression
      const invalidParams: ConditionalNodeParameters = {
        sourceNodeId: 'source-node',
        expression: '$$.value > 10',
        conditions: {
          invalid: '$$.invalidFunction()',
        },
        defaultCondition: 'error',
      };

      const invalidNode = { ...mockNode, parameters: invalidParams };
      const invalidHandler = new ConditionalHandler(invalidNode);

      const result = await invalidHandler.execute(mockExecution);

      const nodeResult = result.executionResults.get('conditional-node');
      expect(nodeResult?.error).toContain('JSONata evaluation failed');
    });

    it('should include source data in result', async () => {
      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('conditional-node');
      expect((nodeResult?.data as any)?.sourceData).toEqual(mockSourceResult.data);
    });

    it('should evaluate conditions in order and return first match', async () => {
      // Both conditions will match, but should return the first one
      mockSourceResult.data = { value: 50, status: 'active' };
      mockExecution.executionResults.set('source-node', mockSourceResult);

      const result = await handler.execute(mockExecution);

      const nodeResult = result.executionResults.get('conditional-node');
      expect((nodeResult?.data as any)?.conditionMet).toBe('high_value'); // First in object order
    });

    it('should handle boolean true results only', async () => {
      // Create conditions that return truthy but not true values
      const parameters: ConditionalNodeParameters = {
        sourceNodeId: 'source-node',
        expression: '$$.value > 30',
        conditions: {
          truthy: '$$.value', // Returns 42 (truthy but not true)
          actual_true: '$$.value > 30', // Returns true
        },
      };

      const testNode = { ...mockNode, parameters };
      const testHandler = new ConditionalHandler(testNode);

      const result = await testHandler.execute(mockExecution);

      const nodeResult = result.executionResults.get('conditional-node');
      expect((nodeResult?.data as any)?.conditionMet).toBe('actual_true'); // Should skip truthy value
    });
  });

  describe('validate', () => {
    it('should validate required fields', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require source node ID', () => {
      const invalidParams = { ...mockNode.parameters };
      delete (invalidParams as any).sourceNodeId;
      const invalidNode = { ...mockNode, parameters: invalidParams };
      const invalidHandler = new ConditionalHandler(invalidNode);

      const result = invalidHandler.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.message.includes('Source node ID'))).toBe(true);
    });

    it('should require at least one condition', () => {
      const invalidParams = { ...mockNode.parameters, conditions: {} };
      const invalidNode = { ...mockNode, parameters: invalidParams };
      const invalidHandler = new ConditionalHandler(invalidNode);

      const result = invalidHandler.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.message.includes('At least one condition'))).toBe(true);
    });

    it('should validate JSONata expressions', () => {
      const invalidParams: ConditionalNodeParameters = {
        sourceNodeId: 'source-node',
        expression: '$$.value > 10',
        conditions: {
          valid: '$$.value > 10',
          invalid: '$$.invalidSyntax[', // Invalid JSONata
        },
      };
      const invalidNode = { ...mockNode, parameters: invalidParams };
      const invalidHandler = new ConditionalHandler(invalidNode);

      const result = invalidHandler.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.message.includes('Invalid JSONata expression'))).toBe(true);
    });
  });

  describe('getIcon', () => {
    it('should return git-branch icon', () => {
      expect(handler.getIcon()).toBe('git-branch');
    });
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('conditional');
    });
  });
});
