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
    executeBlueprint: jest.fn().mockResolvedValue([
      { json: { result: 'start' }, pairedItem: { item: 0 } },
      { json: { result: 'end' }, pairedItem: { item: 1 } },
    ]),
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
        systemPrompt: 'You are TestBot, an assistant. Help users with their needs.',
        state: {
          messages: [],
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
        systemPrompt: 'You are TestBot, an assistant. Help users with their needs.',
        state: {
          messages: [],
        },
        blueprint: createMockBlueprint(),
      };

      const eventCallback = jest.fn();
      const agent = new Agent(params, { eventCallback });

      const execution = await agent.execute();

      expect(execution).toHaveLength(2);
      expect(execution[0].json).toEqual({ result: 'start' });
      expect(execution[1].json).toEqual({ result: 'end' });
    });

    it('should handle custom agent parameters', () => {
      const params: AgentParams = {
        name: 'Custom Agent',
        description: 'A specialized agent',
        model: 'openai/gpt-4-turbo',
        temperature: 0.9,
        maxTokens: 2000,
        timeout: 60000,
        systemPrompt: 'You are Custom, a specialist. Handle specialized tasks.',
        state: {
          messages: [],
        },
        blueprint: createMockBlueprint(),
        metadata: { version: '1.0', category: 'custom' },
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });
  });

  describe('Agent Memory Integration', () => {
    it('should handle empty state', () => {
      const params: AgentParams = {
        name: 'Minimal Agent',
        model: 'anthropic/claude-3.5-sonnet',
        state: {},
        blueprint: createMockBlueprint(),
      };

      const agent = new Agent(params);
      expect(agent).toBeDefined();
    });

    it('should handle comprehensive state', () => {
      const params: AgentParams = {
        name: 'Memory Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt:
          'You are Sarah, a customer support agent. Be professional and empathetic. Resolve customer issues efficiently and escalate complex issues when needed.',
        state: {
          messages: [
            { role: 'user', content: 'I need help with my account' },
            { role: 'assistant', content: "I'd be happy to help you with your account. What specific issue are you experiencing?" },
          ],
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
        state: {},
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

    it('should create default blueprint when none provided', () => {
      const params = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a test agent.',
        state: {},
        // Missing blueprint - should create default
      } as AgentParams;

      const agent = new Agent(params);
      const validation = agent.validate();

      // Should pass validation since constructor creates default blueprint
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();

      // Verify default blueprint was created
      const blueprint = agent.getCurrentBlueprint();
      expect(blueprint.nodes).toHaveLength(4); // start, end, llm, and conditional
      expect(blueprint.nodes.some((node) => node.type === 'start')).toBe(true);
      expect(blueprint.nodes.some((node) => node.type === 'llm')).toBe(true);
      expect(blueprint.nodes.some((node) => node.type === 'end')).toBe(true);
      expect(blueprint.nodes.some((node) => node.type === 'conditional')).toBe(true);
      expect(blueprint.edges).toHaveLength(3); // edges: start->llm->conditional->end
    });

    it('should validate blueprint structure', () => {
      const params: AgentParams = {
        name: 'Test Agent',
        model: 'anthropic/claude-3.5-sonnet',
        systemPrompt: 'You are a test agent.',
        state: {},
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
        systemPrompt: 'You are a test agent.',
        state: {},
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
        systemPrompt: 'You are ValidBot, an assistant. Help users with their needs.',
        state: {
          messages: [],
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
              condition: 'results[-1].data.success = true',
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
        systemPrompt:
          'You are ComplexBot, a multi-step assistant with expertise in reasoning and decision-making. Handle complex multi-step tasks by analyzing, deciding, and executing. Be thorough and explain your reasoning.',
        state: {
          messages: [],
        },
        blueprint: complexBlueprint,
      };

      const agent = new Agent(params);
      const validation = agent.validate();

      expect(validation.valid).toBe(true);
    });
  });
});
