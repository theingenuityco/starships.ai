import { MCPToolWrapper } from '../MCPToolWrapper';
import { DynamicTool } from '@langchain/core/tools';

// Mock the BraveSearch import
jest.mock('@langchain/community/tools/brave_search', () => ({
  BraveSearch: jest.fn().mockImplementation((config: any) => ({
    apiKey: config.apiKey,
    invoke: jest.fn().mockResolvedValue({
      web: {
        results: [
          {
            title: 'Test Result',
            url: 'https://example.com',
            description: 'Test description'
          }
        ]
      }
    })
  }))
}));

// Mock the repository
jest.mock('@starships/models', () => ({
  getConnection: jest.fn(),
  RepositoryFactory: {
    getNativeToolApiKeyRepository: jest.fn().mockReturnValue({
      getAllApiKeys: jest.fn().mockResolvedValue({
        brave: 'BSA_test_key_123'
      })
    })
  }
}));

describe('Brave Search Native Tool Integration', () => {
  let toolWrapper: MCPToolWrapper;
  let tools: DynamicTool[];

  beforeEach(() => {
    jest.clearAllMocks();
    
    toolWrapper = new MCPToolWrapper({
      starshipId: 'test-starship-123',
      agentId: 'test-agent-456',
      gateway: {} as any,
      enableLogging: true
    });
  });

  describe('Tool Initialization', () => {
    it('should add Brave Search tool when API key exists', async () => {
      tools = await toolWrapper.createAllTools();
      
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      expect(braveTool).toBeDefined();
      expect(braveTool?.description).toBe('Privacy-focused web search using Brave');
    });

    it('should not add Brave Search tool when API key is missing', async () => {
      // Mock no API keys
      const { RepositoryFactory } = jest.requireMock('@starships/models');
      RepositoryFactory.getNativeToolApiKeyRepository.mockReturnValue({
        getAllApiKeys: jest.fn().mockResolvedValue({})
      });

      const wrapper = new MCPToolWrapper({
        starshipId: 'test-starship-no-key',
        agentId: 'test-agent',
        gateway: {} as any
      });

      tools = await wrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      expect(braveTool).toBeUndefined();
    });
  });

  describe('Search Functionality', () => {
    it('should execute search and return formatted results', async () => {
      tools = await toolWrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      
      if (!braveTool) {
        throw new Error('Brave tool not found');
      }

      const result = await braveTool.func('test query');
      const parsed = JSON.parse(result);
      
      expect(parsed.web.results).toHaveLength(1);
      expect(parsed.web.results[0].title).toBe('Test Result');
    });

    it('should handle string responses from Brave API', async () => {
      // Mock string response
      const { BraveSearch } = jest.requireMock('@langchain/community/tools/brave_search');
      BraveSearch.mockImplementation((config: any) => ({
        apiKey: config.apiKey,
        invoke: jest.fn().mockResolvedValue('Simple string response')
      }));

      const wrapper = new MCPToolWrapper({
        starshipId: 'test-starship',
        agentId: 'test-agent',
        gateway: {} as any
      });

      tools = await wrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      
      if (!braveTool) {
        throw new Error('Brave tool not found');
      }

      const result = await braveTool.func('test query');
      expect(result).toBe('Simple string response');
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock API error
      const { BraveSearch } = jest.requireMock('@langchain/community/tools/brave_search');
      BraveSearch.mockImplementation((config: any) => ({
        apiKey: config.apiKey,
        invoke: jest.fn().mockRejectedValue(new Error('API rate limit exceeded'))
      }));

      const wrapper = new MCPToolWrapper({
        starshipId: 'test-starship',
        agentId: 'test-agent',
        gateway: {} as any
      });

      tools = await wrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      
      if (!braveTool) {
        throw new Error('Brave tool not found');
      }

      await expect(braveTool.func('test query')).rejects.toThrow('API rate limit exceeded');
    });

    it('should handle invalid API key format', async () => {
      // Mock invalid key format
      const { RepositoryFactory } = jest.requireMock('@starships/models');
      RepositoryFactory.getNativeToolApiKeyRepository.mockReturnValue({
        getAllApiKeys: jest.fn().mockResolvedValue({
          brave: 'invalid_key_format'
        })
      });

      const { BraveSearch } = jest.requireMock('@langchain/community/tools/brave_search');
      BraveSearch.mockImplementation(() => {
        throw new Error('Invalid API key format');
      });

      const wrapper = new MCPToolWrapper({
        starshipId: 'test-starship-invalid',
        agentId: 'test-agent',
        gateway: {} as any
      });

      tools = await wrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      expect(braveTool).toBeUndefined(); // Tool should not be added if initialization fails
    });
  });

  describe('Logging', () => {
    it('should log search queries when logging is enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      tools = await toolWrapper.createAllTools();
      const braveTool = tools.find(t => t.name === 'brave_web_search');
      
      if (!braveTool) {
        throw new Error('Brave tool not found');
      }

      await braveTool.func('test logging query');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Brave] Starship test-starship-123 searching: test logging query')
      );
      
      consoleSpy.mockRestore();
    });
  });
});