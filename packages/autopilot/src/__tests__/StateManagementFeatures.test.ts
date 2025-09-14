/**
 * State Management Features Test
 *
 * Demonstrates the template-based parameter resolution and transform operations
 * for dynamic state management in autopilot workflows.
 */

import { Engine } from '../engine/Engine';
import { Blueprint } from '../types';

describe('State Management Features', () => {
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
              transform: ['state.userId := "user-123"', 'state.sessionStart := $now()', 'state.counter := 0'],
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
              transform: [
                'state.counter := state.counter + 1',
                'state.lastApiCall := $now()',
                'state.apiCallHistory := $append(state.apiCallHistory ? state.apiCallHistory : [], {"url": "{{ state.userId }}", "timestamp": $now()})',
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Complete workflow',
            parameters: {
              transform: ['state.completedAt := $now()', 'state.totalCalls := state.counter'],
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

      // Mock initial execution state
      const initialExecution = {
        status: 'not_started' as const,
        state: {
          apiToken: 'abc123token',
        },
        results: [],
      };

      const engine = new Engine({
        blueprint,
        execution: initialExecution,
        eventCallback: async (event) => {
          console.log(`Event: ${event.type} at ${event.timestamp}`);
        },
      });

      // Execute workflow
      await engine.execute();

      const execution = engine.getExecution();

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
              transform: ['state.userTier := "premium"', 'state.requestCount := 5'],
            },
          },
          {
            ref: 'check-tier',
            type: 'conditional',
            name: 'Check User Tier',
            description: 'Determine user privileges',
            parameters: {
              expression: 'state.userTier = "premium" and state.requestCount > 3',
              transform: ['state.conditionEvaluated := $now()', 'state.isPremiumUser := state.userTier = "premium"'],
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
              transform: ['state.premiumActionExecuted := true', 'state.executionPath := "premium"'],
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
              transform: ['state.standardActionExecuted := true', 'state.executionPath := "standard"'],
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
        blueprint,
        eventCallback: async (event) => {
          console.log(`Conditional Event: ${event.type}`);
        },
      });

      await engine.execute();
      const execution = engine.getExecution();

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
    test('should validate template expressions before execution', async () => {
      const invalidBlueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Start with invalid template',
            parameters: {
              transform: ['state.value := {{ invalid.template }}'], // Invalid: template in transform
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

      const engine = new Engine({ blueprint: invalidBlueprint });

      // Should throw validation error before execution
      await expect(engine.execute()).rejects.toThrow(/validation failed/i);
    });

    test('should validate transform expressions', async () => {
      const invalidTransformBlueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Start with invalid transform',
            parameters: {
              transform: [
                'invalidAssignment = "should use :="', // Invalid: should use := operator
                'global.variable := "forbidden"', // Invalid: can only modify state.*
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

      const engine = new Engine({ blueprint: invalidTransformBlueprint });

      // Should throw validation error for invalid transforms
      await expect(engine.execute()).rejects.toThrow(/validation failed/i);
    });
  });

  describe('Complex State Mutations', () => {
    test('should handle complex state operations', async () => {
      const blueprint: Blueprint = {
        nodes: [
          {
            ref: 'start',
            type: 'start',
            name: 'Start',
            description: 'Initialize complex state',
            parameters: {
              transform: [
                'state.metrics := {"requests": 0, "errors": 0, "successRate": 0}',
                'state.userSessions := []',
                'state.startTime := $now()',
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
              transform: [
                // Increment metrics
                'state.metrics.requests := state.metrics.requests + 1',

                // Add session data
                'state.userSessions := $append(state.userSessions, {"id": $random(), "timestamp": $now()})',

                // Calculate success rate (assuming this succeeds)
                'state.metrics.successRate := state.metrics.requests > 0 ? (state.metrics.requests - state.metrics.errors) / state.metrics.requests : 0',

                // Update execution history
                'state.executionHistory := $append(state.executionHistory ? state.executionHistory : [], {"node": "process-data", "timestamp": $now(), "success": true})',
              ],
            },
          },
          {
            ref: 'end',
            type: 'end',
            name: 'End',
            description: 'Finalize',
            parameters: {
              transform: [
                'state.endTime := $now()',
                'state.duration := $now()', // In real implementation, would calculate difference
                'state.finalMetrics := state.metrics',
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

      const engine = new Engine({ blueprint });
      await engine.execute();
      const execution = engine.getExecution();

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
});
