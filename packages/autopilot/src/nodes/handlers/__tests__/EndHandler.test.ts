/**
 * EndHandler Unit Tests
 */

import { EndHandler } from '../EndHandler';
import { Node, ExecutionContext } from '../../../types';

describe('EndHandler', () => {
  let handler: EndHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    handler = new EndHandler();
    mockNode = {
      id: 'end-node',
      type: 'end',
      name: 'End Node',
      description: 'End node for workflow',
      parameters: {}
    };
    mockContext = global.createMockContext();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('end');
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const result = await handler.execute(mockNode, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('end-node');
      expect(result.data).toEqual({ message: 'Workflow completed' });
      expect(result.duration).toBe(0);
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should always succeed regardless of context', async () => {
      const emptyContext = {} as ExecutionContext;
      
      const result = await handler.execute(mockNode, emptyContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('end-node');
    });

    it('should set execution timestamp', async () => {
      const beforeExecution = Date.now();
      const result = await handler.execute(mockNode, mockContext);
      const afterExecution = Date.now();
      
      const executedAtTimestamp = new Date(result.executedAt).getTime();
      expect(executedAtTimestamp).toBeGreaterThanOrEqual(beforeExecution);
      expect(executedAtTimestamp).toBeLessThanOrEqual(afterExecution);
    });
  });

  describe('validate', () => {
    it('should validate successfully for any node', () => {
      const result = handler.validate(mockNode);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate even with empty parameters', () => {
      const nodeWithoutParams = {
        ...mockNode,
        parameters: {}
      };
      
      const result = handler.validate(nodeWithoutParams);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('check-circle');
    });
  });
});