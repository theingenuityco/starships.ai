/**
 * StartHandler Tests
 *
 * Tests for start node handler with simplified types
 */

import { StartHandler } from '@/nodes/handlers/StartHandler';
import { Node, Execution } from '@/types';

describe('StartHandler', () => {
  let handler: StartHandler;
  let mockNode: Node;
  let mockExecution: Execution;

  beforeEach(() => {
    mockNode = {
      ref: 'start-node',
      type: 'start',
      name: 'Start Node',
      description: 'Starting point of workflow',
      parameters: {},
    };
    handler = new StartHandler(mockNode);
    mockExecution = global.createMockExecution();
  });

  describe('execute', () => {
    it('should execute successfully and store result', async () => {
      const result = await handler.execute(mockExecution);

      expect(result.status).toBe('not_started');
      expect(result.executionResults.size).toBe(1);

      const nodeResult = result.executionResults.get('start-node');
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('start-node');
      expect(nodeResult?.data).toEqual({ message: 'Workflow started' });
    });

    it('should work with any execution state', async () => {
      const customExecution: Execution = global.createMockExecution({
        status: 'running',
      });

      const result = await handler.execute(customExecution);

      expect(result.status).toBe('running');
      const nodeResult = result.executionResults.get('start-node');
      expect(nodeResult?.error).toBeUndefined();
      expect(nodeResult?.nodeRef).toBe('start-node');
    });

    it('should preserve existing execution results', async () => {
      // Add some existing results
      mockExecution.executionResults.set('existing-node', {
        nodeRef: 'existing-node',
        data: { test: 'data' },
      });

      const result = await handler.execute(mockExecution);

      expect(result.executionResults.size).toBe(2);
      expect(result.executionResults.get('existing-node')).toBeDefined();
      expect(result.executionResults.get('start-node')).toBeDefined();
    });

    it('should set execution timestamp within reasonable time', async () => {
      const beforeTime = new Date().getTime();
      const result = await handler.execute(mockExecution);
      const afterTime = new Date().getTime();

      const nodeResult = result.executionResults.get('start-node');
      expect(nodeResult).toBeDefined();
    });
  });

  describe('validate', () => {
    it('should always return valid result', () => {
      const result = handler.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });
  });

  describe('getIcon', () => {
    it('should return play icon', () => {
      expect(handler.getIcon()).toBe('play');
    });
  });

  describe('type', () => {
    it('should have correct type', () => {
      expect(handler.type).toBe('start');
    });
  });
});
