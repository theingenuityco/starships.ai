/**
 * MCP Integration Tests
 * 
 * Tests the integration between LangChain agents and MCP tools,
 * with a focus on Sequential Thinking server functionality.
 */

import { MCPToolGateway, ServiceRegistry, MCPServiceEndpoint } from '@starships/core';
import { MCPToolWrapper } from '../tools/MCPToolWrapper';
import { LangChainMemoryStore } from '../memory/langchain-memory';
import { DynamicTool } from '@langchain/core/tools';

// Mock implementations
jest.mock('@starships/core');
jest.mock('../memory/langchain-memory');

// Mock DynamicTool to accept our inputs properly
jest.mock('@langchain/core/tools', () => {
  return {
    DynamicTool: jest.fn().mockImplementation((config) => {
      return {
        name: config.name,
        description: config.description,
        func: config.func,
        _call: config.func  // Some versions use _call internally
      };
    })
  };
});

describe('MCP Integration Tests', () => {
  let mockGateway: jest.Mocked<MCPToolGateway>;
  let mockServiceRegistry: jest.Mocked<ServiceRegistry>;
  let mockMemoryStore: jest.Mocked<LangChainMemoryStore>;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instances
    mockGateway = new MCPToolGateway() as jest.Mocked<MCPToolGateway>;
    mockServiceRegistry = new ServiceRegistry() as jest.Mocked<ServiceRegistry>;
    mockMemoryStore = {} as jest.Mocked<LangChainMemoryStore>;
  });

  describe('MCPToolWrapper', () => {
    it('should create a LangChain tool from an MCP tool', async () => {
      const mcpTool = {
        name: 'sequentialthinking',
        description: 'Break down complex problems step by step',
        inputSchema: {
          type: 'object',
          properties: {
            thought: { type: 'string', description: 'The current thought' },
            thoughtNumber: { type: 'number', description: 'Current thought number' },
            totalThoughts: { type: 'number', description: 'Total number of thoughts' }
          },
          required: ['thought', 'thoughtNumber', 'totalThoughts']
        },
        connectorId: 'connector-123',
        templateSlug: 'sequentialthinking'
      };

      const wrapper = new MCPToolWrapper({
        starshipId: 'starship-123',
        agentId: 'agent-456',
        gateway: mockGateway,
        enableLogging: false
      });

      const langchainTool = wrapper.createLangChainTool(mcpTool);

      expect(langchainTool).toBeInstanceOf(DynamicTool);
      expect(langchainTool.name).toBe('sequentialthinking_sequentialthinking');
      expect(langchainTool.description).toContain('Break down complex problems');
      expect(langchainTool.description).toContain('Use for: Complex reasoning');
    });

    it('should handle tool execution successfully', async () => {
      const mcpTool = {
        name: 'store_memory',
        description: 'Store information in memory',
        inputSchema: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            value: { type: 'string' }
          },
          required: ['key', 'value']
        },
        connectorId: 'connector-123',
        templateSlug: 'memory'
      };

      // Mock gateway response
      mockGateway.invokeTool.mockResolvedValue({
        success: true,
        result: { stored: true, key: 'test-key' },
        executionTime: 50
      });

      const wrapper = new MCPToolWrapper({
        starshipId: 'starship-123',
        agentId: 'agent-456',
        gateway: mockGateway,
        enableLogging: false
      });

      const langchainTool = wrapper.createLangChainTool(mcpTool);
      const result = await (langchainTool as any).func({ key: 'test-key', value: 'test-value' });

      expect(mockGateway.invokeTool).toHaveBeenCalledWith(
        'starship-123',
        'store_memory',
        { key: 'test-key', value: 'test-value' }
      );
      expect(result).toBe('Stored successfully with key: test-key');
    });

    it('should handle tool execution errors gracefully', async () => {
      const mcpTool = {
        name: 'failing_tool',
        description: 'A tool that fails',
        inputSchema: { type: 'object', properties: {} },
        connectorId: 'connector-123',
        templateSlug: 'test'
      };

      // Mock gateway error
      mockGateway.invokeTool.mockResolvedValue({
        success: false,
        error: 'Network timeout',
        executionTime: 5000
      });

      const wrapper = new MCPToolWrapper({
        starshipId: 'starship-123',
        agentId: 'agent-456',
        gateway: mockGateway,
        enableLogging: false
      });

      const langchainTool = wrapper.createLangChainTool(mcpTool);
      const result = await (langchainTool as any).func({});

      expect(result).toBe('Tool execution failed: Network timeout');
    });
  });

  describe('Sequential Thinking Integration', () => {
    it('should discover Sequential Thinking tools', async () => {
      const mockServices: MCPServiceEndpoint[] = [{
        connectorId: 'seq-connector',
        templateSlug: 'sequentialthinking',
        containerName: 'mcp-starship123-sequentialthinking',
        internalUrl: 'http://mcp-starship123-sequentialthinking:8080',
        status: 'healthy',
        availableTools: ['sequentialthinking'],
        lastHealthCheck: new Date().toISOString()
      }];

      // Mock service registry
      (mockServiceRegistry.getStarshipServices as jest.Mock).mockReturnValue(mockServices);

      // Mock gateway tools response
      mockGateway.getToolsForStarship.mockResolvedValue([{
        name: 'sequentialthinking',
        description: 'Sequential thinking for complex reasoning',
        inputSchema: {
          type: 'object',
          properties: {
            thought: { type: 'string' },
            thoughtNumber: { type: 'number' },
            totalThoughts: { type: 'number' },
            nextThoughtNeeded: { type: 'boolean' }
          }
        },
        connectorId: 'seq-connector',
        templateSlug: 'sequentialthinking'
      }]);

      const tools = await mockGateway.getToolsForStarship('starship-123');

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('sequentialthinking');
      expect(tools[0].templateSlug).toBe('sequentialthinking');
    });

    it('should execute Sequential Thinking workflow', async () => {
      const sequentialThinkingTool = {
        name: 'sequentialthinking',
        description: 'Break down complex problems',
        inputSchema: {
          type: 'object',
          properties: {
            thought: { type: 'string' },
            thoughtNumber: { type: 'number' },
            totalThoughts: { type: 'number' },
            nextThoughtNeeded: { type: 'boolean' }
          }
        },
        connectorId: 'seq-connector',
        templateSlug: 'sequentialthinking'
      };

      // Mock tool execution responses
      const thoughtResponses = [
        {
          success: true,
          result: {
            thought: 'First, I need to understand the problem scope',
            thoughtNumber: 1,
            totalThoughts: 3,
            nextThoughtNeeded: true
          },
          executionTime: 100
        },
        {
          success: true,
          result: {
            thought: 'Next, I should identify the key components',
            thoughtNumber: 2,
            totalThoughts: 3,
            nextThoughtNeeded: true
          },
          executionTime: 120
        },
        {
          success: true,
          result: {
            thought: 'Finally, I can propose a solution approach',
            thoughtNumber: 3,
            totalThoughts: 3,
            nextThoughtNeeded: false
          },
          executionTime: 150
        }
      ];

      let callCount = 0;
      mockGateway.invokeTool.mockImplementation(async () => {
        return thoughtResponses[callCount++];
      });

      const wrapper = new MCPToolWrapper({
        starshipId: 'starship-123',
        agentId: 'agent-456',
        gateway: mockGateway,
        enableLogging: false
      });

      const tool = wrapper.createLangChainTool(sequentialThinkingTool);

      // Execute sequential thinking workflow
      const thoughts: string[] = [];
      let nextThoughtNeeded = true;
      let thoughtNumber = 1;

      while (nextThoughtNeeded && thoughtNumber <= 3) {
        const result = await (tool as any).func({
          thought: `Analyzing step ${thoughtNumber}`,
          thoughtNumber,
          totalThoughts: 3,
          nextThoughtNeeded: thoughtNumber < 3
        });

        thoughts.push(result);
        thoughtNumber++;
        
        // Parse result to check if next thought is needed
        if (result.includes('nextThoughtNeeded: false')) {
          nextThoughtNeeded = false;
        }
      }

      expect(thoughts).toHaveLength(3);
      expect(mockGateway.invokeTool).toHaveBeenCalledTimes(3);
    });
  });

  describe('Tool Usage Patterns', () => {
    it('should handle complex reasoning with Sequential Thinking', async () => {
      const problem = 'Design a distributed caching system for a microservices architecture';
      
      const sequentialThinkingResponses = [
        'First, I need to understand the requirements: scalability, consistency, and performance',
        'Next, I should consider caching patterns: write-through, write-behind, and cache-aside',
        'Then, evaluate technology options: Redis, Memcached, Hazelcast',
        'Finally, design the architecture with proper invalidation strategies'
      ];

      mockGateway.invokeTool.mockImplementation(async (starshipId: string, toolName: string, params: any) => {
        const thoughtNumber = params.thoughtNumber || 1;
        return {
          success: true,
          result: {
            thought: sequentialThinkingResponses[thoughtNumber - 1],
            thoughtNumber,
            totalThoughts: 4,
            nextThoughtNeeded: thoughtNumber < 4
          },
          executionTime: 200
        };
      });

      // Execute the pattern
      const thoughts: any[] = [];
      for (let i = 1; i <= 4; i++) {
        const result = await mockGateway.invokeTool(
          'starship-123',
          'sequentialthinking',
          {
            thought: problem,
            thoughtNumber: i,
            totalThoughts: 4,
            nextThoughtNeeded: i < 4
          }
        );
        thoughts.push(result.result);
      }

      expect(thoughts).toHaveLength(4);
      expect(thoughts[0].thought).toContain('requirements');
      expect(thoughts[1].thought).toContain('caching patterns');
      expect(thoughts[2].thought).toContain('technology options');
      expect(thoughts[3].thought).toContain('architecture');
    });

    it('should handle memory storage and retrieval pattern', async () => {
      const contextKey = 'project_context';
      const contextValue = {
        project: 'E-commerce Platform',
        techStack: ['React', 'Node.js', 'PostgreSQL'],
        requirements: ['High availability', 'Scalability', 'Security']
      };

      // Mock memory storage
      mockGateway.invokeTool.mockImplementation(async (starshipId: string, toolName: string, params: any) => {
        if (toolName === 'store_memory') {
          return {
            success: true,
            result: { stored: true, key: params.key },
            executionTime: 30
          };
        } else if (toolName === 'retrieve_memory') {
          return {
            success: true,
            result: { retrieved: true, value: contextValue },
            executionTime: 20
          };
        }
        throw new Error(`Unknown tool: ${toolName}`);
      });

      // Store context
      const storeResult = await mockGateway.invokeTool(
        'starship-123',
        'store_memory',
        { key: contextKey, value: JSON.stringify(contextValue) }
      );

      expect(storeResult.success).toBe(true);
      expect(storeResult.result.stored).toBe(true);

      // Retrieve context
      const retrieveResult = await mockGateway.invokeTool(
        'starship-123',
        'retrieve_memory',
        { key: contextKey }
      );

      expect(retrieveResult.success).toBe(true);
      expect(retrieveResult.result.value).toEqual(contextValue);
    });
  });
});