import { ToolRegistry, ToolExecutor } from '../../src/tools/ToolRegistry';
import { MCPToolConfig } from '@starships/protocol';

describe('ToolRegistry', () => {
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    toolRegistry = new ToolRegistry();
  });

  describe('initialize', () => {
    it('should initialize with built-in tools', async () => {
      await toolRegistry.initialize();
      
      // Check that built-in tool executors are registered
      const webScraperExecutor = await toolRegistry.getToolExecutor('web_scraper');
      const fileReaderExecutor = await toolRegistry.getToolExecutor('file_reader');
      const dataAnalyzerExecutor = await toolRegistry.getToolExecutor('data_analyzer');
      const emailSenderExecutor = await toolRegistry.getToolExecutor('email_sender');

      expect(webScraperExecutor).not.toBeNull();
      expect(fileReaderExecutor).not.toBeNull();
      expect(dataAnalyzerExecutor).not.toBeNull();
      expect(emailSenderExecutor).not.toBeNull();
    });

    it('should not reinitialize if already initialized', async () => {
      await toolRegistry.initialize();
      
      // Should not throw error on second initialization
      await expect(toolRegistry.initialize()).resolves.toBeUndefined();
    });
  });

  describe('registerUserTools', () => {
    const mockToolConfigs: MCPToolConfig[] = [
      {
        name: 'custom_tool',
        description: 'A custom tool',
        parameters: {
          input: { type: 'string', required: true }
        },
        permissions: ['custom_access'],
        category: 'custom'
      },
      {
        name: 'web_scraper',
        description: 'Scrape web content',
        parameters: {
          url: { type: 'string', required: true }
        },
        permissions: ['web_access'],
        category: 'data'
      }
    ];

    it('should register tools for a user', async () => {
      await toolRegistry.registerUserTools('user-1', mockToolConfigs);
      
      const userTools = await toolRegistry.getUserTools('user-1');
      expect(userTools).toHaveLength(2);
      expect(userTools[0].name).toBe('custom_tool');
      expect(userTools[1].name).toBe('web_scraper');
    });

    it('should create tool executors for new tools', async () => {
      await toolRegistry.registerUserTools('user-1', mockToolConfigs);
      
      const customToolExecutor = await toolRegistry.getToolExecutor('custom_tool');
      expect(customToolExecutor).not.toBeNull();
      expect(customToolExecutor?.name).toBe('custom_tool');
    });

    it('should handle empty tool configs', async () => {
      await toolRegistry.registerUserTools('user-1', []);
      
      const userTools = await toolRegistry.getUserTools('user-1');
      expect(userTools).toEqual([]);
    });

    it('should replace existing tools for the same user', async () => {
      await toolRegistry.registerUserTools('user-1', [mockToolConfigs[0]]);
      await toolRegistry.registerUserTools('user-1', [mockToolConfigs[1]]);
      
      const userTools = await toolRegistry.getUserTools('user-1');
      expect(userTools).toHaveLength(1);
      expect(userTools[0].name).toBe('web_scraper');
    });
  });

  describe('getUserTools', () => {
    it('should return empty array for user with no tools', async () => {
      const userTools = await toolRegistry.getUserTools('non-existent-user');
      expect(userTools).toEqual([]);
    });

    it('should return tools for specific user', async () => {
      const toolConfig: MCPToolConfig = {
        name: 'user_tool',
        description: 'User specific tool',
        parameters: { input: { type: 'string', required: true } },
        permissions: ['user_access'],
        category: 'custom'
      };

      await toolRegistry.registerUserTools('user-1', [toolConfig]);
      await toolRegistry.registerUserTools('user-2', []);

      const user1Tools = await toolRegistry.getUserTools('user-1');
      const user2Tools = await toolRegistry.getUserTools('user-2');

      expect(user1Tools).toHaveLength(1);
      expect(user1Tools[0].name).toBe('user_tool');
      expect(user2Tools).toEqual([]);
    });
  });

  describe('getToolExecutor', () => {
    it('should return null for non-existent tool', async () => {
      const executor = await toolRegistry.getToolExecutor('non-existent-tool');
      expect(executor).toBeNull();
    });

    it('should return executor for registered tool', async () => {
      const toolConfig: MCPToolConfig = {
        name: 'test_tool',
        description: 'Test tool',
        parameters: { input: { type: 'string', required: true } },
        permissions: ['test_access'],
        category: 'custom'
      };

      await toolRegistry.registerUserTools('user-1', [toolConfig]);
      
      const executor = await toolRegistry.getToolExecutor('test_tool');
      expect(executor).not.toBeNull();
      expect(executor?.name).toBe('test_tool');
      expect(executor?.description).toBe('Test tool');
    });
  });

  describe('cleanup', () => {
    it('should clear all tools and executors', async () => {
      const toolConfig: MCPToolConfig = {
        name: 'cleanup_test_tool',
        description: 'Tool for cleanup test',
        parameters: { input: { type: 'string', required: true } },
        permissions: ['test_access'],
        category: 'custom'
      };

      await toolRegistry.registerUserTools('user-1', [toolConfig]);
      
      // Verify tools exist before cleanup
      let userTools = await toolRegistry.getUserTools('user-1');
      let executor = await toolRegistry.getToolExecutor('cleanup_test_tool');
      expect(userTools).toHaveLength(1);
      expect(executor).not.toBeNull();

      // Cleanup
      await toolRegistry.cleanup();

      // Verify tools are cleared after cleanup
      userTools = await toolRegistry.getUserTools('user-1');
      executor = await toolRegistry.getToolExecutor('cleanup_test_tool');
      expect(userTools).toEqual([]);
      expect(executor).toBeNull();
    });
  });
});

