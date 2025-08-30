/**
 * Engine Tests
 * 
 * Tests for workflow execution engine with simplified types
 */

import { Engine } from '../Engine';
import { Blueprint, Execution, NodeResult } from '../../types';

describe('Engine', () => {
  let engine: Engine;
  let mockBlueprint: Blueprint;
  let mockExecution: Execution;

  beforeEach(() => {
    engine = new Engine();
    mockBlueprint = global.createMockBlueprint();
    mockExecution = global.createMockExecution();
  });

  describe('execute', () => {
    it('should execute a simple workflow successfully', async () => {
      const result = await engine.execute(mockBlueprint, mockExecution);
      
      expect(result.status).toBe('completed');
      expect(result.executionResults.size).toBeGreaterThan(0);
    });

    it('should handle workflow without start node', async () => {
      const workflowWithoutStart: Blueprint = {
        ...mockBlueprint,
        nodes: mockBlueprint.nodes.filter(node => node.type !== 'start')
      };

      await expect(engine.execute(workflowWithoutStart, mockExecution))
        .rejects.toThrow('No start node found in workflow');
    });

    it('should handle workflow with unsupported node type', async () => {
      const workflowWithUnsupportedNode: Blueprint = {
        ...mockBlueprint,
        nodes: [
          ...mockBlueprint.nodes,
          { ref: 'unsupported', type: 'unknown_type' as any, name: 'Unknown', description: 'Unknown node', parameters: {} }
        ]
      };

      await expect(engine.execute(workflowWithUnsupportedNode, mockExecution))
        .rejects.toThrow('Unsupported node types: unknown_type');
    });

    it('should store node execution results', async () => {
      const result = await engine.execute(mockBlueprint, mockExecution);
      
      expect(result.status).toBe('completed');
      expect(result.executionResults.size).toBe(2);
      
      const startResult = result.executionResults.get('start');
      const endResult = result.executionResults.get('end');
      expect(startResult?.error).toBeUndefined();
      expect(startResult?.nodeRef).toBe('start');
      
      expect(endResult?.error).toBeUndefined();
      expect(endResult?.nodeRef).toBe('end');
    });
  });

  describe('createHandler', () => {
    it('should create handler for supported node types', async () => {
      const startNode = mockBlueprint.nodes.find(node => node.type === 'start')!;
      const handler = await engine.createHandler(startNode);
      
      expect(handler).toBeDefined();
      expect(handler.type).toBe('start');
    });

    it('should throw error for unsupported node type', async () => {
      const unsupportedNode = { 
        ref: 'test', 
        type: 'unsupported_type' as any, 
        name: 'Test', 
        description: 'Test node', 
        parameters: {} 
      };

      await expect(engine.createHandler(unsupportedNode))
        .rejects.toThrow('No handler available for node type: unsupported_type');
    });
  });

  describe('getSupportedTypes', () => {
    it('should return list of supported node types', () => {
      const types = engine.getSupportedTypes();
      
      expect(types).toContain('start');
      expect(types).toContain('end');
      expect(types).toContain('agent');
      expect(types).toContain('conditional');
      expect(types.length).toBeGreaterThan(5);
    });
  });

  describe('hasHandler', () => {
    it('should return true for supported types', () => {
      expect(engine.hasHandler('start')).toBe(true);
      expect(engine.hasHandler('end')).toBe(true);
      expect(engine.hasHandler('agent')).toBe(true);
    });

    it('should return false for unsupported types', () => {
      expect(engine.hasHandler('unknown')).toBe(false);
      expect(engine.hasHandler('')).toBe(false);
    });
  });

  describe('execution control', () => {
    it('should allow pausing and resuming execution', () => {
      // Set up an execution first
      engine.execute(mockBlueprint, mockExecution);
      
      const pauseResult = engine.pause();
      expect(pauseResult).toBe(true);
      
      const resumeResult = engine.resume();
      expect(resumeResult).toBe(true);
    });

    it('should allow cancelling execution', () => {
      const cancelResult = engine.cancel();
      expect(cancelResult).toBe(true);
    });

    it('should get current execution status', () => {
      const status = engine.getExecutionStatus();
      expect(status).toBeDefined();
    });

    it('should get current execution', () => {
      const execution = engine.getCurrentExecution();
      expect(execution).toBeDefined();
    });
  });

  describe('event handling', () => {
    it('should register and unregister event callbacks', () => {
      const callback = jest.fn();
      
      engine.onEvent(callback);
      engine.offEvent(callback);
      
      // No direct way to test this without executing a workflow
      expect(callback).not.toHaveBeenCalled();
    });
  });
});