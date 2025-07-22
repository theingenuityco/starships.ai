import { api } from '../testUtils';
import { initializeStarshipRoutes } from '../../src/routes/starships';
import type {
  StarshipRepository,
  AgentRepository,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
  ConnectorConfigTemplateRepository,
  ConnectorConfigHistoryRepository,
  VisionRepository,
} from '@starships/models/src/types';

// Mock repositories
const mockStarshipRepo: any = {
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
};

const mockAgentRepo: any = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
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

const mockMCPConnectorRepo: any = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByStarship: jest.fn(),
  findByTemplate: jest.fn(),
  createFromTemplate: jest.fn(),
  updateStatus: jest.fn(),
  deactivate: jest.fn(),
  activate: jest.fn(),
  findByStarshipAndTemplate: jest.fn(),
  updateConfig: jest.fn(),
  applyConfigTemplate: jest.fn(),
};

const mockConfigTemplateRepo: any = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByCategory: jest.fn(),
  findByTags: jest.fn(),
  findPublic: jest.fn(),
  findByAuthor: jest.fn(),
  search: jest.fn(),
  incrementUsageCount: jest.fn(),
};

const mockConfigHistoryRepo: any = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByConnector: jest.fn(),
  findByUser: jest.fn(),
  createEntry: jest.fn(),
};

const mockVisionRepo: any = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByStarship: jest.fn(),
  updateStatement: jest.fn(),
};

// Mock auth middleware to provide test user
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-1', email: 'test@example.com' };
    next();
  },
}));

