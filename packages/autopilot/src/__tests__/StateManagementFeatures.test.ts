/**
 * State Management Features Test
 *
 * Demonstrates the template-based parameter resolution and JSON Patch transform operations
 * for dynamic state management in autopilot workflows.
 */

import { Engine } from '../engine/Engine';
import { ExecutionItemUtils } from '../utils/ExecutionItemUtils';
import { Blueprint } from '../types';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('State Management Features', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock fetch
    const mockHeaders = new Map([['content-type', 'application/json']]);
    mockHeaders.forEach = jest.fn((callback) => {
      callback('application/json', 'content-type', mockHeaders);
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: 'https://api.example.com/test',
      headers: mockHeaders,
      json: async () => ({ success: true }),
      text: async () => '{"success":true}',
    });
  });

  describe('Template Resolution', () => {
    test('should resolve template expressions in node parameters', async () => {
      const blueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Initialize workflow',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/userId', value: 'user-123' },
                { operation: 'add', path: '/state/sessionStart', value: '{{ $now() }}' },
                { operation: 'add', path: '/state/counter', value: 0 },
              ],
            },
          },
          {
            ref: 'http-call',
            type: 'http_request',
            name: 'API Call',
            description: 'Make HTTP request with dynamic parameters',
            parameters: {
              url: 'https://api.example.com/users/{{ state.userId }}',
              method: 'POST',
              headers: {
                Authorization: 'Bearer {{ state.apiToken }}',
                'Content-Type': 'application/json',
              },
              body: {
                timestamp: '{{ state.sessionStart }}',
                counter: '{{ state.counter }}',
                userAgent: 'Starships-Autopilot/1.0',
              },
              mutations: [
                { operation: 'replace', path: '/state/counter', value: '{{ state.counter + 1 }}' },
                { operation: 'add', path: '/state/lastApiCall', value: '{{ $now() }}' },
                { operation: 'add', path: '/state/apiCallHistory', value: [{ url: '{{ state.userId }}', timestamp: '{{ $now() }}' }] },
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Complete workflow',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/completedAt', value: '{{ $now() }}' },
                { operation: 'add', path: '/state/totalCalls', value: '{{ state.counter }}' },
              ],
            },
          },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'http-call' },
          { ref: 'edge-2', from: 'http-call', to: 'end' },
        ],
        metadata: {
          name: 'State Management Demo',
          version: '1.0.0',
        },
      };

      const engine = new Engine({
        eventCallback: async () => {},
      });
      const execution = ExecutionItemUtils.createExecution();
      execution.state = { apiToken: 'abc123token' };

      // Execute workflow
      await engine.executeBlueprint(blueprint, execution);

      // Verify state transformations were applied
      expect(execution.state.userId).toBe('user-123');
      expect(execution.state.sessionStart).toBeDefined();
      expect(execution.state.counter).toBe(1); // Incremented by http-call transform
      expect(execution.state.lastApiCall).toBeDefined();
      expect(execution.state.completedAt).toBeDefined();
      expect(execution.state.totalCalls).toBe(1);

      // Verify execution completed successfully
      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(3); // start, http-call, end
    });
  });

  describe('Conditional Logic with State', () => {
    test('should use conditional nodes with state-based expressions', async () => {
      const blueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Initialize',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/userTier', value: 'premium' },
                { operation: 'add', path: '/state/requestCount', value: 5 },
              ],
            },
          },
          {
            ref: 'check-tier',
            type: 'conditional',
            name: 'Check User Tier',
            description: 'Determine user privileges',
            parameters: {
              condition: '{{ state.userTier = "premium" and state.requestCount > 3 }}',
              mutations: [
                { operation: 'add', path: '/state/conditionEvaluated', value: '{{ $now() }}' },
                { operation: 'add', path: '/state/isPremiumUser', value: '{{ state.userTier = "premium" }}' },
              ],
            },
          },
          {
            ref: 'premium-action',
            type: 'http_request',
            name: 'Premium Action',
            description: 'Action for premium users',
            parameters: {
              url: 'https://api.example.com/premium/{{ state.userTier }}',
              method: 'GET',
              mutations: [
                { operation: 'add', path: '/state/premiumActionExecuted', value: true },
                { operation: 'add', path: '/state/executionPath', value: 'premium' },
              ],
            },
          },
          {
            ref: 'standard-action',
            type: 'http_request',
            name: 'Standard Action',
            description: 'Action for standard users',
            parameters: {
              url: 'https://api.example.com/standard',
              method: 'GET',
              mutations: [
                { operation: 'add', path: '/state/standardActionExecuted', value: true },
                { operation: 'add', path: '/state/executionPath', value: 'standard' },
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Complete',
            parameters: {},
          },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'check-tier' },
          { ref: 'edge-2', from: 'check-tier', to: 'premium-action', condition: 'true' },
          { ref: 'edge-3', from: 'check-tier', to: 'standard-action', condition: 'false' },
          { ref: 'edge-4', from: 'premium-action', to: 'end' },
          { ref: 'edge-5', from: 'standard-action', to: 'end' },
        ],
        metadata: {
          name: 'Conditional State Demo',
          version: '1.0.0',
        },
      };

      const engine = new Engine({
        eventCallback: async () => {},
      });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      // Verify conditional logic executed correctly
      expect(execution.state.userTier).toBe('premium');
      expect(execution.state.requestCount).toBe(5);
      expect(execution.state.isPremiumUser).toBe(true);
      expect(execution.state.conditionEvaluated).toBeDefined();

      // Should have taken premium path
      expect(execution.state.premiumActionExecuted).toBe(true);
      expect(execution.state.executionPath).toBe('premium');
      expect(execution.state.standardActionExecuted).toBeUndefined();

      expect(execution.status).toBe('completed');
    });
  });

  describe('Error Handling and Validation', () => {
    test('should validate transform operations before execution', async () => {
      const invalidBlueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Start with invalid transform',
            parameters: {
              mutations: [
                { operation: 'add', path: '/invalidPath', value: 'test' }, // Invalid: doesn't start with /state
                { operation: 'invalid' as 'add', path: '/state/test', value: 'test' }, // Invalid operation
              ],
            },
          },
          {
            ref: 'http-call',
            type: 'http_request',
            name: 'HTTP Call',
            description: 'Call with invalid expression',
            parameters: {
              url: '{{ state.invalidFunction(unclosed }', // Invalid JSONata
              method: 'GET',
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'End',
            parameters: {},
          },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'http-call' },
          { ref: 'edge-2', from: 'http-call', to: 'end' },
        ],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      // Should throw validation error before execution
      await expect(engine.executeBlueprint(invalidBlueprint, execution)).rejects.toThrow(/validation failed/i);
    });

    test('should validate transform structure', async () => {
      const invalidTransformBlueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Start with invalid transform structure',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/valid', value: 'test' },
                { operation: 'copy', path: '/state/copied' } as unknown as { operation: 'copy'; path: string; from: string }, // Missing required 'from' property
                { operation: 'replace', path: '/state/noValue' } as unknown as { operation: 'replace'; path: string; value: unknown }, // Missing required 'value' property
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'End',
            parameters: {},
          },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      // Should throw validation error for invalid transforms
      await expect(engine.executeBlueprint(invalidTransformBlueprint, execution)).rejects.toThrow(/validation failed/i);
    });
  });

  describe('Complex State Mutations', () => {
    test('should handle complex JSON Patch operations', async () => {
      const blueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Initialize complex state',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/metrics', value: { requests: 0, errors: 0, successRate: 0 } },
                { operation: 'add', path: '/state/userSessions', value: [] },
                { operation: 'add', path: '/state/startTime', value: '{{ $now() }}' },
              ],
            },
          },
          {
            ref: 'process-data',
            type: 'http_request',
            name: 'Process Data',
            description: 'Process with complex state updates',
            parameters: {
              url: 'https://api.example.com/process',
              method: 'POST',
              body: {
                sessionCount: '{{ $count(state.userSessions) }}',
                metrics: '{{ state.metrics }}',
              },
              mutations: [
                // Increment metrics counter
                { operation: 'replace', path: '/state/metrics/requests', value: '{{ state.metrics.requests + 1 }}' },

                // Add new session data
                { operation: 'add', path: '/state/userSessions/-', value: { id: '{{ $random() }}', timestamp: '{{ $now() }}' } },

                // Calculate success rate (after incrementing requests)
                {
                  operation: 'replace',
                  path: '/state/metrics/successRate',
                  value:
                    '{{ (state.metrics.requests + 1) > 0 ? ((state.metrics.requests + 1) - state.metrics.errors) / (state.metrics.requests + 1) : 0 }}',
                },

                // Add to execution history
                { operation: 'add', path: '/state/executionHistory', value: [] },
                {
                  operation: 'add',
                  path: '/state/executionHistory/-',
                  value: { node: 'process-data', timestamp: '{{ $now() }}', success: true },
                },
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Finalize',
            parameters: {
              mutations: [
                { operation: 'add', path: '/state/endTime', value: '{{ $now() }}' },
                { operation: 'copy', path: '/state/finalMetrics', from: '/state/metrics' },
              ],
            },
          },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'process-data' },
          { ref: 'edge-2', from: 'process-data', to: 'end' },
        ],
        metadata: {},
      };
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);

      // Verify complex state mutations
      expect(execution.state.metrics).toEqual({
        requests: 1,
        errors: 0,
        successRate: 1,
      });

      expect(execution.state.userSessions).toHaveLength(1);
      expect((execution.state.userSessions as unknown[])[0]).toHaveProperty('id');
      expect((execution.state.userSessions as unknown[])[0]).toHaveProperty('timestamp');

      expect(execution.state.executionHistory).toHaveLength(1);
      expect((execution.state.executionHistory as unknown[])[0]).toMatchObject({
        node: 'process-data',
        success: true,
      });

      expect(execution.state.finalMetrics).toEqual(execution.state.metrics);
      expect(execution.status).toBe('completed');
    });
  });

  describe('JSON Patch Operations', () => {
    test('should support all JSON Patch operations', async () => {
      const blueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Test JSON Patch operations',
            parameters: {
              mutations: [
                // Add operations
                { operation: 'add', path: '/state/original', value: { name: 'test', count: 5 } },
                { operation: 'add', path: '/state/list', value: [1, 2, 3] },

                // Replace operation
                { operation: 'replace', path: '/state/original/name', value: 'updated' },

                // Add to array
                { operation: 'add', path: '/state/list/-', value: 4 },

                // Copy operation
                { operation: 'copy', path: '/state/backup', from: '/state/original' },

                // Move operation
                { operation: 'move', path: '/state/moved', from: '/state/list' },

                // Test operation (will pass)
                { operation: 'test', path: '/state/original/name', value: 'updated' },
              ],
            },
          },
          {
            ref: 'cleanup',
            type: 'start', // Using start as a simple node type
            name: 'Cleanup',
            description: 'Remove some data',
            parameters: {
              mutations: [
                // Remove operation
                { operation: 'remove', path: '/state/original/count' },
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'End',
            parameters: {},
          },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'cleanup' },
          { ref: 'edge-2', from: 'cleanup', to: 'end' },
        ],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);
      // Verify all operations worked correctly
      expect(execution.state.original).toEqual({ name: 'updated' }); // count removed
      expect(execution.state.backup).toEqual({ name: 'updated', count: 5 }); // copied before count removal
      expect(execution.state.moved).toEqual([1, 2, 3, 4]); // moved from list with added item
      expect(execution.state.list).toBeUndefined(); // moved away

      expect(execution.status).toBe('completed');
    });
  });
});
