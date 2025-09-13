/**
 * Agent Node Handler Tests
 *
 * Tests for AI agents with embedded workflow execution and memory management
 */

import { Agent } from '../Agent';
import type { AgentParams } from '@/types/node-parameters';
import type { Blueprint } from '@/types';

// Mock Engine to avoid actual workflow execution in unit tests
jest.mock('@/engine/Engine', () => ({
  Engine: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
    getExecution: jest.fn().mockReturnValue({
      results: [
        { nodeRef: 'start', data: {} },
        { nodeRef: 'end', data: {} },
      ],
    }),
    hasHandler: jest.fn().mockReturnValue(true),
  })),
}));

describe('Agent Node Handler', () => {
  const createMockBlueprint = (overrides: Partial<Blueprint> = {}): Blueprint => ({
    nodes: [
      { ref: 'start', type: 'start', name: 'Start', description: 'Start node', parameters: {} },
      { ref: 'end', type: 'end', name: 'End', description: 'End node', parameters: {} },
    ],
    edges: [{ ref: 'edge-1', from: 'start', to: 'end' }],
    metadata: {},
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Agent Functionality', () => {
    it('should create agent with valid configuration', () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {
          identity: { name: 'TestBot', role: 'Assistant' },
          purpose: { primary: 'Help users' },
        },
        blueprint: createMockBlueprint(),
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });

    it('should execute agent workflow successfully', async () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {
          identity: { name: 'TestBot', role: 'Assistant' },
          purpose: { primary: 'Help users' },
        },
        blueprint: createMockBlueprint(),
      };

      const eventCallback = jest.fn();
      const agent = new Agent(params, { eventCallback });

      const results = await agent.execute();

      expect(results).toHaveLength(2);
      expect(results[0].nodeRef).toBe('start');
      expect(results[1].nodeRef).toBe('end');
    });

    it('should handle custom agent parameters', () => {
      const params: AgentParams = {
        name: 'Custom Agent',
        description: 'A specialized agent',
        model: 'openai/gpt-4-turbo',
        temperature: 0.9,
        maxTokens: 2000,
        timeout: 60000,
        memoryState: {
          identity: { name: 'Custom', role: 'Specialist' },
          purpose: { primary: 'Specialized tasks' },
        },
        blueprint: createMockBlueprint(),
        metadata: { version: '1.0', category: 'custom' },
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });
  });

  describe('Agent Memory Integration', () => {
    it('should handle empty memory state', () => {
      const params: AgentParams = {
        name: 'Minimal Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {},
        blueprint: createMockBlueprint(),
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });

    it('should handle comprehensive memory state', () => {
      const params: AgentParams = {
        name: 'Memory Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {
          identity: {
            name: 'Sarah',
            role: 'Customer Support Agent',
            personality: 'Professional and empathetic',
            expertise: ['customer service', 'technical support'],
          },
          purpose: {
            primary: 'Resolve customer issues efficiently',
            constraints: ['Be professional', 'Escalate complex issues'],
          },
          space: {
            description: 'Customer support chat environment',
          },
        },
        blueprint: createMockBlueprint(),
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });
  });

  describe('Validation', () => {
    it('should validate required agent fields', () => {
      const params = {
        // Missing name and model
        memoryState: {},
        blueprint: createMockBlueprint(),
      } as AgentParams;

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Agent name is required',
        })
      );
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Agent model is required',
        })
      );
    });

    it('should validate memory state requirement', () => {
      const params = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        // Missing memoryState
        blueprint: createMockBlueprint(),
      } as AgentParams;

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Agent memory is required',
        })
      );
    });

    it('should validate blueprint requirement', () => {
      const params = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {},
        // Missing blueprint
      } as AgentParams;

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Agent blueprint is required',
        })
      );
    });

    it('should validate blueprint structure', () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {},
        blueprint: {
          nodes: [
            // Missing start node
            { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
          ],
          edges: [],
          metadata: {},
        },
      };

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'MISSING_START_NODE',
          message: 'Agent blueprint must have a start node',
        })
      );
    });

    it('should validate parameter ranges', () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {},
        blueprint: createMockBlueprint(),
        timeout: 500, // Too low
        temperature: 3.0, // Too high
        maxTokens: 0, // Too low
      };

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PARAMETERS',
          message: 'Agent timeout should be at least 1000ms',
        })
      );
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PARAMETERS',
          message: 'Agent temperature should be between 0 and 2',
        })
      );
      expect(validation.errors).toContainEqual(
        expect.objectContaining({
          code: 'INVALID_PARAMETERS',
          message: 'Agent maxTokens should be at least 1',
        })
      );
    });

    it('should pass validation with valid configuration', () => {
      const params: AgentParams = {
        name: 'Valid Agent',
        description: 'A properly configured agent',
        model: 'anthropic/claude-3.5-sonnet',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        memoryState: {
          identity: { name: 'ValidBot', role: 'Assistant' },
          purpose: { primary: 'Help users' },
        },
        blueprint: createMockBlueprint(),
        metadata: { version: '1.0' },
      };

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });
  });

  describe('Complex Agent Scenarios', () => {
    it('should handle agent with complex workflow', () => {
      const complexBlueprint: Blueprint = {
        nodes: [
          { ref: 'start', type: 'start', name: 'Start', description: 'Start', parameters: {} },
          {
            ref: 'llm1',
            type: 'llm',
            name: 'LLM 1',
            description: 'First LLM',
            parameters: {
              model: 'anthropic/claude-3.5-sonnet',
              messages: [{ role: 'user', content: 'Hello' }],
            },
          },
          {
            ref: 'conditional',
            type: 'conditional',
            name: 'Check',
            description: 'Conditional',
            parameters: {
              expression: 'results[-1].data.success = true',
            },
          },
          {
            ref: 'llm2',
            type: 'llm',
            name: 'LLM 2',
            description: 'Second LLM',
            parameters: {
              model: 'openai/gpt-4-turbo',
              messages: [{ role: 'user', content: 'Follow up' }],
            },
          },
          { ref: 'end', type: 'end', name: 'End', description: 'End', parameters: {} },
        ],
        edges: [
          { ref: 'edge-1', from: 'start', to: 'llm1' },
          { ref: 'edge-2', from: 'llm1', to: 'conditional' },
          { ref: 'edge-3', from: 'conditional', to: 'llm2', condition: 'true' },
          { ref: 'edge-4', from: 'llm2', to: 'end' },
        ],
        metadata: { complexity: 'high' },
      };

      const params: AgentParams = {
        name: 'Complex Agent',
        model: 'anthropic/claude-3.5-sonnet',
        memoryState: {
          identity: {
            name: 'ComplexBot',
            role: 'Multi-step Assistant',
            expertise: ['reasoning', 'decision-making'],
          },
          purpose: {
            primary: 'Handle complex multi-step tasks',
            secondary: ['Analyze', 'Decide', 'Execute'],
            constraints: ['Be thorough', 'Explain reasoning'],
          },
        },
        blueprint: complexBlueprint,
      };

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(true);
    });
  });
});