describe('Starship Routes', () => {
  beforeEach(() => {
    // Initialize routes with mock repositories
    initializeStarshipRoutes({
      starshipRepository: mockStarshipRepo,
      agentRepository: mockAgentRepo,
      mcpServerOptionRepository: mockMCPServerRepo,
      mcpServerConnectorRepository: mockMCPConnectorRepo,
      connectorConfigTemplateRepository: mockConfigTemplateRepo,
      connectorConfigHistoryRepository: mockConfigHistoryRepo,
      visionRepository: mockVisionRepo,
    });

    // Reset all mocks
    jest.clearAllMocks();
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

    it('should return connected connectors for starship', async () => {
      const mockConnectorInstances = [
        {
          id: 'connector-123',
          starshipId: starshipId,
          templateId: 'github',
          status: 'active' as const,
          isActive: true,
          connectedAt: '2024-01-01T00:00:00Z',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockTemplate = {
        id: 'github',
        name: 'Github',
        command: 'docker',
        args: ['run', '-i', '--rm'],
        env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findByStarship.mockResolvedValueOnce(mockConnectorInstances);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockTemplate);

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(200);

      expect(res.body).toEqual({
        starshipId,
        connectedConnectors: [
          {
            id: 'connector-123',
            templateId: 'github',
            name: 'Github',
            command: 'docker',
            args: ['run', '-i', '--rm'],
            env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
            status: 'active',
            isActive: true,
            connectedAt: '2024-01-01T00:00:00Z',
            lastUsed: undefined,
            errorMessage: undefined,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      });
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().get('/starships/ /connectors').expect(400);
      expect(res.body).toEqual({ error: 'Starship ID or slug is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);
      mockStarshipRepo.findBySlug.mockResolvedValueOnce(null);

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
      mockMCPConnectorRepo.findByStarship.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get(`/starships/${starshipId}/connectors`).expect(500);
      expect(res.body).toEqual({ error: 'Failed to fetch starship connectors' });
    });
  });

  describe('POST /starships/:id/connectors/:templateId', () => {
    const starshipId = 'starship-123';
    const templateId = 'github';
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
    const mockTemplate = {
      id: templateId,
      name: 'Github',
      command: 'docker',
      args: ['run', '-i', '--rm'],
      env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
    };

    it('should successfully create connector instance from template', async () => {
      const mockConnectorInstance = {
        id: 'connector-123',
        starshipId: starshipId,
        templateId: templateId,
        status: 'connecting' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockTemplate);
      mockMCPConnectorRepo.findByStarshipAndTemplate.mockResolvedValueOnce(null);
      mockMCPConnectorRepo.createFromTemplate.mockResolvedValueOnce(mockConnectorInstance);

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(201);

      expect(res.body).toMatchObject({
        message: 'Connector instance created successfully',
        starshipId,
        connectorId: 'connector-123',
        templateId: templateId,
        status: 'connecting',
      });
      expect(res.body.connectedAt).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
      expect(mockMCPConnectorRepo.createFromTemplate).toHaveBeenCalledWith(starshipId, templateId);
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().post(`/starships/ /connectors/${templateId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID or slug is required' });
    });

    it('should return 400 for empty template ID', async () => {
      const res = await api().post(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'Template ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);
      mockStarshipRepo.findBySlug.mockResolvedValueOnce(null);

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when template not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(null);

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(404);
      expect(res.body).toEqual({ error: 'MCP server template not found' });
    });

    it('should return 200 when connector instance already exists', async () => {
      const existingConnector = {
        id: 'existing-connector-123',
        starshipId: starshipId,
        templateId: templateId,
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockTemplate);
      mockMCPConnectorRepo.findByStarshipAndTemplate.mockResolvedValueOnce(existingConnector);

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(200);
      expect(res.body).toMatchObject({
        message: 'Connector instance already exists for this starship',
        starshipId,
        connectorId: 'existing-connector-123',
        templateId: templateId,
        alreadyConnected: true,
      });
    });

    it('should handle connector creation failure', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockTemplate);
      mockMCPConnectorRepo.findByStarshipAndTemplate.mockResolvedValueOnce(null);
      mockMCPConnectorRepo.createFromTemplate.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().post(`/starships/${starshipId}/connectors/${templateId}`).expect(500);
      expect(res.body).toEqual({ error: 'Failed to create connector instance' });
    });
  });

  describe('PUT /starships/:id/connectors/:connectorId', () => {
    const starshipId = 'starship-123';
    const connectorId = 'connector-123';
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

    it('should successfully update connector instance', async () => {
      const mockConnectorInstance = {
        id: connectorId,
        starshipId: starshipId,
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const updatedConnector = {
        ...mockConnectorInstance,
        status: 'inactive' as const,
        isActive: false,
        updatedAt: '2024-01-01T01:00:00Z',
      };

      const updates = { status: 'inactive', isActive: false };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(mockConnectorInstance);
      mockMCPConnectorRepo.update.mockResolvedValueOnce(updatedConnector);

      const res = await api()
        .put(`/starships/${starshipId}/connectors/${connectorId}`)
        .send(updates)
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'Connector instance updated successfully',
        starshipId,
        connector: updatedConnector,
      });
      expect(mockMCPConnectorRepo.update).toHaveBeenCalledWith(connectorId, updates);
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().put(`/starships/ /connectors/${connectorId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID or slug is required' });
    });

    it('should return 400 for empty connector ID', async () => {
      const res = await api().put(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'Connector ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);
      mockStarshipRepo.findBySlug.mockResolvedValueOnce(null);

      const res = await api()
        .put(`/starships/${starshipId}/connectors/${connectorId}`)
        .send({ status: 'inactive' })
        .expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api()
        .put(`/starships/${starshipId}/connectors/${connectorId}`)
        .send({ status: 'inactive' })
        .expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when connector instance not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .put(`/starships/${starshipId}/connectors/${connectorId}`)
        .send({ status: 'inactive' })
        .expect(404);
      expect(res.body).toEqual({ error: 'Connector instance not found' });
    });

    it('should return 403 when connector does not belong to starship', async () => {
      const otherStarshipConnector = {
        id: connectorId,
        starshipId: 'other-starship',
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(otherStarshipConnector);

      const res = await api()
        .put(`/starships/${starshipId}/connectors/${connectorId}`)
        .send({ status: 'inactive' })
        .expect(403);
      expect(res.body).toEqual({ error: 'Connector instance does not belong to this starship' });
    });
  });

  describe('DELETE /starships/:id/connectors/:connectorId', () => {
    const starshipId = 'starship-123';
    const connectorId = 'connector-123';
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

    it('should successfully remove connector instance', async () => {
      const mockConnectorInstance = {
        id: connectorId,
        starshipId: starshipId,
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(mockConnectorInstance);
      mockMCPConnectorRepo.delete.mockResolvedValueOnce(true);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'Connector instance removed successfully',
        starshipId,
        connectorId: connectorId,
        templateId: 'github',
      });
      expect(res.body.removedAt).toBeDefined();
      expect(mockMCPConnectorRepo.delete).toHaveBeenCalledWith(connectorId);
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().delete(`/starships/ /connectors/${connectorId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID or slug is required' });
    });

    it('should return 400 for empty connector ID', async () => {
      const res = await api().delete(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'Connector ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);
      mockStarshipRepo.findBySlug.mockResolvedValueOnce(null);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when connector instance not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(null);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(404);
      expect(res.body).toEqual({ error: 'Connector instance not found' });
    });

    it('should return 403 when connector does not belong to starship', async () => {
      const otherStarshipConnector = {
        id: connectorId,
        starshipId: 'other-starship',
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(otherStarshipConnector);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(403);
      expect(res.body).toEqual({ error: 'Connector instance does not belong to this starship' });
    });

    it('should handle deletion errors', async () => {
      const mockConnectorInstance = {
        id: connectorId,
        starshipId: starshipId,
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(mockConnectorInstance);
      mockMCPConnectorRepo.delete.mockResolvedValueOnce(false);

      const res = await api()
        .delete(`/starships/${starshipId}/connectors/${connectorId}`)
        .expect(500);
      expect(res.body).toEqual({ error: 'Failed to remove connector instance' });
    });
  });

  describe('GET /starships/:id/connectors/:connectorId', () => {
    const starshipId = 'starship-123';
    const connectorId = 'connector-123';
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

    it('should return specific connector instance', async () => {
      const mockConnectorInstance = {
        id: connectorId,
        starshipId: starshipId,
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        lastUsed: '2024-01-01T00:30:00Z',
        errorMessage: undefined,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      const mockTemplate = {
        id: 'github',
        name: 'Github',
        command: 'docker',
        args: ['run', '-i', '--rm'],
        env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(mockConnectorInstance);
      mockMCPServerRepo.findById.mockResolvedValueOnce(mockTemplate);

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(200);

      expect(res.body).toEqual({
        starshipId,
        connector: {
          id: connectorId,
          templateId: 'github',
          name: 'Github',
          command: 'docker',
          args: ['run', '-i', '--rm'],
          env: '{"GITHUB_PERSONAL_ACCESS_TOKEN":"token"}',
          status: 'active',
          isActive: true,
          connectedAt: '2024-01-01T00:00:00Z',
          lastUsed: '2024-01-01T00:30:00Z',
          errorMessage: undefined,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });
    });

    it('should return 400 for empty starship ID', async () => {
      const res = await api().get(`/starships/ /connectors/${connectorId}`).expect(400);
      expect(res.body).toEqual({ error: 'Starship ID or slug is required' });
    });

    it('should return 400 for empty connector ID', async () => {
      const res = await api().get(`/starships/${starshipId}/connectors/ `).expect(400);
      expect(res.body).toEqual({ error: 'Connector ID is required' });
    });

    it('should return 404 when starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(null);
      mockStarshipRepo.findBySlug.mockResolvedValueOnce(null);

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(404);
      expect(res.body).toEqual({ error: 'Starship not found' });
    });

    it('should return 403 when user does not own starship', async () => {
      const otherUserStarship = { ...mockStarship, ownerId: 'other-user' };
      mockStarshipRepo.findById.mockResolvedValueOnce(otherUserStarship);

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(403);
      expect(res.body).toEqual({ error: 'Access denied' });
    });

    it('should return 404 when connector instance not found', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(null);

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(404);
      expect(res.body).toEqual({ error: 'Connector instance not found' });
    });

    it('should return 403 when connector does not belong to starship', async () => {
      const otherStarshipConnector = {
        id: connectorId,
        starshipId: 'other-starship',
        templateId: 'github',
        status: 'active' as const,
        isActive: true,
        connectedAt: '2024-01-01T00:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockResolvedValueOnce(otherStarshipConnector);

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(403);
      expect(res.body).toEqual({ error: 'Connector instance does not belong to this starship' });
    });

    it('should handle errors when fetching connector instance', async () => {
      mockStarshipRepo.findById.mockResolvedValueOnce(mockStarship);
      mockMCPConnectorRepo.findById.mockRejectedValueOnce(new Error('Database error'));

      const res = await api().get(`/starships/${starshipId}/connectors/${connectorId}`).expect(500);
      expect(res.body).toEqual({ error: 'Failed to fetch connector instance' });
    });
  });
});
