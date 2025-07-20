import { api } from '../testUtils';
import { initializeMCPServerRoutes } from '../../src/routes/mcp-servers';
import type { MCPServerOptionRepository } from '@starships/models/src/types';

const mockMCPServerRepo: jest.Mocked<MCPServerOptionRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByCommand: jest.fn(),
  findActive: jest.fn(),
  searchByName: jest.fn(),
};

// Mock auth middleware to provide test user
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-1', email: 'test@example.com' };
    next();
  },
}));

describe('MCP Server Template Routes', () => {
  beforeEach(() => {
    // Initialize routes with mock repositories
    initializeMCPServerRoutes({
      mcpServerOptionRepository: mockMCPServerRepo,
    });

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /mcp-servers', () => {
    it('should return list of MCP server templates', async () => {
      const mockMCPServers = [
        {
          id: 'github',
          name: 'Github',
          command: 'docker',
          args: ['run', '-i', '--rm'],
          env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"GitHub Personal Access Token"}',
        },
        {
          id: 'puppeteer',
          name: 'Puppeteer',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-puppeteer'],
          env: '{}',
        },
      ];

      mockMCPServerRepo.findAll.mockResolvedValueOnce(mockMCPServers);

      const res = await api().get('/mcp-servers').expect(200);

      expect(res.body).toEqual({ mcpServers: mockMCPServers });
      expect(mockMCPServerRepo.findAll).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when fetching MCP server templates', async () => {
      mockMCPServerRepo.findAll.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get('/mcp-servers').expect(500);

      expect(res.body).toEqual({ error: 'Failed to fetch MCP server templates' });
    });
  });

  describe('GET /mcp-servers/:id', () => {
    const serverId = 'github';

    it('should return specific MCP server template', async () => {
      const mockMCPServer = {
        id: serverId,
        name: 'Github',
        command: 'docker',
        args: ['run', '-i', '--rm'],
        env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"GitHub Personal Access Token"}',
      };

      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);

      const res = await api().get(`/mcp-servers/${serverId}`).expect(200);

      expect(res.body).toEqual({ mcpServer: mockMCPServer });
      expect(mockMCPServerRepo.findById).toHaveBeenCalledWith(serverId);
    });

    it('should return 400 for empty server ID', async () => {
      const res = await api().get('/mcp-servers/ ').expect(400);
      expect(res.body).toEqual({ error: 'MCP Server template ID is required' });
    });

    it('should return 404 when MCP server template not found', async () => {
      mockMCPServerRepo.findById.mockResolvedValueOnce(null);

      const res = await api().get(`/mcp-servers/${serverId}`).expect(404);
      expect(res.body).toEqual({ error: 'MCP server template not found' });
    });

    it('should handle errors when fetching MCP server template', async () => {
      mockMCPServerRepo.findById.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get(`/mcp-servers/${serverId}`).expect(500);
      expect(res.body).toEqual({ error: 'Failed to fetch MCP server template' });
    });
  });
});
