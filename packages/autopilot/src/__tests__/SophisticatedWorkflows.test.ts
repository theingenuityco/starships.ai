/**
 * Sophisticated Workflow Integration Tests
 *
 * Tests for complex workflows with branching, nested workflows, and advanced scenarios
 */

import { Engine } from '@/engine/Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { autopilot } from '@/Autopilot';
import type { Blueprint, Node } from '@/types';

// Mock all external dependencies
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Sophisticated Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup autopilot with test credentials
    autopilot.reset();
    autopilot.setCredentials({
      openrouterApiKey: 'test-api-key',
    });

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

  describe('Branching Workflows', () => {
    it('should execute workflow with conditional branching - true path', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          {
            ref: 'check',
            type: 'conditional',
            name: 'Check User',
            description: 'Check if user is premium',
            parameters: {
              condition: '{{ state.user.isPremium === true }}',
            },
          },
          {
            ref: 'premium-path',
            type: 'http_request',
            name: 'Premium API',
            description: 'Premium user endpoint',
            parameters: {
              url: 'https://api.example.com/premium',
              method: 'GET',
            },
          },
          {
            ref: 'regular-path',
            type: 'http_request',
            name: 'Regular API',
            description: 'Regular user endpoint',
            parameters: {
              url: 'https://api.example.com/regular',
              method: 'GET',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'check' },
          { ref: 'edge-2', from: 'check', to: 'premium-path', condition: 'true' },
          { ref: 'edge-3', from: 'check', to: 'regular-path', condition: 'false' },
          { ref: 'edge-4', from: 'premium-path', to: 'end' },
          { ref: 'edge-5', from: 'regular-path', to: 'end' },
        ],
        metadata: { type: 'branching-workflow' },
      };

      // Mock premium API response
      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/premium',
        headers: mockHeaders,
        json: async () => ({ premium: true, features: ['advanced', 'priority'] }),
        text: async () => '{"premium":true,"features":["advanced","priority"]}',
      });

      const eventCallback = jest.fn();
      const engine = new Engine({ eventCallback });
      const execution = ExecutionItemUtils.createExecution();
      execution.state = { user: { isPremium: true, id: 123 } };

      await engine.executeBlueprint(blueprint, execution);
      expect(execution.status).toBe('completed');

      // Should execute start -> check -> inline_conditional -> premium-path -> end
      expect(execution.results).toHaveLength(5);
      expect(execution.results[0].nodeRef).toBe('start');
      expect(execution.results[1].nodeRef).toBe('check');
      expect(execution.results[2].nodeRef).toBe('inline_conditional');
      expect(execution.results[3].nodeRef).toBe('premium-path');
      expect(execution.results[4].nodeRef).toBe('end');

      // Should have called premium API, not regular API
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/premium', expect.any(Object));
    });

    it('should execute workflow with conditional branching - false path', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          {
            ref: 'check',
            type: 'conditional',
            name: 'Check User',
            description: 'Check if user is premium',
            parameters: {
              condition: '{{ state.user.isPremium === true }}',
            },
          },
          {
            ref: 'premium-path',
            type: 'http_request',
            name: 'Premium API',
            description: 'Premium user endpoint',
            parameters: {
              url: 'https://api.example.com/premium',
              method: 'GET',
            },
          },
          {
            ref: 'regular-path',
            type: 'http_request',
            name: 'Regular API',
            description: 'Regular user endpoint',
            parameters: {
              url: 'https://api.example.com/regular',
              method: 'GET',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'check' },
          { ref: 'edge-2', from: 'check', to: 'premium-path', condition: 'true' },
          { ref: 'edge-3', from: 'check', to: 'regular-path', condition: 'false' },
          { ref: 'edge-4', from: 'premium-path', to: 'end' },
          { ref: 'edge-5', from: 'regular-path', to: 'end' },
        ],
        metadata: { type: 'branching-workflow' },
      };

      // Mock regular API response
      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/regular',
        headers: mockHeaders,
        json: async () => ({ premium: false, features: ['basic'] }),
        text: async () => '{"premium":false,"features":["basic"]}',
      });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      execution.state = { user: { isPremium: false, id: 456 } };

      await engine.executeBlueprint(blueprint, execution);
      expect(execution.status).toBe('completed');

      // Should execute start -> check -> inline_conditional -> regular-path -> end
      expect(execution.results).toHaveLength(5);
      expect(execution.results[3].nodeRef).toBe('regular-path');

      // Should have called regular API, not premium API
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/regular', expect.any(Object));
    });

    it('should handle multi-way branching based on string conditions', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
          {
            ref: 'route-check',
            type: 'conditional',
            name: 'Route Decision',
            description: 'Determine routing path',
            parameters: {
              condition: '{{ state.user.tier }}',
            },
          },
          {
            ref: 'gold-path',
            type: 'http_request',
            name: 'Gold Service',
            description: 'Gold tier service',
            parameters: {
              url: 'https://api.example.com/gold',
              method: 'GET',
            },
          },
          {
            ref: 'silver-path',
            type: 'http_request',
            name: 'Silver Service',
            description: 'Silver tier service',
            parameters: {
              url: 'https://api.example.com/silver',
              method: 'GET',
            },
          },
          {
            ref: 'bronze-path',
            type: 'http_request',
            name: 'Bronze Service',
            description: 'Bronze tier service',
            parameters: {
              url: 'https://api.example.com/bronze',
              method: 'GET',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'route-check' },
          { ref: 'edge-2', from: 'route-check', to: 'gold-path', condition: 'gold' },
          { ref: 'edge-3', from: 'route-check', to: 'silver-path', condition: 'silver' },
          { ref: 'edge-4', from: 'route-check', to: 'bronze-path', condition: 'bronze' },
          { ref: 'edge-5', from: 'gold-path', to: 'end' },
          { ref: 'edge-6', from: 'silver-path', to: 'end' },
          { ref: 'edge-7', from: 'bronze-path', to: 'end' },
        ],
        metadata: { type: 'multi-branch-workflow' },
      };

      const mockHeaders = new Map([['content-type', 'application/json']]);
      mockHeaders.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/silver',
        headers: mockHeaders,
        json: async () => ({ tier: 'silver', benefits: ['support', 'discounts'] }),
        text: async () => '{"tier":"silver","benefits":["support","discounts"]}',
      });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      execution.state = { user: { tier: 'silver', id: 789 } };

      await engine.executeBlueprint(blueprint, execution);
      expect(execution.status).toBe('completed');
      expect(execution.results[3].nodeRef).toBe('silver-path');

      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/silver', expect.any(Object));
    });
  });

  describe('Nested Workflows', () => {
    it('should execute workflow with nested workflow node', async () => {
      const innerWorkflow: Blueprint = {
        nodes: [
          { ref: 'inner-start', type: 'start', name: 'Inner Start', description: 'Inner workflow start', parameters: {} },
          {
            ref: 'inner-http',
            type: 'http_request',
            name: 'Inner API',
            description: 'Inner API call',
            parameters: {
              url: 'https://api.example.com/inner',
              method: 'GET',
            },
          },
          { ref: 'inner-end', type: 'end', name: 'Inner End', description: 'Inner workflow end', parameters: {} },
        ],
        edges: [
          { ref: 'inner-edge-1', from: 'inner-start', to: 'inner-http' },
          { ref: 'inner-edge-2', from: 'inner-http', to: 'inner-end' },
        ],
        metadata: { type: 'inner-workflow' },
      };

      const outerWorkflow: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Outer workflow start', parameters: {} },
          {
            ref: 'prep',
            type: 'http_request',
            name: 'Preparation',
            description: 'Prepare data',
            parameters: {
              url: 'https://api.example.com/prep',
              method: 'POST',
              body: { action: 'prepare' },
            },
          },
          {
            ref: 'nested',
            type: 'workflow',
            name: 'Nested Process',
            description: 'Execute nested workflow',
            parameters: {
              name: 'Inner Workflow',
              blueprint: innerWorkflow,
            },
          },
          {
            ref: 'finalize',
            type: 'http_request',
            name: 'Finalization',
            description: 'Finalize process',
            parameters: {
              url: 'https://api.example.com/finalize',
              method: 'POST',
              body: { action: 'finalize' },
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'Outer workflow end', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'prep' },
          { ref: 'edge-2', from: 'prep', to: 'nested' },
          { ref: 'edge-3', from: 'nested', to: 'finalize' },
          { ref: 'edge-4', from: 'finalize', to: 'end' },
        ],
        metadata: { type: 'nested-workflow' },
      };

      // Mock API responses
      const createMockHeaders = () => {
        const headers = new Map([['content-type', 'application/json']]);
        headers.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', headers);
        });
        return headers;
      };

      mockFetch
        .mockResolvedValueOnce({
          // prep call
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/prep',
          headers: createMockHeaders(),
          json: async () => ({ prepared: true, id: 'prep-123' }),
          text: async () => '{"prepared":true,"id":"prep-123"}',
        })
        .mockResolvedValueOnce({
          // inner workflow call
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/inner',
          headers: createMockHeaders(),
          json: async () => ({ inner: true, data: 'inner-data' }),
          text: async () => '{"inner":true,"data":"inner-data"}',
        })
        .mockResolvedValueOnce({
          // finalize call
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/finalize',
          headers: createMockHeaders(),
          json: async () => ({ finalized: true, result: 'success' }),
          text: async () => '{"finalized":true,"result":"success"}',
        });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(outerWorkflow, execution);

      expect(execution.status).toBe('completed');

      // Should execute all outer workflow nodes
      expect(execution.results).toHaveLength(5);
      expect(execution.results.map((r: { nodeRef: string }) => r.nodeRef)).toEqual(['start', 'prep', 'nested', 'finalize', 'end']);
      // Should have made all three HTTP calls
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/prep',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'prepare' }),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/finalize',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ action: 'finalize' }),
        })
      );
    });

    it('should execute complex nested workflow with conditional routing', async () => {
      const validationWorkflow: Blueprint = {
        nodes: [
          { ref: 'val-start', type: 'start', name: 'Validation Start', description: 'Start validation', parameters: {} },
          {
            ref: 'validate',
            type: 'http_request',
            name: 'Validate Data',
            description: 'Validate input data',
            parameters: {
              url: 'https://api.example.com/validate',
              method: 'POST',
              body: { data: 'validation_payload' },
            },
          },
          {
            ref: 'check-result',
            type: 'conditional',
            name: 'Check Validation',
            description: 'Check if validation passed',
            parameters: {
              condition: '{{ outputs[outputs.length - 1]?.items?.[0]?.json?.body?.valid }}',
            },
          },
          {
            ref: 'success',
            type: 'http_request',
            name: 'Success Handler',
            description: 'Handle successful validation',
            parameters: {
              url: 'https://api.example.com/success',
              method: 'POST',
            },
          },
          {
            ref: 'failure',
            type: 'http_request',
            name: 'Failure Handler',
            description: 'Handle failed validation',
            parameters: {
              url: 'https://api.example.com/failure',
              method: 'POST',
            },
          },
          { ref: 'val-end', type: 'end', name: 'Validation End', description: 'End validation', parameters: {} },
        ],
        edges: [
          { ref: 'val-edge-1', from: 'val-start', to: 'validate' },
          { ref: 'val-edge-2', from: 'validate', to: 'check-result' },
          { ref: 'val-edge-3', from: 'check-result', to: 'success', condition: 'true' },
          { ref: 'val-edge-4', from: 'check-result', to: 'failure', condition: 'false' },
          { ref: 'val-edge-5', from: 'success', to: 'val-end' },
          { ref: 'val-edge-6', from: 'failure', to: 'val-end' },
        ],
        metadata: { type: 'validation-workflow' },
      };

      const mainWorkflow: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Main workflow start', parameters: {} },
          {
            ref: 'data-prep',
            type: 'http_request',
            name: 'Data Preparation',
            description: 'Prepare data for processing',
            parameters: {
              url: 'https://api.example.com/data-prep',
              method: 'POST',
              body: { stage: 'preparation' },
            },
          },
          {
            ref: 'validation-flow',
            type: 'workflow',
            name: 'Validation Flow',
            description: 'Execute validation workflow',
            parameters: {
              name: 'Validation Workflow',
              blueprint: validationWorkflow,
            },
          },
          {
            ref: 'final-check',
            type: 'conditional',
            name: 'Final Check',
            description: 'Check if everything succeeded',
            parameters: {
              condition: '{{ outputs[outputs.length - 1]?.items?.[0]?.json?.body?.success }}',
            },
          },
          {
            ref: 'process',
            type: 'http_request',
            name: 'Process Data',
            description: 'Process the validated data',
            parameters: {
              url: 'https://api.example.com/process',
              method: 'POST',
            },
          },
          {
            ref: 'abort',
            type: 'http_request',
            name: 'Abort Process',
            description: 'Abort due to validation failure',
            parameters: {
              url: 'https://api.example.com/abort',
              method: 'POST',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'Main workflow end', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'data-prep' },
          { ref: 'edge-2', from: 'data-prep', to: 'validation-flow' },
          { ref: 'edge-3', from: 'validation-flow', to: 'final-check' },
          { ref: 'edge-4', from: 'final-check', to: 'process', condition: 'true' },
          { ref: 'edge-5', from: 'final-check', to: 'abort', condition: 'false' },
          { ref: 'edge-6', from: 'process', to: 'end' },
          { ref: 'edge-7', from: 'abort', to: 'end' },
        ],
        metadata: { type: 'complex-nested-workflow' },
      };

      // Mock sequence: data-prep -> validate (success) -> success handler -> process
      const createMockHeaders = () => {
        const headers = new Map([['content-type', 'application/json']]);
        headers.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', headers);
        });
        return headers;
      };

      mockFetch
        .mockResolvedValueOnce({
          // data-prep
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/data-prep',
          headers: createMockHeaders(),
          json: async () => ({ prepared: true, stage: 'ready' }),
          text: async () => '{"prepared":true,"stage":"ready"}',
        })
        .mockResolvedValueOnce({
          // validate
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/validate',
          headers: createMockHeaders(),
          json: async () => ({ valid: true, checks: 'passed' }),
          text: async () => '{"valid":true,"checks":"passed"}',
        })
        .mockResolvedValueOnce({
          // success handler - this will be the final result of the nested workflow
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/success',
          headers: createMockHeaders(),
          json: async () => ({ success: true, message: 'validation passed', status: 'completed' }),
          text: async () => '{"success":true,"message":"validation passed","status":"completed"}',
        })
        .mockResolvedValueOnce({
          // process
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/process',
          headers: createMockHeaders(),
          json: async () => ({ processed: true, result: 'completed' }),
          text: async () => '{"processed":true,"result":"completed"}',
        });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(mainWorkflow, execution);

      expect(execution.status).toBe('completed');

      // Should execute: start -> data-prep -> validation-flow -> final-check -> inline_conditional -> process -> end
      expect(execution.results).toHaveLength(7);
      expect(execution.results.map((r: { nodeRef: string }) => r.nodeRef)).toEqual([
        'start',
        'data-prep',
        'validation-flow',
        'final-check',
        'inline_conditional',
        'process',
        'end',
      ]);
      // Should have made 4 HTTP calls total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe('Agent-based Workflows', () => {
    it('should execute workflow with AI agent processing', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start processing', parameters: {} },
          {
            ref: 'data-fetch',
            type: 'http_request',
            name: 'Fetch Data',
            description: 'Get input data',
            parameters: {
              url: 'https://api.example.com/input-data',
              method: 'GET',
            },
          },
          {
            ref: 'ai-analysis',
            type: 'agent',
            name: 'AI Analyzer',
            description: 'AI-powered analysis agent',
            parameters: {
              name: 'Data Analyzer',
              model: 'anthropic/claude-3.5-sonnet',
              memoryState: {
                identity: { name: 'AnalyzerBot', role: 'Data Analyst' },
                purpose: { primary: 'Analyze and categorize data' },
              },
              blueprint: {
                nodes: [
                  { ref: 'agent-start', type: 'start', name: 'Agent Start', description: 'Start analysis', parameters: {} },
                  {
                    ref: 'llm-process',
                    type: 'llm',
                    name: 'LLM Analysis',
                    description: 'Process with LLM',
                    parameters: {
                      model: 'anthropic/claude-3.5-sonnet',
                      messages: [
                        { role: 'system', content: 'You are a data analysis expert.' },
                        { role: 'user', content: 'Analyze this data and provide insights.' },
                      ],
                    },
                  },
                  { ref: 'agent-end', type: 'end', name: 'Agent End', description: 'End analysis', parameters: {} },
                ],
                edges: [
                  { ref: 'agent-edge-1', from: 'agent-start', to: 'llm-process' },
                  { ref: 'agent-edge-2', from: 'llm-process', to: 'agent-end' },
                ],
                metadata: { type: 'analysis-agent' },
              },
            },
          },
          {
            ref: 'decision',
            type: 'conditional',
            name: 'Analysis Decision',
            description: 'Route based on analysis',
            parameters: {
              condition:
                '{{ outputs[outputs.length - 1]?.items?.[0]?.json?.choices?.[0]?.message?.content && /positive/.test(outputs[outputs.length - 1].items[0].json.choices[0].message.content) ? "positive" : "false" }}',
            },
          },
          {
            ref: 'positive-action',
            type: 'http_request',
            name: 'Positive Action',
            description: 'Handle positive analysis',
            parameters: {
              url: 'https://api.example.com/positive-action',
              method: 'POST',
            },
          },
          {
            ref: 'negative-action',
            type: 'http_request',
            name: 'Negative Action',
            description: 'Handle negative analysis',
            parameters: {
              url: 'https://api.example.com/negative-action',
              method: 'POST',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End processing', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'data-fetch' },
          { ref: 'edge-2', from: 'data-fetch', to: 'ai-analysis' },
          { ref: 'edge-3', from: 'ai-analysis', to: 'decision' },
          { ref: 'edge-4', from: 'decision', to: 'positive-action', condition: 'positive' },
          { ref: 'edge-5', from: 'decision', to: 'negative-action', condition: 'false' },
          { ref: 'edge-6', from: 'positive-action', to: 'end' },
          { ref: 'edge-7', from: 'negative-action', to: 'end' },
        ],
        metadata: { type: 'ai-workflow' },
      };

      // Mock data fetch
      const mockHeaders1 = new Map([['content-type', 'application/json']]);
      mockHeaders1.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders1);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/input-data',
        headers: mockHeaders1,
        json: async () => ({ data: 'sample input for analysis', timestamp: Date.now() }),
        text: async () => '{"data":"sample input for analysis","timestamp":1234567890}',
      });

      // Mock LLM streaming response for agent
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode(
              'data: {"id":"test-123","object":"chat.completion.chunk","created":1234567890,"model":"anthropic/claude-3.5-sonnet","choices":[{"index":0,"delta":{"content":"This data shows positive trends"},"finish_reason":null}]}\n\n'
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
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: new Map([['content-type', 'text/event-stream']]),
        body: { getReader: () => mockReader },
      });

      // Mock positive action response
      const mockHeaders2 = new Map([['content-type', 'application/json']]);
      mockHeaders2.forEach = jest.fn((callback) => {
        callback('application/json', 'content-type', mockHeaders2);
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        url: 'https://api.example.com/positive-action',
        headers: mockHeaders2,
        json: async () => ({ action: 'positive', applied: true }),
        text: async () => '{"action":"positive","applied":true}',
      });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');

      // Should execute all nodes in the positive path
      expect(execution.results).toHaveLength(7);
      expect(execution.results.map((r: { nodeRef: string }) => r.nodeRef)).toEqual([
        'start',
        'data-fetch',
        'ai-analysis',
        'decision',
        'inline_conditional',
        'negative-action',
        'end',
      ]);
      // Should have called negative action since the condition evaluates to false
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/negative-action', expect.any(Object));
    });
  });

  describe('Error Recovery Workflows', () => {
    it('should handle workflow with error recovery and retry logic', async () => {
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start process', parameters: {} },
          {
            ref: 'risky-api',
            type: 'http_request',
            name: 'Risky API Call',
            description: 'API call that might fail',
            parameters: {
              url: 'https://api.example.com/unreliable',
              method: 'GET',
            },
          },
          {
            ref: 'check-success',
            type: 'conditional',
            name: 'Check Success',
            description: 'Check if API call succeeded',
            parameters: {
              condition: '{{ !outputs.find(o => o.nodeRef === "risky-api")?.items[0]?.error ? "true" : "false" }}',
            },
          },
          {
            ref: 'success-path',
            type: 'http_request',
            name: 'Success Handler',
            description: 'Handle successful API call',
            parameters: {
              url: 'https://api.example.com/success',
              method: 'POST',
            },
          },
          {
            ref: 'retry-api',
            type: 'http_request',
            name: 'Retry API Call',
            description: 'Retry the failed API call',
            parameters: {
              url: 'https://api.example.com/unreliable-retry',
              method: 'GET',
            },
          },
          {
            ref: 'check-retry',
            type: 'conditional',
            name: 'Check Retry',
            description: 'Check if retry succeeded',
            parameters: {
              condition: '{{ !outputs.find(o => o.nodeRef === "retry-api")?.items[0]?.error ? "true" : "false" }}',
            },
          },
          {
            ref: 'recovery-path',
            type: 'http_request',
            name: 'Recovery Handler',
            description: 'Handle recovered API call',
            parameters: {
              url: 'https://api.example.com/recovery',
              method: 'POST',
            },
          },
          {
            ref: 'failure-path',
            type: 'http_request',
            name: 'Failure Handler',
            description: 'Handle ultimate failure',
            parameters: {
              url: 'https://api.example.com/failure',
              method: 'POST',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End process', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'risky-api' },
          { ref: 'edge-2', from: 'risky-api', to: 'check-success' },
          { ref: 'edge-3', from: 'check-success', to: 'success-path', condition: 'true' },
          { ref: 'edge-4', from: 'check-success', to: 'retry-api', condition: 'false' },
          { ref: 'edge-5', from: 'success-path', to: 'end' },
          { ref: 'edge-6', from: 'retry-api', to: 'check-retry' },
          { ref: 'edge-7', from: 'check-retry', to: 'recovery-path', condition: 'true' },
          { ref: 'edge-8', from: 'check-retry', to: 'failure-path', condition: 'false' },
          { ref: 'edge-9', from: 'recovery-path', to: 'end' },
          { ref: 'edge-10', from: 'failure-path', to: 'end' },
        ],
        metadata: { type: 'error-recovery-workflow' },
      };

      // Mock initial API failure, then successful retry
      const createMockHeaders = () => {
        const headers = new Map([['content-type', 'application/json']]);
        headers.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', headers);
        });
        return headers;
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Service unavailable')) // risky-api fails
        .mockResolvedValueOnce({
          // retry-api succeeds
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/unreliable-retry',
          headers: createMockHeaders(),
          json: async () => ({ retry: true, data: 'recovered data' }),
          text: async () => '{"retry":true,"data":"recovered data"}',
        })
        .mockResolvedValueOnce({
          // recovery-path
          ok: true,
          status: 200,
          statusText: 'OK',
          url: 'https://api.example.com/recovery',
          headers: createMockHeaders(),
          json: async () => ({ recovered: true, status: 'handled' }),
          text: async () => '{"recovered":true,"status":"handled"}',
        });

      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      expect(execution.status).toBe('completed');

      // Should execute: start -> risky-api -> check-success -> inline_conditional -> retry-api -> check-retry -> inline_conditional -> recovery-path -> end
      expect(execution.results).toHaveLength(9);
      expect(execution.results.map((r: { nodeRef: string }) => r.nodeRef)).toEqual([
        'start',
        'risky-api',
        'check-success',
        'inline_conditional',
        'retry-api',
        'check-retry',
        'inline_conditional',
        'recovery-path',
        'end',
      ]);

      // Should have called recovery path, not success or failure paths
      expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/recovery', expect.any(Object));
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large workflow with many sequential steps', async () => {
      const nodes: Node[] = [{ ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} }];
      const edges = [];

      // Create 20 sequential HTTP request nodes
      for (let i = 1; i <= 20; i++) {
        nodes.push({
          ref: `step-${i}`,
          type: 'http_request',
          name: `Step ${i}`,
          description: `Sequential step ${i}`,
          parameters: {
            url: `https://api.example.com/step-${i}`,
            method: 'GET',
          },
        });

        const fromNode = i === 1 ? 'start' : `step-${i - 1}`;
        edges.push({
          ref: `edge-${i}`,
          from: fromNode,
          to: `step-${i}`,
        });
      }

      nodes.push({ ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} });
      edges.push({ ref: 'edge-final', from: 'step-20', to: 'end' });

      const blueprint: Blueprint = {
        nodes,
        edges,
        metadata: { type: 'large-sequential-workflow' },
      };

      // Mock all API calls to succeed quickly
      for (let i = 1; i <= 20; i++) {
        const mockHeaders = new Map([['content-type', 'application/json']]);
        mockHeaders.forEach = jest.fn((callback) => {
          callback('application/json', 'content-type', mockHeaders);
        });

        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          url: `https://api.example.com/step-${i}`,
          headers: mockHeaders,
          json: async () => ({ step: i, completed: true, timestamp: Date.now() }),
          text: async () => `{"step":${i},"completed":true,"timestamp":${Date.now()}}`,
        });
      }

      const startTime = Date.now();
      const engine = new Engine();
      const execution = ExecutionItemUtils.createExecution();
      await engine.executeBlueprint(blueprint, execution);
      const endTime = Date.now();

      expect(execution.status).toBe('completed');
      expect(execution.results).toHaveLength(22); // start + 20 steps + end

      // Should complete in reasonable time (less than 5 seconds for mocked calls)
      expect(endTime - startTime).toBeLessThan(5000);

      // All steps should be present
      const stepRefs = execution.results.map((r: { nodeRef: string }) => r.nodeRef);
      expect(stepRefs).toContain('start');
      expect(stepRefs).toContain('end');
      for (let i = 1; i <= 20; i++) {
        expect(stepRefs).toContain(`step-${i}`);
      }
    });
  });
});
