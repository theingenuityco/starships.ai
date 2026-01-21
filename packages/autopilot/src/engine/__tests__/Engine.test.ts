/**
 * Engine Integration Tests
 *
 * Tests for the core workflow execution engine with simple to complex workflows
 */

import { Engine } from '../Engine';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { Blueprint, NodeType } from '@/types';
import type { HostRuntime } from '@/types/node-handler';

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
      // Create a blueprint with an HTTP node that will fail at runtime
      const blueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'http',
            type: 'http_request',
            name: 'HTTP',
            description: 'HTTP Request',
            parameters: {
              url: 'https://nonexistent-domain.invalid/api/test',
              method: 'GET',
            },
          },
        ],
        edges: [{ ref: 'edge-1', from: 'start', to: 'http' }],
        metadata: {},
      };

      // Mock HostRuntime HTTP to reject with network error
      const httpMock = jest.fn().mockRejectedValue(new Error('Network error'));
      const hostRuntime: HostRuntime = {
        http: httpMock as HostRuntime['http'],
        connectorAction: (jest.fn(async ({ connector, action, args, timeoutMs }) => ({
          status: 200,
          statusText: 'OK',
          headers: {},
          body: { ok: true, connector, action, args, timeoutMs },
          url: `connector://${String(connector)}/${String(action)}`,
        })) as HostRuntime['connectorAction']),
      };

      const eventCallback = jest.fn();
      const engine = new Engine({ eventCallback, hostRuntime });
      const execution = ExecutionItemUtils.createExecution();

      await expect(engine.executeBlueprint(blueprint, execution)).rejects.toThrow();

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

  describe('Binary in-flight payloads', () => {
    it('preserves in-flight binary between nodes while keeping execution JSON-safe', async () => {
      const httpMock = jest.fn(async ({ url, method, responseType, body, headers }: any) => {
        if (url === 'https://storage.example.com/download') {
          expect(responseType).toBe('arrayBuffer');
          return {
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/octet-stream' },
            body: new Uint8Array([1, 2, 3]).buffer,
            url,
          };
        }
        if (url === 'https://uploads.example.com/upload') {
          // Upload step should receive the raw bytes as request body (in-flight)
          expect(method).toBe('PUT');
          expect(body).toBeInstanceOf(ArrayBuffer);
          // Node should set content-type from binary payload if not explicitly set.
          expect(headers).toEqual(expect.objectContaining({ 'content-type': 'application/octet-stream' }));
          return {
            status: 201,
            statusText: 'Created',
            headers: {},
            body: '',
            url,
          };
        }
        throw new Error('unexpected url in http mock');
      });

      const hostRuntime: HostRuntime = {
        http: httpMock as any,
        connectorAction: (jest.fn(async () => ({ status: 200, statusText: 'OK', headers: {}, body: {}, url: 'connector://noop' })) as any),
      };

      const blueprint: Blueprint = createMockBlueprint({
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'download',
            type: 'http_request',
            name: 'Download',
            description: 'Download bytes',
            parameters: {
              url: 'https://storage.example.com/download',
              method: 'GET',
              responseType: 'arrayBuffer',
              binaryKey: 'payload',
            },
          },
          {
            ref: 'upload',
            type: 'http_request',
            name: 'Upload',
            description: 'Upload bytes',
            parameters: {
              url: 'https://uploads.example.com/upload',
              method: 'PUT',
              bodyFromBinaryKey: 'payload',
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'e1', from: 'start', to: 'download' },
          { ref: 'e2', from: 'download', to: 'upload' },
          { ref: 'e3', from: 'upload', to: 'end' },
        ],
      });

      const eventCallback = jest.fn();
      const engine = new Engine({ eventCallback, hostRuntime });
      const execution = ExecutionItemUtils.createExecution();

      await engine.executeBlueprint(blueprint, execution);

      // Execution should be JSON-stringifiable (RemoteRunner compatibility).
      expect(() => JSON.stringify(execution)).not.toThrow();

      // Recorded results must not contain binary (sanitized for JSON).
      const recordedDownload = execution.results.find((r) => r.nodeRef === 'download');
      expect(recordedDownload?.items?.[0]?.binary).toBeUndefined();
      const recordedUpload = execution.results.find((r) => r.nodeRef === 'upload');
      expect(recordedUpload?.items?.[0]?.binary).toBeUndefined();

      // And we should have invoked both HTTP calls.
      expect(httpMock).toHaveBeenCalled();

      // Event payloads must also be JSON-safe (no binary).
      for (const call of eventCallback.mock.calls) {
        const ev = call[0] as any;
        expect(() => JSON.stringify(ev)).not.toThrow();
        const exec = ev?.data?.execution;
        if (exec?.results) {
          for (const entry of exec.results) {
            for (const item of entry.items || []) {
              expect(item.binary).toBeUndefined();
            }
          }
        }
      }
    });
  });
});
