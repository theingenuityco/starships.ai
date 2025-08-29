/**
 * StartHandler Unit Tests
 */

import { StartHandler } from '../StartHandler';
import { Node, ExecutionContext } from '../../../types';

describe('StartHandler', () => {
  let handler: StartHandler;
  let mockNode: Node;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    handler = new StartHandler();
    mockNode = {
      id: 'start-node',
      type: 'start',
      name: 'Start Node',
      description: 'Start node for workflow',
      parameters: {}
    };
    mockContext = global.createMockContext();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('start');
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const result = await handler.execute(mockNode, mockContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('start-node');
      expect(result.data).toEqual({ message: 'Workflow started' });
      expect(result.duration).toBe(0);
      expect(result.executedAt).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should always succeed regardless of context', async () => {
      const emptyContext = {} as ExecutionContext;
      
      const result = await handler.execute(mockNode, emptyContext);
      
      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('start-node');
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
      expect(handler.getIcon()).toBe('play-circle');
    });
  });
});