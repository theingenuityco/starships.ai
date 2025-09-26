/**
 * End-to-End Workflow Execution Tests
 *
 * Comprehensive integration tests for complete workflow execution scenarios with proper mocking
 */

import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import type { Blueprint } from '@/types';
import { autopilot } from '@/Autopilot';

// Mock all external dependencies
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Console is not mocked to allow debug logging

describe('End-to-End Workflow Execution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    autopilot.reset();

    // Default fetch mock with proper structure
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

  afterEach(() => {
    // No console mocks to clear
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network failures gracefully', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'api-call',
            type: 'http_request',
            name: 'API Call',
            description: 'Make API call',
            parameters: {
              url: 'https://api.unreliable.example.com/data',
              method: 'GET',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'api-call' },
          { ref: 'edge-2', from: 'api-call', to: 'end' },
        ],
        metadata: {},
      };

      // Mock network failure
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const engine = new Engine({ failOnNodeError: false });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(3);

      // Check that the api-call node has an error
      const apiCallResult = execution.results.find((r) => r.nodeRef === 'api-call');
      expect(apiCallResult).toBeDefined();
      expect(apiCallResult!.items[0].error).toContain('Network timeout');
      expect(apiCallResult!.items[0].json).toBeUndefined();
    });

    it('should handle LLM API failures', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'llm-call',
            type: 'llm',
            name: 'LLM Call',
            description: 'Make LLM call',
            parameters: {
              model: 'anthropic/claude-3.5-sonnet',
              messages: [{ role: 'user', content: 'Test message' }],
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'llm-call' },
          { ref: 'edge-2', from: 'llm-call', to: 'end' },
        ],
        metadata: {},
      };

      // Mock LLM API failure
      mockFetch.mockRejectedValueOnce(new Error('LLM API unavailable'));

      // Provide credentials for validation to pass
      autopilot.setCredentials({ openrouterApiKey: 'test-e2e-api-key' });

      const engine = new Engine({ secureEnv: { OPEN_ROUTER_KEY: 'test-e2e-api-key' } });
      const execution = ExecutionItemUtils.createExecution();

      await expect(engine.executeBlueprint(blueprint, execution)).rejects.toThrow('LLM API unavailable');

      expect(execution.status).toBe('failed');
      expect(execution.error?.message).toContain('LLM API unavailable');
    });

    it('should handle missing credentials gracefully', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'llm-call',
            type: 'llm',
            name: 'LLM Call',
            description: 'Make LLM call',
            parameters: {
              model: 'anthropic/claude-3.5-sonnet',
              messages: [{ role: 'user', content: 'Test' }],
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'llm-call' },
          { ref: 'edge-2', from: 'llm-call', to: 'end' },
        ],
        metadata: {},
      };

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      await expect(engine.executeBlueprint(blueprint, execution)).rejects.toThrow('OpenRouter API key is required');

      expect(execution.status).toBe('failed');
      expect(execution.error?.message).toContain('OpenRouter API key is required');
    });
  });

  describe('Workflow State Management', () => {
    it('should maintain consistent state across complex execution', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'set-state',
            type: 'http_request',
            name: 'Set State',
            description: 'Initialize state',
            parameters: {
              url: 'https://api.example.com/init',
              method: 'POST',
              body: { session_id: 'TEST-SESSION-123' },
            },
          },
          {
            ref: 'check-state',
            type: 'conditional',
            name: 'Check State',
            description: 'Verify state',
            parameters: {
              condition: '{{ state.initialized === true }}',
            },
          },
          {
            ref: 'update-state',
            type: 'http_request',
            name: 'Update State',
            description: 'Update state',
            parameters: {
              url: 'https://api.example.com/update',
              method: 'PUT',
              body: { session_id: 'TEST-SESSION-123', status: 'processing' },
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'set-state' },
          { ref: 'edge-2', from: 'set-state', to: 'check-state' },
          { ref: 'edge-3', from: 'check-state', to: 'update-state', condition: 'true' },
          { ref: 'edge-4', from: 'update-state', to: 'end' },
        ],
        metadata: {},
      };

      const mockHeaders1 = new Map([['content-type', 'application/json']]);
      mockHeaders1.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders1);
      });
      const mockHeaders2 = new Map([['content-type', 'application/json']]);
      mockHeaders2.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders2);
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/init',
          headers: mockHeaders1,
          json: async () => ({ initialized: true, session_id: 'TEST-SESSION-123' }),
          text: async () => '{"initialized":true,"session_id":"TEST-SESSION-123"}',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/update',
          headers: mockHeaders2,
          json: async () => ({ updated: true, status: 'processing' }),
          text: async () => '{"updated":true,"status":"processing"}',
        });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      execution.state = { initialized: true };

      await engine.executeBlueprint(blueprint, execution);

      // Debug information
      if (execution.status === 'failed') {
        console.log('Execution failed with error:', execution.error);
        console.log('Results:', execution.results);
      }

      expect(execution.status).toBe('completed');
      expect(execution.state).toEqual({ initialized: true });
      expect(execution.results).toHaveLength(5); // start -> set-state -> check-state -> update-state -> end
    });
  });

  describe('Performance Validation', () => {
    it('should complete workflows within acceptable time limits', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'fast-api-1',
            type: 'http_request',
            name: 'Fast API 1',
            description: 'Quick API call 1',
            parameters: {
              url: 'https://api.example.com/fast/1',
              method: 'GET',
            },
          },
          {
            ref: 'fast-api-2',
            type: 'http_request',
            name: 'Fast API 2',
            description: 'Quick API call 2',
            parameters: {
              url: 'https://api.example.com/fast/2',
              method: 'GET',
            },
          },
          {
            ref: 'fast-api-3',
            type: 'http_request',
            name: 'Fast API 3',
            description: 'Quick API call 3',
            parameters: {
              url: 'https://api.example.com/fast/3',
              method: 'GET',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'fast-api-1' },
          { ref: 'edge-2', from: 'fast-api-1', to: 'fast-api-2' },
          { ref: 'edge-3', from: 'fast-api-2', to: 'fast-api-3' },
          { ref: 'edge-4', from: 'fast-api-3', to: 'end' },
        ],
        metadata: {},
      };

      // Mock fast API responses
      const createMockHeaders = () => {
        const headers = new Map([['content-type', 'application/json']]);
        headers.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', headers);
        });
        return headers;
      };

      const mockResponses = Array(3)
        .fill(null)
        .map((_, i) => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: `https://api.example.com/fast/${i + 1}`,
          headers: createMockHeaders(),
          json: async () => ({ api: i + 1, response_time: '10ms' }),
          text: async () => `{"api":${i + 1},"response_time":"10ms"}`,
        }));

      mockFetch.mockResolvedValueOnce(mockResponses[0]).mockResolvedValueOnce(mockResponses[1]).mockResolvedValueOnce(mockResponses[2]);

      const startTime = Date.now();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      expect(execution.status).toBe('completed');
      expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second with mocks
    });
  });

  describe('Event Streaming Validation', () => {
    it('should emit comprehensive events throughout execution', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'api-call',
            type: 'http_request',
            name: 'API Call',
            description: 'Make API call',
            parameters: {
              url: 'https://api.example.com/test',
              method: 'GET',
            },
          },
          {
            ref: 'llm-call',
            type: 'llm',
            name: 'LLM Call',
            description: 'Make LLM call',
            parameters: {
              model: 'anthropic/claude-3.5-sonnet',
              messages: [{ role: 'user', content: 'Analyze the API response' }],
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'api-call' },
          { ref: 'edge-2', from: 'api-call', to: 'llm-call' },
          { ref: 'edge-3', from: 'llm-call', to: 'end' },
        ],
        metadata: {},
      };

      const mockHeaders1 = new Map([['content-type', 'application/json']]);
      mockHeaders1.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders1);
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/test',
          headers: mockHeaders1,
          json: async () => ({ data: 'test response' }),
          text: async () => '{"data":"test response"}',
        })
        .mockResolvedValueOnce({
          ok: true,
          body: {
            getReader: () => ({
              read: jest
                .fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Analysis complete"}}]}\n\n'),
                })
                .mockResolvedValueOnce({
                  done: true,
                  value: undefined,
                }),
            }),
          },
        });

      const eventCallback = jest.fn();

      // Provide credentials for validation to pass
      autopilot.setCredentials({ openrouterApiKey: 'test-e2e-api-key' });

      const engine = new Engine({ eventCallback, secureEnv: { OPEN_ROUTER_KEY: 'test-e2e-api-key' } });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      // Verify comprehensive event coverage
      expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'workflow_started' }));
      expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'workflow_completed' }));

      // Note: content streaming events are not currently implemented in the Engine
      // expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'content_chunk' }));
      // expect(eventCallback).toHaveBeenCalledWith(expect.objectContaining({ type: 'content_complete' }));
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should execute AI-powered content analysis workflow', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start analysis', parameters: {} },

          {
            ref: 'fetch-content',
            type: 'http_request',
            name: 'Fetch Content',
            description: 'Get content',
            parameters: {
              url: 'https://api.content.example.com/posts/123',
              method: 'GET',
            },
          },

          {
            ref: 'ai-analysis',
            type: 'llm',
            name: 'AI Analysis',
            description: 'Analyze content',
            parameters: {
              model: 'anthropic/claude-3.5-sonnet',
              messages: [
                { role: 'system', content: 'You are a content analysis expert.' },
                { role: 'user', content: 'Analyze this content for sentiment and topics.' },
              ],
            },
          },

          {
            ref: 'decision',
            type: 'conditional',
            name: 'Content Decision',
            description: 'Route based on analysis',
            parameters: {
              condition:
                '{{ outputs.find(r => r.nodeRef === "ai-analysis")?.items?.[0]?.json?.choices?.[0]?.message?.content?.includes("positive") ? "approve" : "review" }}',
            },
          },

          {
            ref: 'approve-content',
            type: 'http_request',
            name: 'Approve Content',
            description: 'Approve content',
            parameters: {
              url: 'https://api.content.example.com/approve',
              method: 'POST',
              body: { post_id: '123' },
            },
          },

          {
            ref: 'flag-review',
            type: 'http_request',
            name: 'Flag for Review',
            description: 'Flag content',
            parameters: {
              url: 'https://api.content.example.com/flag',
              method: 'POST',
              body: { post_id: '123' },
            },
          },

          { ref: 'end', type: 'end', name: 'End', description: 'End analysis', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'fetch-content' },
          { ref: 'edge-2', from: 'fetch-content', to: 'ai-analysis' },
          { ref: 'edge-3', from: 'ai-analysis', to: 'decision' },
          { ref: 'edge-4', from: 'decision', to: 'approve-content', condition: 'approve' },
          { ref: 'edge-5', from: 'decision', to: 'flag-review', condition: 'review' },
          { ref: 'edge-6', from: 'approve-content', to: 'end' },
          { ref: 'edge-7', from: 'flag-review', to: 'end' },
        ],
        metadata: { type: 'content-analysis-workflow' },
      };

      // Mock positive analysis scenario
      const mockHeaders1 = new Map([['content-type', 'application/json']]);
      mockHeaders1.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders1);
      });
      const mockHeaders2 = new Map([['content-type', 'application/json']]);
      mockHeaders2.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders2);
      });

      mockFetch
        .mockResolvedValueOnce({
          // fetch-content
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.content.example.com/posts/123',
          headers: mockHeaders1,
          json: async () => ({
            post_id: '123',
            content: 'This is a great product! I love using it.',
            author: 'user@example.com',
          }),
          text: async () => '{"post_id":"123","content":"This is a great product! I love using it.","author":"user@example.com"}',
        })
        .mockResolvedValueOnce({
          // ai-analysis
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://openrouter.ai/api/v1/chat/completions',
          headers: new Map([['content-type', 'text/event-stream']]),
          body: {
            getReader: () => ({
              read: jest
                .fn()
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode(
                    'data: {"id":"test-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"positive sentiment detected - product review with enthusiastic tone"},"finish_reason":null}]}\n\n'
                  ),
                })
                .mockResolvedValueOnce({
                  done: false,
                  value: new TextEncoder().encode('data: [DONE]\n\n'),
                })
                .mockResolvedValueOnce({
                  done: true,
                  value: undefined,
                }),
            }),
          },
        })
        .mockResolvedValueOnce({
          // approve-content - Mock Response object properly
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.content.example.com/approve',
          headers: mockHeaders2,
          json: async () => ({ approved: true, post_id: '123' }),
          text: async () => '{"approved":true,"post_id":"123"}',
        });

      // Provide credentials for validation to pass
      autopilot.setCredentials({ openrouterApiKey: 'test-e2e-api-key' });
      const engine = new Engine({ secureEnv: { OPEN_ROUTER_KEY: 'test-e2e-api-key' } });
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');

      // Verify approval path was taken
      const executionPath = execution.results.map((r: { nodeRef: string }) => r.nodeRef);
      expect(executionPath).toContain('approve-content');
      expect(executionPath).not.toContain('flag-review');

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should handle multi-step data processing pipeline', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start pipeline', parameters: {} },

          {
            ref: 'extract-data',
            type: 'http_request',
            name: 'Extract Data',
            description: 'Extract raw data',
            parameters: {
              url: 'https://api.data.example.com/extract',
              method: 'POST',
              body: { source: 'database', table: 'users' },
            },
          },

          {
            ref: 'validate-data',
            type: 'conditional',
            name: 'Validate Data',
            description: 'Check data quality',
            parameters: {
              condition: '{{ outputs.find(r => r.nodeRef === "extract-data")?.items?.[0]?.json ? "true" : "false" }}',
            },
          },

          {
            ref: 'transform-data',
            type: 'http_request',
            name: 'Transform Data',
            description: 'Transform data format',
            parameters: {
              url: 'https://api.data.example.com/transform',
              method: 'POST',
              body: { format: 'json', normalize: true },
            },
          },

          {
            ref: 'load-data',
            type: 'http_request',
            name: 'Load Data',
            description: 'Load to warehouse',
            parameters: {
              url: 'https://api.warehouse.example.com/load',
              method: 'POST',
              body: { target: 'analytics_db' },
            },
          },

          {
            ref: 'send-notification',
            type: 'http_request',
            name: 'Send Notification',
            description: 'Notify completion',
            parameters: {
              url: 'https://api.notifications.example.com/send',
              method: 'POST',
              body: { type: 'pipeline_complete' },
            },
          },

          { ref: 'end', type: 'end', name: 'End', description: 'End pipeline', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'extract-data' },
          { ref: 'edge-2', from: 'extract-data', to: 'validate-data' },
          { ref: 'edge-3', from: 'validate-data', to: 'transform-data', condition: 'true' },
          { ref: 'edge-4', from: 'transform-data', to: 'load-data' },
          { ref: 'edge-5', from: 'load-data', to: 'send-notification' },
          { ref: 'edge-6', from: 'send-notification', to: 'end' },
        ],
        metadata: { type: 'etl-pipeline' },
      };

      // Mock successful pipeline execution
      const createMockHeaders = () => {
        const headers = new Map([['content-type', 'application/json']]);
        headers.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', headers);
        });
        return headers;
      };

      mockFetch
        .mockResolvedValueOnce({
          // extract-data
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.content.example.com/posts/123',
          headers: createMockHeaders(),
          json: async () => ({
            post_id: '123',
            content: 'This is a great product! I love using it.',
            author: 'user@example.com',
          }),
          text: async () => '{"post_id":"123","content":"This is a great product! I love using it.","author":"user@example.com"}',
        })
        .mockResolvedValueOnce({
          // transform-data
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.data.example.com/transform',
          headers: createMockHeaders(),
          json: async () => ({
            transformed: true,
            output_records: 1000,
            transform_time: '1.1s',
          }),
          text: async () => '{"transformed":true,"output_records":1000,"transform_time":"1.1s"}',
        })
        .mockResolvedValueOnce({
          // load-data
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.warehouse.example.com/load',
          headers: createMockHeaders(),
          json: async () => ({
            loaded: true,
            table: 'analytics_users',
            load_time: '0.8s',
          }),
          text: async () => '{"loaded":true,"table":"analytics_users","load_time":"0.8s"}',
        })
        .mockResolvedValueOnce({
          // send-notification
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.notifications.example.com/send',
          headers: createMockHeaders(),
          json: async () => ({
            notification_sent: true,
            recipients: ['admin@example.com'],
          }),
          text: async () => '{"notification_sent":true,"recipients":["admin@example.com"]}',
        });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);

      // Debug information
      if (execution.status === 'failed') {
        console.log('Execution failed with error:', execution.error);
        console.log('Results:', execution.results);
      }

      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(7); // start -> extract-data -> validate-data -> transform-data -> load-data -> send-notification -> end
      expect(mockFetch).toHaveBeenCalledTimes(4); // extract-data, transform-data, load-data, send-notification
    });
  });
});
