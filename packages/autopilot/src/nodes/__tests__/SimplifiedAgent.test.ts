import { SimplifiedAgent } from '../SimplifiedAgent';
import { AgentParams } from '@/types';

describe('SimplifiedAgent', () => {
  const baseParams: AgentParams = {
    name: 'TestAgent',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 1000,
    timeout: 30000,
    state: {
      messages: [],
      tools: []
    }
  };

  describe('Blueprint Generation', () => {
    it('should create an optimized blueprint', () => {
      const simplifiedAgent = new SimplifiedAgent(baseParams);
      const simplifiedBlueprint = simplifiedAgent.getBlueprint();
      
      // Should have 6 nodes (start, end, llm, check, tools, synthesis)
      expect(simplifiedBlueprint?.nodes.length).toBe(6);
      
      // Should have tool type (mapped to ParallelToolsNode)
      const hasToolNode = simplifiedBlueprint?.nodes.some((n: any) => n.type === 'tool');
      expect(hasToolNode).toBe(true);
      
      // Should have synthesis LLM
      const hasSynthesis = simplifiedBlueprint?.nodes.some((n: any) => n.name === 'Synthesis');
      expect(hasSynthesis).toBe(true);
    });

    it('should support multiple tools natively', () => {
      const params: AgentParams = {
        ...baseParams,
        state: {
          messages: [],
          tools: [
            { name: 'search', description: 'Search the web', parameters: { type: 'object' as const, properties: {} }, blueprint: { nodes: [], edges: [] } },
            { name: 'calculator', description: 'Perform calculations', parameters: { type: 'object' as const, properties: {} }, blueprint: { nodes: [], edges: [] } },
            { name: 'weather', description: 'Get weather information', parameters: { type: 'object' as const, properties: {} }, blueprint: { nodes: [], edges: [] } }
          ]
        }
      };
      
      const agent = new SimplifiedAgent(params);
      const blueprint = agent.getBlueprint();
      
      // Should have tool node that handles parallel execution
      const toolNode = blueprint?.nodes.find((n: any) => n.type === 'tool');
      expect(toolNode).toBeDefined();
      expect(toolNode?.description).toContain('1-N tools');
    });
  });

  describe('State Management', () => {
    it('should initialize state correctly', () => {
      const params: AgentParams = {
        ...baseParams,
        state: {
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' }
          ],
          tools: [
            { name: 'test_tool', description: 'Test', parameters: { type: 'object' as const, properties: {} }, blueprint: { nodes: [], edges: [] } }
          ]
        }
      };
      
      const agent = new SimplifiedAgent(params);
      const state = agent.getState();
      
      expect(state.messages).toHaveLength(2);
      expect(state.tools).toHaveLength(1);
    });

    it('should allow state updates', () => {
      const agent = new SimplifiedAgent(baseParams);
      
      agent.addMessage({ role: 'user', content: 'Test message' });
      agent.addTool({ name: 'new_tool', description: 'A new tool' });
      
      const state = agent.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.tools).toHaveLength(1);
    });

    it('should clear messages', () => {
      const agent = new SimplifiedAgent({
        ...baseParams,
        state: {
          messages: [
            { role: 'user', content: 'Message 1' },
            { role: 'user', content: 'Message 2' }
          ],
          tools: []
        }
      });
      
      agent.clearMessages();
      const state = agent.getState();
      expect(state.messages).toHaveLength(0);
    });
  });

  describe('Validation', () => {
    it('should validate required parameters', () => {
      const invalidParams: AgentParams = {
        ...baseParams,
        model: ''
      };
      
      const agent = new SimplifiedAgent(invalidParams);
      const validation = agent.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toHaveLength(1);
      expect(validation.errors![0].message).toContain('Model');
    });

    it('should pass validation with valid params', () => {
      const agent = new SimplifiedAgent(baseParams);
      const validation = agent.validate();
      
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Blueprint Optimization', () => {
    it('should have optimized edge structure', () => {
      const simplifiedAgent = new SimplifiedAgent(baseParams);
      const simplifiedEdges = simplifiedAgent.getEdgeCount();
      
      // Should have 7 edges
      expect(simplifiedEdges).toBe(7);
      
      // Check for conditional edges
      const blueprint = simplifiedAgent.getBlueprint();
      const conditionalEdges = blueprint?.edges.filter((e: any) => e.condition !== undefined);
      expect(conditionalEdges?.length).toBeGreaterThan(0);
    });

    it('should use parallel execution metadata', () => {
      const agent = new SimplifiedAgent(baseParams);
      const blueprint = agent.getBlueprint();
      
      expect(blueprint?.metadata?.optimizedFor).toBe('parallel_execution');
      expect(blueprint?.metadata?.generatedBy).toBe('SimplifiedAgent');
    });
  });
});