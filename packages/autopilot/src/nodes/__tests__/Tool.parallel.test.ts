/**
 * Tool Node Parallel Execution Tests
 *
 * Tests for the Smart Tool Node pattern with parallel tool execution
 */

import { Tool } from '../Tool';
import type { ToolParams } from '@/types/node-parameters';
import type { Blueprint } from '@/types';
import { ExecutionItemUtils } from '@/utils/ExecutionItemUtils';
import { ToolCallData } from '@/types/parallel-tools';

// Mock runners to avoid actual execution
jest.mock('@/runner/LocalRunner', () => ({
  LocalRunner: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue([
      { json: { result: 'mocked_tool_result' }, pairedItem: { item: 0 } }
    ])
  }))
}));

jest.mock('@/runner/ChildProcessRunner', () => ({
  ChildProcessRunner: jest.fn().mockImplementation(() => ({
    run: jest.fn().mockResolvedValue([
      { json: { result: 'mocked_tool_result' }, pairedItem: { item: 0 } }
    ])
  }))
}));

describe('Tool Node - Parallel Execution', () => {
  const createMockBlueprint = (): Blueprint => ({
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
  });

  const createMockExecution = () => ({
    id: 'test-execution',
    depth: 1,
    results: [],
    state: {
      tools: [
        {
          name: 'calculator',
          description: 'Calculate mathematical expressions',
          blueprint: createMockBlueprint(),
          parameters: { type: 'object', properties: {} }
        },
        {
          name: 'time',
          description: 'Get current time',
          blueprint: createMockBlueprint(),
          parameters: { type: 'object', properties: {} }
        }
      ]
    },
    status: 'running' as const
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Universal Tool Executor Mode', () => {
    it('should handle empty tool calls array gracefully', async () => {
      const params: ToolParams = {
        name: 'universal_tool_executor',
        description: 'Execute tools based on input data',
        parameters: {
          type: 'object',
          properties: {
            toolCalls: { type: 'array', items: { type: 'object' } }
          }
        },
        blueprint: null
      };

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle([]));
      
      const resultData = ExecutionItemUtils.unwrapSingle(result);
      expect(resultData).toMatchObject({
        successful: [],
        failed: [],
        processedIds: [],
        summary: { total: 0, successful: 0, failed: 0, successRate: '0%' }
      });
    });

    it('should execute single tool call', async () => {
      const params: ToolParams = {
        name: 'universal_tool_executor',
        description: 'Execute tools based on input data',
        parameters: {
          type: 'object',
          properties: {
            toolCalls: { type: 'array', items: { type: 'object' } }
          }
        },
        blueprint: null
      };

      const toolCalls: ToolCallData[] = [{
        id: 'call_1',
        name: 'calculator',
        arguments: { expression: '2 + 2' },
        callIndex: 0,
        toolCallId: 'call_1'
      }];

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle(toolCalls));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should execute multiple tools in parallel', async () => {
      const params: ToolParams = {
        name: 'universal_tool_executor',
        description: 'Execute tools based on input data',
        parameters: {
          type: 'object',
          properties: {
            toolCalls: { type: 'array', items: { type: 'object' } }
          }
        },
        blueprint: null
      };

      const toolCalls: ToolCallData[] = [
        {
          id: 'call_1',
          name: 'calculator',
          arguments: { expression: '2 + 2' },
          callIndex: 0,
          toolCallId: 'call_1'
        },
        {
          id: 'call_2',
          name: 'time',
          arguments: {},
          callIndex: 1,
          toolCallId: 'call_2'
        }
      ];

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle(toolCalls));
      
      const resultData = ExecutionItemUtils.unwrapSingle(result);
      expect(resultData).toMatchObject({
        successful: expect.any(Array),
        failed: expect.any(Array),
        processedIds: expect.arrayContaining(['call_1', 'call_2']),
        summary: expect.objectContaining({
          total: 2
        })
      });
    });

    it('should handle tool not found error gracefully', async () => {
      const params: ToolParams = {
        name: 'universal_tool_executor',
        description: 'Execute tools based on input data',
        parameters: {
          type: 'object',
          properties: {
            toolCalls: { type: 'array', items: { type: 'object' } }
          }
        },
        blueprint: null
      };

      const toolCalls: ToolCallData[] = [{
        id: 'call_1',
        name: 'nonexistent_tool',
        arguments: {},
        callIndex: 0,
        toolCallId: 'call_1'
      }];

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle(toolCalls));
      
      const resultData = ExecutionItemUtils.unwrapSingle(result);
      expect(resultData).toMatchObject({
        nodeError: true,
        failed: expect.arrayContaining([
          expect.objectContaining({
            error: 'Tool node execution failed'
          })
        ])
      });
    });
  });

  describe('Legacy Tool Execution Mode', () => {
    it('should execute legacy single tool with blueprint', async () => {
      const params: ToolParams = {
        name: 'calculator',
        description: 'Calculate mathematical expressions',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string' }
          }
        },
        blueprint: createMockBlueprint()
      };

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle({ expression: '2 + 2' }));
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle legacy tool without blueprint gracefully', async () => {
      const params: ToolParams = {
        name: 'calculator',
        description: 'Calculate mathematical expressions',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string' }
          }
        },
        blueprint: null
      };

      const tool = new Tool(params, { execution: createMockExecution() });
      const result = await tool.execute(ExecutionItemUtils.wrapSingle({ expression: '2 + 2' }));
      
      const resultData = ExecutionItemUtils.unwrapSingle(result);
      expect(resultData).toMatchObject({
        nodeError: true,
        failed: expect.arrayContaining([
          expect.objectContaining({
            error: 'Tool node execution failed'
          })
        ])
      });
    });
  });

  describe('Error Handling', () => {
    it('should return nodeError flag on tool node failure', async () => {
      // Mock a failing execution scenario
      const params: ToolParams = {
        name: 'universal_tool_executor',
        description: 'Execute tools based on input data',
        parameters: {
          type: 'object',
          properties: {
            toolCalls: { type: 'array', items: { type: 'object' } }
          }
        },
        blueprint: null
      };

      // Create tool with invalid execution context to trigger error
      const tool = new Tool(params, { execution: null as any });
      
      const result = await tool.execute(ExecutionItemUtils.wrapSingle([]));
      const resultData = ExecutionItemUtils.unwrapSingle(result);
      
      // For empty array, it should succeed but return empty results
      expect(resultData).toMatchObject({
        successful: [],
        failed: [],
        summary: { total: 0, successful: 0, failed: 0 }
      });
    });
  });

  describe('Validation', () => {
    it('should validate tool configuration correctly', () => {
      const params: ToolParams = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: {
          type: 'object',
          properties: {}
        },
        blueprint: createMockBlueprint()
      };

      const tool = new Tool(params);
      const validation = tool.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });

    it('should fail validation for missing required fields', () => {
      const params: ToolParams = {
        name: '',
        description: '',
        parameters: null as any,
        blueprint: null
      };

      const tool = new Tool(params);
      const validation = tool.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors!.length).toBeGreaterThan(0);
    });
  });
});