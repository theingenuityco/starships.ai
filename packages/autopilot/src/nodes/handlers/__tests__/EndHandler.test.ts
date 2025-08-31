/**
 * EndHandler Unit Tests
 */

import { EndHandler } from '../EndHandler';
import { Node, Execution } from '../../../types';

describe('EndHandler', () => {
  let handler: EndHandler;
  let mockNode: Node;
  let mockExecution: Execution;

  beforeEach(() => {
    mockNode = {
      ref: 'end-node',
      type: 'end',
      name: 'End Node',
      description: 'End node for workflow',
      parameters: {}
    };
    handler = new EndHandler(mockNode);
    mockExecution = global.createMockExecution();
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('end');
    });
  });

  describe('execute', () => {
    it('should execute successfully', async () => {
      const result = await handler.execute(mockExecution);
      
      expect(result.executionResults.has('end-node')).toBe(true);
      const nodeResult = result.executionResults.get('end-node');
      expect(nodeResult?.nodeRef).toBe('end-node');
      expect(nodeResult?.data).toEqual({ message: 'Workflow completed' });
      expect(nodeResult?.error).toBeUndefined();
    });

    it('should always succeed regardless of execution state', async () => {
      const emptyExecution = global.createMockExecution();
      
      const result = await handler.execute(emptyExecution);
      
      expect(result.executionResults.has('end-node')).toBe(true);
      const nodeResult = result.executionResults.get('end-node');
      expect(nodeResult?.nodeRef).toBe('end-node');
      expect(nodeResult?.error).toBeUndefined();
    });

    it('should store result in execution results', async () => {
      const result = await handler.execute(mockExecution);
      
      expect(result.executionResults.size).toBeGreaterThan(0);
      expect(result.executionResults.has('end-node')).toBe(true);
      
      const nodeResult = result.executionResults.get('end-node');
      expect(nodeResult?.nodeRef).toBe('end-node');
      expect(nodeResult?.data).toEqual({ message: 'Workflow completed' });
    });
  });

  describe('validate', () => {
    it('should validate successfully for any node', () => {
      const result = handler.validate();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it('should validate even with empty parameters', () => {
      const nodeWithEmptyParams: Node = {
        ref: 'end-node-2',
        type: 'end',
        name: 'End Node 2',
        description: 'End node with empty params',
        parameters: {}
      };
      const handlerWithEmptyParams = new EndHandler(nodeWithEmptyParams);
      
      const result = handlerWithEmptyParams.validate();
      
      expect(result.valid).toBe(true);
    });
  });

  describe('getIcon', () => {
    it('should return correct icon', () => {
      expect(handler.getIcon()).toBe('check-circle');
    });
  });
});