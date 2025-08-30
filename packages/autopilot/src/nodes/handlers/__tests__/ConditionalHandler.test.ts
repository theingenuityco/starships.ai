/**
 * ConditionalHandler Unit Tests
 */

import { ConditionalHandler } from '../ConditionalHandler';
import { Node, ExecutionContext, ConditionalNodeParameters, NodeResult } from '../../../types';

describe('ConditionalHandler', () => {
  let handler: ConditionalHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;
  let mockSourceResult: NodeResult;

  beforeEach(() => {
    mockSourceResult = {
      nodeId: 'source-node',
      success: true,
      data: {
        score: 85,
        category: 'premium',
        user: { age: 30, name: 'John' }
      },
      executedAt: new Date().toISOString(),
      duration: 100
    };

    mockNode = {
      id: 'conditional-node',
      type: 'conditional',
      name: 'Test Conditional Node',
      description: 'Conditional node for testing',
      parameters: {
        sourceNodeId: 'source-node',
        expression: 'score >= 80', // Main expression (using first condition)
        conditions: {
          'high-score': 'score >= 80',
          'premium': 'category = "premium"',
          'adult': 'user.age >= 18'
        },
        defaultCondition: 'default'
      } as ConditionalNodeParameters
    };

    handler = new ConditionalHandler(mockNode);

    mockContext = {
      ...global.createMockContext(),
      previousResults: new Map([
        ['source-node', mockSourceResult]
      ])
    };
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('conditional');
    });
  });

  describe('execute', () => {
    it('should execute successfully and return first matching condition', async () => {
      const result = await handler.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('conditional-node');
      expect(result.data).toEqual({
        conditionMet: 'high-score',
        sourceData: mockSourceResult.data
      });
      expect(result.nextEdgeCondition).toBe('high-score');
      expect(result.executedAt).toBeDefined();
      expect(result.duration).toBe(10);
      expect(result.error).toBeUndefined();
    });

    it('should return default condition when no conditions match', async () => {
      // Create handler with conditions that definitely won't match the data
      const paramsWithNoMatches = {
        sourceNodeId: 'source-node',
        expression: 'score > 1000',
        conditions: {
          'impossible-high': 'score > 1000',  // 85 > 1000 = false
          'wrong-category': 'category = "nonexistent"',  // "premium" = "nonexistent" = false
          'too-old': 'user.age > 100'  // 30 > 100 = false
        },
        defaultCondition: 'default'
      } as ConditionalNodeParameters;
      
      const handlerWithNoMatches = new ConditionalHandler({
        id: 'no-matches-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithNoMatches
      });
      
      const result = await handlerWithNoMatches.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        conditionMet: 'default',
        sourceData: mockSourceResult.data
      });
      expect(result.nextEdgeCondition).toBe('default');
    });

    it('should use "default" as fallback when no defaultCondition specified', async () => {
      const paramsWithoutDefault = {
        sourceNodeId: 'source-node',
        expression: 'score > 1000',
        conditions: {
          'never-true': 'score > 1000'  // 85 > 1000 = false
        },
        defaultCondition: undefined
      } as ConditionalNodeParameters;
      
      const handlerWithoutDefault = new ConditionalHandler({
        id: 'no-default-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithoutDefault
      });
      
      const result = await handlerWithoutDefault.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect((result.data as any).conditionMet).toBe('default');
      expect(result.nextEdgeCondition).toBe('default');
    });

    it('should handle complex JSONata expressions', async () => {
      const complexParams = {
        sourceNodeId: 'source-node',
        expression: '$sum(scores) > 100',
        conditions: {
          'complex': '$sum(scores) > 100 and category in ["premium", "gold"]',
          'nested': 'user.profile.settings.notifications = true'
        }
      } as ConditionalNodeParameters;

      const complexHandler = new ConditionalHandler({
        id: 'complex-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: complexParams
      });

      const complexSourceResult: NodeResult = {
        ...mockSourceResult,
        data: {
          scores: [40, 35, 30],
          category: 'premium',
          user: {
            profile: {
              settings: {
                notifications: true
              }
            }
          }
        }
      };
      
      const complexContext = {
        ...mockContext,
        previousResults: new Map([['source-node', complexSourceResult]])
      };
      
      const result = await complexHandler.execute(complexContext);
      
      expect(result.success).toBe(true);
      expect((result.data as any).conditionMet).toBe('complex');
    });

    it('should fail when source node is not found', async () => {
      const emptyContext = {
        ...mockContext,
        previousResults: new Map() // Empty results
      };
      
      await expect(handler.execute(emptyContext))
        .rejects
        .toThrow('Source node source-node not found in execution results');
    });

    it('should handle JSONata evaluation errors gracefully', async () => {
      const paramsWithInvalidExpression = {
        sourceNodeId: 'source-node',
        expression: 'score ++ invalid',
        conditions: {
          'invalid': 'score ++ invalid' // Invalid JSONata operator syntax
        }
      } as ConditionalNodeParameters;
      
      const handlerWithInvalidExpression = new ConditionalHandler({
        id: 'invalid-expression-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithInvalidExpression
      });
      
      const result = await handlerWithInvalidExpression.execute(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('JSONata evaluation failed');
      expect(result.nodeId).toBe('invalid-expression-node');
      expect(result.duration).toBe(10);
    });

    it('should handle conditions that evaluate to falsy values', async () => {
      const paramsWithFalsyConditions = {
        sourceNodeId: 'source-node',
        expression: 'score > 1000',
        conditions: {
          'too-high': 'score > 1000',        // false
          'missing-field': 'missingField',   // undefined
          'zero-result': 'score * 0'         // 0 (falsy)
        },
        defaultCondition: 'fallback'
      } as ConditionalNodeParameters;
      
      const handlerWithFalsyConditions = new ConditionalHandler({
        id: 'falsy-conditions-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithFalsyConditions
      });
      
      const result = await handlerWithFalsyConditions.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect((result.data as any).conditionMet).toBe('fallback');
      expect(result.nextEdgeCondition).toBe('fallback');
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockContext);
      const afterExecution = Date.now();
      
      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });
  });

  describe('validate', () => {
    it('should validate successfully with valid parameters', () => {
      const result = handler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should fail validation when sourceNodeId is missing', () => {
      const paramsWithoutSource = {
        sourceNodeId: '',
        expression: 'score > 50',
        conditions: { 'test': 'score > 50' }
      } as ConditionalNodeParameters;
      
      const handlerWithoutSource = new ConditionalHandler({
        id: 'no-source-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithoutSource
      });
      const result = handlerWithoutSource.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'Source node ID is required',
        nodeId: 'no-source-node',
        severity: 'error'
      });
    });

    it('should fail validation when sourceNodeId is empty string', () => {
      const paramsWithEmptySource = {
        sourceNodeId: '',
        expression: 'score > 50',
        conditions: { 'test': 'score > 50' }
      } as ConditionalNodeParameters;
      
      const handlerWithEmptySource = new ConditionalHandler({
        id: 'empty-source-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithEmptySource
      });
      const result = handlerWithEmptySource.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('Source node ID is required');
    });

    it('should fail validation when conditions are missing', () => {
      const paramsWithoutConditions = {
        sourceNodeId: 'source-node',
        expression: 'true',
        conditions: {}
      } as ConditionalNodeParameters;
      
      const handlerWithoutConditions = new ConditionalHandler({
        id: 'no-conditions-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithoutConditions
      });
      const result = handlerWithoutConditions.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        code: 'MISSING_REQUIRED_FIELD',
        message: 'At least one condition is required',
        nodeId: 'no-conditions-node',
        severity: 'error'
      });
    });

    it('should fail validation when conditions object is empty', () => {
      const paramsWithEmptyConditions = {
        sourceNodeId: 'source-node',
        expression: 'true',
        conditions: {}
      } as ConditionalNodeParameters;
      
      const handlerWithEmptyConditions = new ConditionalHandler({
        id: 'empty-conditions-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithEmptyConditions
      });
      const result = handlerWithEmptyConditions.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_REQUIRED_FIELD');
      expect(result.errors[0].message).toBe('At least one condition is required');
    });

    it('should fail validation for invalid JSONata expressions', () => {
      const paramsWithInvalidExpressions = {
        sourceNodeId: 'source-node',
        expression: 'score >= 80',
        conditions: {
          'valid': 'score >= 80',
          'invalid1': 'score >=<= 80', // Invalid syntax
          'invalid2': 'score + + 10'   // Invalid syntax
        }
      } as ConditionalNodeParameters;
      
      const handlerWithInvalidExpressions = new ConditionalHandler({
        id: 'invalid-expressions-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithInvalidExpressions
      });
      const result = handlerWithInvalidExpressions.validate();
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      const invalidErrors = result.errors.filter(err =>
        err.code === 'INVALID_JSONATA_EXPRESSION'
      );
      expect(invalidErrors.length).toBe(2);
      
      expect(invalidErrors[0].message).toContain('Invalid JSONata expression for condition \'invalid1\'');
      expect(invalidErrors[1].message).toContain('Invalid JSONata expression for condition \'invalid2\'');
    });

    it('should validate complex JSONata expressions', () => {
      const paramsWithComplexExpressions = {
        sourceNodeId: 'source-node',
        expression: '$sum(scores) > $average(scores) * 2',
        conditions: {
          'complex1': '$sum(scores) > $average(scores) * 2',
          'complex2': '($filter(items, function($v) { $v.active = true }) ~> $count()) > 0',
          'complex3': 'user.profile.settings.theme in ["dark", "light"]'
        }
      } as ConditionalNodeParameters;
      
      const handlerWithComplexExpressions = new ConditionalHandler({
        id: 'complex-expressions-node',
        type: 'conditional',
        name: 'Test Conditional Node',
        description: 'Conditional node for testing',
        parameters: paramsWithComplexExpressions
      });
      const result = handlerWithComplexExpressions.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('git-branch');
    });
  });
});