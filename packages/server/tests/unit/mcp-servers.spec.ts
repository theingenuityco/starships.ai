import { api } from '../testUtils';
import { initializeMCPServerRoutes } from '../../src/routes/mcp-servers';
import type { StarshipRepository, MCPServerOptionRepository } from '@starships/models/src/types';

// Mock repositories
const mockStarshipRepo: jest.Mocked<StarshipRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByOwner: jest.fn(),
  getDeployedAgents: jest.fn(),
  deployAgent: jest.fn(),
  removeAgent: jest.fn(),
  getAvailableSlots: jest.fn(),
  generateUniqueSlug: jest.fn(),
  isSlugAvailable: jest.fn(),
  createSlugFromName: jest.fn(),
  getConnectedMCPServers: jest.fn(),
  connectMCPServer: jest.fn(),
  disconnectMCPServer: jest.fn(),
};

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

describe('MCP Server Routes', () => {
  beforeEach(() => {
    // Initialize routes with mock repositories
    initializeMCPServerRoutes({
      starshipRepository: mockStarshipRepo,
      mcpServerOptionRepository: mockMCPServerRepo,
    });

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('GET /mcp-servers', () => {
    it('should return list of MCP server options', async () => {
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

    it('should handle errors when fetching MCP servers', async () => {
      mockMCPServerRepo.findAll.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get('/mcp-servers').expect(500);

      expect(res.body).toEqual({ error: 'Failed to fetch MCP server options' });
    });
  });

  describe('GET /starships/:id/connectors', () => {
    const starshipId = 'starship-123';
    const mockStarship = {
      id: starshipId,
      ownerId: 'test-user-1',
      name: 'Test Starship',
      class: 'scout' as const,
      slug: 'test-starship',
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      maxAgents: 3,
      status: 'active' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('should return connected MCP servers for starship', async () => {
      const mockConnectedServers = [
        {
          id: 'github',
          name: 'Github',
          command: 'docker',
          args: ['run', '-i', '--rm'],
          env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
          _connectionMetadata: {
            connectedAt: '2024-01-01T00:00:00Z',
            isActive: true,
          },
        },
      ];

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockStarshipRepo.getConnectedMCPServers.mockResolvedValueOnce(mockConnectedServers);

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(200);

      expect(res.body).toEqual({
        starshipId,
        connectedConnectors: [
          {
            id: 'github',
            name: 'Github',
            command: 'docker',
            args: ['run', '-i', '--rm'],
            env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
            connectedAt: '2024-01-01T00:00:00Z',
            isActive: true,
          },
        ],
      });
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().get('/starships/ /connectors').expect(400);
      expect(res.body).toEqual({ error: 'Starship ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should handle errors when fetching connectors', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockStarshipRepo.getConnectedMCPServers.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(500);
      expect(res.body).toEqual({ error: 'Failed to fetch starship connectors' });
    });
  });

  describe('POST /starships/:id/connectors/:mcpServerId', () => {
    const starshipId = 'starship-123';
    const mcpServerId = 'github';
    const mockStarship = {
      id: starshipId,
      ownerId: 'test-user-1',
      name: 'Test Starship',
      class: 'scout' as const,
      slug: 'test-starship',
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      maxAgents: 3,
      status: 'active' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const mockMCPServer = {
      id: mcpServerId,
      name: 'Github',
      command: 'docker',
      args: ['run', '-i', '--rm'],
      env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
    };

    it('should successfully connect MCP server to starship', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.getConnectedMCPServers.mockResolvedValueOnce([]);
      mockStarshipRepo.connectMCPServer.mockResolvedValueOnce(true);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(201);

      expect(res.body).toMatchObject({
        message: 'MCP server connected successfully',
        starshipId,
        mcpServerId,
      });
      expect(res.body.connectedAt).toBeDefined();
      expect(mockStarshipRepo.connectMCPServer).toHaveBeenCalledWith(starshipId, mcpServerId);
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().post(`/starships/ /connectors/${mcpServerId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID is required' });
    });

    it('should return 400 for empty MCP server ID', async () => {
      const res = await api().post(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'MCP Server ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when MCP server not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'MCP server not found' });
    });

    it('should return 409 when MCP server already connected', async () => {
      const connectedServers = [mockMCPServer];
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.getConnectedMCPServers.mockResolvedValueOnce(connectedServers);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(409);
      expect(res.body).toEqual({ error: 'MCP server is already connected to this starship' });
    });

    it('should handle connection failure', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.getConnectedMCPServers.mockResolvedValueOnce([]);
      mockStarshipRepo.connectMCPServer.mockResolvedValueOnce(false);

      const res = await api()
        .post(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(500);
      expect(res.body).toEqual({ error: 'Failed to connect MCP server' });
    });
  });

  describe('DELETE /starships/:id/connectors/:mcpServerId', () => {
    const starshipId = 'starship-123';
    const mcpServerId = 'github';
    const mockStarship = {
      id: starshipId,
      ownerId: 'test-user-1',
      name: 'Test Starship',
      class: 'scout' as const,
      slug: 'test-starship',
      powerLevel: 85,
      activeExpeditions: 0,
      sibilInsights: 0,
      maxAgents: 3,
      status: 'active' as const,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };
    const mockMCPServer = {
      id: mcpServerId,
      name: 'Github',
      command: 'docker',
      args: ['run', '-i', '--rm'],
      env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
    };

    it('should successfully disconnect MCP server from starship', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.disconnectMCPServer.mockResolvedValueOnce(true);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'MCP server disconnected successfully',
        starshipId,
        mcpServerId,
      });
      expect(res.body.disconnectedAt).toBeDefined();
      expect(mockStarshipRepo.disconnectMCPServer).toHaveBeenCalledWith(starshipId, mcpServerId);
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().delete(`/starships/ /connectors/${mcpServerId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID is required' });
    });

    it('should return 400 for empty MCP server ID', async () => {
      const res = await api().delete(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'MCP Server ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when MCP server not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'MCP server not found' });
    });

    it('should return 404 when MCP server not connected to starship', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.disconnectMCPServer.mockResolvedValueOnce(false);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'MCP server is not connected to this starship' });
    });

    it('should handle disconnection errors', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockMCPServer);
      mockStarshipRepo.disconnectMCPServer.mockRejectedValueOnce(new Error('Database error'));

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${mcpServerId}`)
        .expect(500);
      expect(res.body).toEqual({ error: 'Failed to disconnect MCP server' });
    });
  });
});
