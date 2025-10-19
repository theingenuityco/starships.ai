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
              reducers: [
                {
                  code:
                    "(state, ctx) => ({ ...state, userId: 'user-123', sessionStart: new Date().toISOString(), counter: 0 })",
                },
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
              reducers: [
                {
                  code:
                    '(state, ctx) => { const history = Array.isArray(state.apiCallHistory) ? state.apiCallHistory.slice() : []; history.push({ url: state.userId, timestamp: new Date().toISOString() }); return { ...state, counter: (state.counter ?? 0) + 1, lastApiCall: new Date().toISOString(), apiCallHistory: history }; }',
                },
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Complete workflow',
            parameters: {
              reducers: [
                { code: '(state) => ({ ...state, completedAt: new Date().toISOString(), totalCalls: state.counter })' },
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
      expect(execution.results).toHaveLength(6); // start, inline_mutate, http-call, inline_mutate, end, inline_mutate
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
              reducers: [
                { code: "(state) => ({ ...state, userTier: 'premium', requestCount: 5 })" },
              ],
            },
          },
          {
            ref: 'check-tier',
            type: 'conditional',
            name: 'Check User Tier',
            description: 'Determine user privileges',
            parameters: {
              condition: '{{ state.userTier === "premium" && state.requestCount > 3 }}',
              reducers: [
                { code: '(state) => ({ ...state, conditionEvaluated: new Date().toISOString(), isPremiumUser: state.userTier === "premium" })' },
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
              reducers: [
                { code: "(state) => ({ ...state, premiumActionExecuted: true, executionPath: 'premium' })" },
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
              reducers: [
                { code: "(state) => ({ ...state, standardActionExecuted: true, executionPath: 'standard' })" },
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
              url: '{{ state.invalidFunction(unclosed }', // Invalid expression
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
              reducers: [
                {
                  code:
                    '(state) => ({ ...state, metrics: { requests: 0, errors: 0, successRate: 0 }, userSessions: [], startTime: new Date().toISOString() })',
                },
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
                sessionCount: '{{ state.userSessions.length }}',
                metrics: '{{ state.metrics }}',
              },
              reducers: [
                {
                  code:
                    "(state) => { const metrics = { ...(state.metrics || { requests: 0, errors: 0, successRate: 0 }) }; metrics.requests = (metrics.requests ?? 0) + 1; const userSessions = Array.isArray(state.userSessions) ? state.userSessions.slice() : []; userSessions.push({ id: Math.random(), timestamp: new Date().toISOString() }); metrics.successRate = metrics.requests > 0 ? ((metrics.requests) - (metrics.errors ?? 0)) / (metrics.requests) : 0; const executionHistory = Array.isArray(state.executionHistory) ? state.executionHistory.slice() : []; executionHistory.push({ node: 'process-data', timestamp: new Date().toISOString(), success: true }); return { ...state, metrics, userSessions, executionHistory }; }",
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
              reducers: [
                { code: '(state) => ({ ...state, endTime: new Date().toISOString(), finalMetrics: { ...(state.metrics || {}) } })' },
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
              reducers: [
                {
                  code:
                    "(state) => { const original = { name: 'updated', count: 5 }; const moved = [1,2,3,4]; const backup = { ...original }; return { ...state, original, backup, moved }; }",
                },
              ],
            },
          },
          {
            ref: 'cleanup',
            type: 'start', // Using start as a simple node type
            name: 'Cleanup',
            description: 'Remove some data',
            parameters: {
              reducers: [
                { code: '(state) => { const original = { ...(state.original || {}) }; delete original.count; return { ...state, original }; }' },
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
