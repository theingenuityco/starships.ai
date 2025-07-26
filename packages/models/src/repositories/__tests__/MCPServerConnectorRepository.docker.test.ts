import { MCPServerConnectorRepository } from '../MCPServerConnectorRepository';
import { getConnection } from '../../connection';
import { MCPServerConnector, ValidationError } from '../../types';

// Mock the connection
jest.mock('../../connection');
const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};
(getConnection as jest.Mock).mockReturnValue(mockConnection);

describe('MCPServerConnectorRepository - Docker Methods', () => {
  let repository: MCPServerConnectorRepository;

  beforeEach(() => {
    repository = new MCPServerConnectorRepository();
    jest.clearAllMocks();
  });

  describe('updateDockerStatus', () => {
    const validConnectorId = '550e8400-e29b-41d4-a716-446655440000';

    it('should successfully update Docker status', async () => {
      const mockConnector: MCPServerConnector = {
        id: validConnectorId,
        starshipId: 'ship-123',
        templateId: 'template-456',
        status: 'active',
        isActive: true,
        connectedAt: '2025-01-25T10:00:00Z',
        dockerStatus: 'running',
        dockerContainerId: 'container-123',
        dockerServiceName: 'mcp-ship123-github',
        dockerNetworkName: 'starship-ship123',
        dockerImageName: 'starships/mcp-node:latest',
        createdAt: '2025-01-25T10:00:00Z',
        updatedAt: '2025-01-25T10:05:00Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.updateDockerStatus(validConnectorId, 'running', {
        containerId: 'container-123',
        serviceName: 'mcp-ship123-github',
        networkName: 'starship-ship123',
        imageName: 'starships/mcp-node:latest',
      });

      expect(result).toEqual(mockConnector);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: validConnectorId,
          updates: expect.objectContaining({
            dockerStatus: 'running',
            dockerContainerId: 'container-123',
            dockerServiceName: 'mcp-ship123-github',
            dockerNetworkName: 'starship-ship123',
            dockerImageName: 'starships/mcp-node:latest',
            status: 'active',
            isActive: true,
          }),
        }
      );
    });

    it('should update main status to error when Docker status is error', async () => {
      const mockConnector: MCPServerConnector = {
        id: validConnectorId,
        starshipId: 'ship-123',
        templateId: 'template-456',
        status: 'error',
        isActive: false,
        connectedAt: '2025-01-25T10:00:00Z',
        dockerStatus: 'error',
        dockerErrorMessage: 'Container failed to start',
        errorMessage: 'Container failed to start',
        createdAt: '2025-01-25T10:00:00Z',
        updatedAt: '2025-01-25T10:05:00Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.updateDockerStatus(validConnectorId, 'error', {
        errorMessage: 'Container failed to start',
      });

      expect(result).toEqual(mockConnector);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: validConnectorId,
          updates: expect.objectContaining({
            dockerStatus: 'error',
            dockerErrorMessage: 'Container failed to start',
            status: 'error',
            isActive: false,
            errorMessage: 'Container failed to start',
          }),
        }
      );
    });

    it('should reject invalid Docker status', async () => {
      await expect(
        repository.updateDockerStatus(validConnectorId, 'invalid' as any)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid UUID format', async () => {
      await expect(
        repository.updateDockerStatus('invalid-uuid', 'running')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject missing dockerStatus parameter', async () => {
      await expect(
        repository.updateDockerStatus(validConnectorId, undefined as any)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateDockerHealth', () => {
    const validConnectorId = '550e8400-e29b-41d4-a716-446655440000';

    it('should successfully update Docker health status', async () => {
      const mockConnector: MCPServerConnector = {
        id: validConnectorId,
        starshipId: 'ship-123',
        templateId: 'template-456',
        status: 'active',
        isActive: true,
        connectedAt: '2025-01-25T10:00:00Z',
        dockerHealthStatus: 'healthy',
        dockerLastHealthCheck: '2025-01-25T10:05:00Z',
        createdAt: '2025-01-25T10:00:00Z',
        updatedAt: '2025-01-25T10:05:00Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.updateDockerHealth(validConnectorId, 'healthy');

      expect(result).toEqual(mockConnector);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: validConnectorId,
          updates: expect.objectContaining({
            dockerHealthStatus: 'healthy',
            dockerLastHealthCheck: expect.any(String),
          }),
        }
      );
    });

    it('should update main status to error when health is unhealthy', async () => {
      const mockConnector: MCPServerConnector = {
        id: validConnectorId,
        starshipId: 'ship-123',
        templateId: 'template-456',
        status: 'error',
        isActive: false,
        connectedAt: '2025-01-25T10:00:00Z',
        dockerHealthStatus: 'unhealthy',
        dockerLastHealthCheck: '2025-01-25T10:05:00Z',
        errorMessage: 'Container health check failed',
        createdAt: '2025-01-25T10:00:00Z',
        updatedAt: '2025-01-25T10:05:00Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.updateDockerHealth(validConnectorId, 'unhealthy');

      expect(result).toEqual(mockConnector);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: validConnectorId,
          updates: expect.objectContaining({
            dockerHealthStatus: 'unhealthy',
            status: 'error',
            isActive: false,
            errorMessage: 'Container health check failed',
          }),
        }
      );
    });

    it('should reject invalid health status', async () => {
      await expect(
        repository.updateDockerHealth(validConnectorId, 'invalid' as any)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('findByDockerStatus', () => {
    it('should find connectors by Docker status', async () => {
      const mockConnectors: MCPServerConnector[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          starshipId: 'ship-123',
          templateId: 'template-456',
          status: 'active',
          isActive: true,
          connectedAt: '2025-01-25T10:00:00Z',
          dockerStatus: 'running',
          createdAt: '2025-01-25T10:00:00Z',
          updatedAt: '2025-01-25T10:00:00Z',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          starshipId: 'ship-456',
          templateId: 'template-789',
          status: 'active',
          isActive: true,
          connectedAt: '2025-01-25T10:01:00Z',
          dockerStatus: 'running',
          createdAt: '2025-01-25T10:01:00Z',
          updatedAt: '2025-01-25T10:01:00Z',
        },
      ];

      mockConnection.executeQuery.mockResolvedValue(
        mockConnectors.map(c => ({ c }))
      );

      const result = await repository.findByDockerStatus('running');

      expect(result).toEqual(mockConnectors);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.dockerStatus = $dockerStatus RETURN c ORDER BY c.createdAt DESC',
        { dockerStatus: 'running' }
      );
    });

    it('should return empty array when no connectors found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByDockerStatus('stopped');

      expect(result).toEqual([]);
    });

    it('should reject missing dockerStatus parameter', async () => {
      await expect(
        repository.findByDockerStatus(undefined as any)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('findByStarshipWithDockerInfo', () => {
    it('should find connectors with Docker info for starship', async () => {
      const mockConnectors: MCPServerConnector[] = [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          starshipId: 'ship-123',
          templateId: 'template-456',
          status: 'active',
          isActive: true,
          connectedAt: '2025-01-25T10:00:00Z',
          dockerStatus: 'running',
          dockerServiceName: 'mcp-ship123-github',
          createdAt: '2025-01-25T10:00:00Z',
          updatedAt: '2025-01-25T10:00:00Z',
        },
      ];

      mockConnection.executeQuery.mockResolvedValue(
        mockConnectors.map(c => ({ c }))
      );

      const result = await repository.findByStarshipWithDockerInfo('ship-123');

      expect(result).toEqual(mockConnectors);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        `MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)
         WHERE c.dockerServiceName IS NOT NULL OR c.dockerStatus IS NOT NULL
         RETURN c
         ORDER BY c.createdAt DESC`,
        { starshipId: 'ship-123' }
      );
    });

    it('should reject missing starshipId parameter', async () => {
      await expect(
        repository.findByStarshipWithDockerInfo('')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('updateDockerContainerId', () => {
    const validConnectorId = '550e8400-e29b-41d4-a716-446655440000';
    const containerId = 'container-abc123def456';

    it('should successfully update Docker container ID', async () => {
      const mockConnector: MCPServerConnector = {
        id: validConnectorId,
        starshipId: 'ship-123',
        templateId: 'template-456',
        status: 'active',
        isActive: true,
        connectedAt: '2025-01-25T10:00:00Z',
        dockerContainerId: containerId,
        createdAt: '2025-01-25T10:00:00Z',
        updatedAt: '2025-01-25T10:05:00Z',
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.updateDockerContainerId(validConnectorId, containerId);

      expect(result).toEqual(mockConnector);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: validConnectorId,
          updates: expect.objectContaining({
            dockerContainerId: containerId,
          }),
        }
      );
    });

    it('should reject invalid UUID format', async () => {
      await expect(
        repository.updateDockerContainerId('invalid-uuid', containerId)
      ).rejects.toThrow(ValidationError);
    });

    it('should reject missing containerId parameter', async () => {
      await expect(
        repository.updateDockerContainerId(validConnectorId, '')
      ).rejects.toThrow(ValidationError);
    });

    it('should reject non-string containerId parameter', async () => {
      await expect(
        repository.updateDockerContainerId(validConnectorId, 123 as any)
      ).rejects.toThrow(ValidationError);
    });
  });
});