/**
 * Engine Integration Tests
 *
 * Tests for the core workflow execution engine with simple to complex workflows
 */

import { Engine } from '../Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Blueprint, NodeType } from '@/types';

// Test utilities
const createMockBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
  nodes: [
    { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
    { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
  ],
  edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
  metadata: {},
  ...overrides,
});

describe('Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Engine Functionality', () => {
    it('should execute a simple start->end workflow', async () => {
      const blueprint: Blueprint = createMockBlueprint();

      const eventCallback = jest.fn();
      const engine = new Engine({ eventCallback });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(2);
      expect(execution.results[0].nodeRef).toBe('start');
      expect(execution.results[1].nodeRef).toBe('end');

      // Check events were emitted
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow_started',
        })
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow_completed',
        })
      );
    });

    it('should validate workflow before execution', async () => {
      const blueprint: Blueprint = {
        nodes: [], // No start node
        edges: [],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      await expect(engine.executeBlueprint(blueprint, execution)).rejects.toThrow('Blueprint must have a start node');
      expect(execution.status).toBe('failed');
    });

    it('should handle unsupported node types', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          { ref: 'invalid', type: 'invalid_type' as NodeType, name: 'Invalid', description: 'Invalid', parameters: {} },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'invalid' }],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      await expect(engine.executeBlueprint(blueprint, execution)).rejects.toThrow('Unsupported node types: invalid_type');
    });
  });

  describe('Workflow State Management', () => {
    it('should track execution state correctly', async () => {
      const blueprint: Blueprint = createMockBlueprint();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      expect(execution.status).toBe('not_started');

      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');
      expect(execution.currentNodeRef).toBeUndefined(); // Cleared after completion
    });

    it('should handle workflow pause and resume', async () => {
      const blueprint: Blueprint = createMockBlueprint();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      // Can't pause not started execution
      expect(engine.pause(execution)).toBe(false);

      await engine.executeBlueprint(blueprint, execution);

      // Can't pause completed workflow
      expect(engine.pause(execution)).toBe(false);
    });

    it('should handle workflow cancellation', async () => {
      const blueprint: Blueprint = createMockBlueprint();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      expect(engine.cancel(execution)).toBe(true);
      expect(execution.status).toBe('cancelled');

      // Reset execution and complete it
      const completedExecution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, completedExecution);

      // Can't cancel completed workflow
      expect(engine.cancel(completedExecution)).toBe(false);
    });
  });

  describe('Node Handler Creation', () => {
    it('should create handlers for supported node types', async () => {
      const engine = new Engine();

      expect(engine.hasHandler('start')).toBe(true);
      expect(engine.hasHandler('end')).toBe(true);
      expect(engine.hasHandler('agent')).toBe(true);
      expect(engine.hasHandler('workflow')).toBe(true);
      expect(engine.hasHandler('llm')).toBe(true);
      expect(engine.hasHandler('http_request')).toBe(true);
      expect(engine.hasHandler('user_prompt')).toBe(true);
      expect(engine.hasHandler('conditional')).toBe(true);
      expect(engine.hasHandler('invalid_type')).toBe(false);
    });

    it('should create handler instances dynamically', async () => {
      const blueprint: Blueprint = createMockBlueprint();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      const startNode = blueprint.nodes.find((n) => n.type === 'start')!;
      const handler = await engine.createHandler(startNode, {}, execution);

      expect(handler).toBeDefined();
      expect(typeof handler.execute).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle execution errors gracefully', async () => {
      // Create a blueprint with an HTTP node that will fail
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'http',
            type: 'http_request',
            name: 'HTTP',
            description: 'HTTP Request',
            parameters: {
              url: 'invalid-url',
              method: 'GET',
            },
          },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'http' }],
        metadata: {},
      };

      const eventCallback = jest.fn();
      const engine = new Engine({ eventCallback });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('failed');
      expect(execution.error).toBeDefined();
      expect(execution.error?.code).toBe('SYSTEM_ERROR');

      // Check failure event was emitted
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workflow_failed',
        })
      );
    });
  });
});