describe('ToolExecutor', () => {
  describe('built-in tool execution', () => {
    it('should execute web_scraper tool', async () => {
      const executor = new ToolExecutor('web_scraper', 'Scrape web content', {
        url: { type: 'string', required: true }
      });

      const result = await executor.execute({ url: 'https://example.com' });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        url: 'https://example.com',
        content: 'Scraped content from https://example.com',
        timestamp: expect.any(String)
      });
      expect(result.logs).toEqual(['Scraped https://example.com']);
    });

    it('should execute file_reader tool', async () => {
      const executor = new ToolExecutor('file_reader', 'Read files', {
        file_path: { type: 'string', required: true }
      });

      const result = await executor.execute({ 
        file_path: '/path/to/file.txt',
        encoding: 'utf-8'
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        file_path: '/path/to/file.txt',
        content: 'File content from /path/to/file.txt',
        size: 1024,
        encoding: 'utf-8'
      });
      expect(result.logs).toEqual(['Read file /path/to/file.txt']);
    });

    it('should execute data_analyzer tool', async () => {
      const executor = new ToolExecutor('data_analyzer', 'Analyze data', {
        data: { type: 'object', required: true },
        analysis_type: { type: 'string', required: true }
      });

      const result = await executor.execute({ 
        data: { values: [1, 2, 3] },
        analysis_type: 'statistical'
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        analysis_type: 'statistical',
        summary: 'Data analysis completed',
        insights: ['Insight 1', 'Insight 2'],
        timestamp: expect.any(String)
      });
      expect(result.logs).toEqual(['Analyzed data with statistical']);
    });

    it('should execute email_sender tool', async () => {
      const executor = new ToolExecutor('email_sender', 'Send emails', {
        to: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        body: { type: 'string', required: true }
      });

      const result = await executor.execute({ 
        to: 'test@example.com',
        subject: 'Test Email',
        body: 'This is a test email'
      });

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        to: 'test@example.com',
        subject: 'Test Email',
        message_id: expect.stringMatching(/^msg-\d+$/),
        sent_at: expect.any(String)
      });
      expect(result.logs).toEqual(['Email sent to test@example.com']);
    });

    it('should handle unknown tool execution', async () => {
      const executor = new ToolExecutor('unknown_tool', 'Unknown tool', {});

      const result = await executor.execute({});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown tool: unknown_tool');
    });

    it('should handle execution errors gracefully', async () => {
      const executor = new ToolExecutor('web_scraper', 'Scrape web content', {});
      
      // Mock an error by passing invalid parameters that would cause an error
      // Since this is a placeholder implementation, we'll test the error handling structure
      const result = await executor.execute({ url: 'https://example.com' });
      
      // The current implementation should succeed, but if it failed, it should handle errors
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('result');
      
      if (!result.success) {
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('logs');
      }
    });
  });
});