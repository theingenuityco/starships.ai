/// <reference types="jest" />
import { MCPServerConnectorRepository } from '../../src/repositories/MCPServerConnectorRepository';
import { getConnection } from '../../src/connection';
import { MCPServerConnector } from '../../src/types';

// Mock the connection module
jest.mock('../../src/connection');

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

describe('MCPServerConnectorRepository', () => {
  let repository: MCPServerConnectorRepository;
  let mockConnection: any;

  const mockConnector: MCPServerConnector = {
    id: 'connector-123',
    starshipId: 'starship-123',
    templateId: 'template-123',
    status: 'active',
    isActive: true,
    connectedAt: '2024-01-01T00:00:00.000Z',
    lastUsed: '2024-01-01T01:00:00.000Z',
    errorMessage: undefined,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new MCPServerConnectorRepository();

    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };

    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Mock Date.now() for consistent timestamps
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findAll()', () => {
    it('should return all connector instances', async () => {
      const mockResult = [{ c: mockConnector }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findAll();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) RETURN c ORDER BY c.createdAt DESC'
      );
      expect(result).toEqual([mockConnector]);
    });

    it('should return empty array when no connectors exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findAll()).rejects.toThrow(
        'Failed to retrieve connector instances: Database connection failed'
      );
    });
  });

  describe('findById()', () => {
    it('should return connector instance by ID', async () => {
      const mockResult = [{ c: mockConnector }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findById('connector-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id RETURN c',
        { id: 'connector-123' }
      );
      expect(result).toEqual(mockConnector);
    });

    it('should return null when connector not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.findById('')).rejects.toThrow('ID parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findById('connector-123')).rejects.toThrow(
        'Failed to retrieve connector instance: Query failed'
      );
    });
  });

  describe('create()', () => {
    const createData = {
      starshipId: 'starship-123',
      templateId: 'template-123',
      status: 'connecting' as const,
      isActive: true,
    };

    it('should create a new connector instance successfully', async () => {
      // Mock validation query
      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 1 }]);

      // Mock findByStarshipAndTemplate to return null (no existing connector)
      jest.spyOn(repository, 'findByStarshipAndTemplate').mockResolvedValue(null);

      // Mock creation query
      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.create(createData);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('OPTIONAL MATCH (s:Starship {id: $starshipId})'),
        { starshipId: 'starship-123', templateId: 'template-123' }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (c:MCPServerConnector $connectorProps)'),
        expect.objectContaining({
          starshipId: 'starship-123',
          templateId: 'template-123',
          connectorProps: expect.objectContaining({
            id: 'test-uuid-1',
            starshipId: 'starship-123',
            templateId: 'template-123',
          }),
        })
      );

      expect(result).toMatchObject({
        id: 'test-uuid-1',
        starshipId: 'starship-123',
        templateId: 'template-123',
        status: 'connecting',
        isActive: true,
      });
    });

    it('should throw error when starshipId is missing', async () => {
      await expect(repository.create({ templateId: 'template-123' })).rejects.toThrow(
        'starshipId is required'
      );
    });

    it('should throw error when templateId is missing', async () => {
      await expect(repository.create({ starshipId: 'starship-123' })).rejects.toThrow(
        'templateId is required'
      );
    });

    it('should throw error when starship does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 0, templateExists: 1 }]);

      await expect(repository.create(createData)).rejects.toThrow(
        'Starship with ID starship-123 not found'
      );
    });

    it('should throw error when template does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 0 }]);

      await expect(repository.create(createData)).rejects.toThrow(
        'MCP Server template with ID template-123 not found'
      );
    });

    it('should throw error when connector already exists for starship and template', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 1 }]);

      jest.spyOn(repository, 'findByStarshipAndTemplate').mockResolvedValue(mockConnector);

      await expect(repository.create(createData)).rejects.toThrow(
        'Connector instance already exists for starship starship-123 and template template-123'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Transaction failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.create(createData)).rejects.toThrow(
        'Failed to create connector instance: Transaction failed'
      );
    });

    it('should use default values for optional fields', async () => {
      const minimalData = {
        starshipId: 'starship-123',
        templateId: 'template-123',
      };

      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 1 }]);
      jest.spyOn(repository, 'findByStarshipAndTemplate').mockResolvedValue(null);
      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const result = await repository.create(minimalData);

      expect(result.status).toBe('connecting');
      expect(result.isActive).toBe(true);
    });
  });

  describe('update()', () => {
    const updateData = {
      status: 'active' as const,
      errorMessage: undefined,
    };

    it('should update connector instance successfully', async () => {
      const updatedConnector = { ...mockConnector, ...updateData };
      mockConnection.executeWrite.mockResolvedValue([{ c: updatedConnector }]);

      const result = await repository.update('connector-123', updateData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id SET c += $updates RETURN c',
        {
          id: 'connector-123',
          updates: expect.objectContaining({
            ...updateData,
            updatedAt: '2024-01-01T00:00:00.000Z',
          }),
        }
      );
      expect(result).toEqual(updatedConnector);
    });

    it('should return null when connector not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.update('non-existent', updateData);

      expect(result).toBeNull();
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.update('', updateData)).rejects.toThrow('ID parameter is required');
    });

    it('should prevent updating immutable fields', async () => {
      const invalidUpdateData = {
        id: 'new-id',
        createdAt: '2024-02-01T00:00:00.000Z',
        status: 'active' as const,
      };

      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      await repository.update('connector-123', invalidUpdateData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          updates: expect.not.objectContaining({
            id: 'new-id',
            createdAt: '2024-02-01T00:00:00.000Z',
          }),
        })
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Update failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.update('connector-123', updateData)).rejects.toThrow(
        'Failed to update connector instance: Update failed'
      );
    });
  });

  describe('delete()', () => {
    it('should delete connector instance successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('connector-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (c:MCPServerConnector) WHERE c.id = $id DETACH DELETE c RETURN count(c) as deletedCount',
        { id: 'connector-123' }
      );
      expect(result).toBe(true);
    });

    it('should return false when connector not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.delete('')).rejects.toThrow('ID parameter is required');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Delete failed');
      mockConnection.executeWrite.mockRejectedValue(mockError);

      await expect(repository.delete('connector-123')).rejects.toThrow(
        'Failed to delete connector instance: Delete failed'
      );
    });
  });

  describe('findByStarship()', () => {
    it('should return connector instances for starship', async () => {
      const mockResult = [{ c: mockConnector }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findByStarship('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)'
        ),
        { starshipId: 'starship-123' }
      );
      expect(result).toEqual([mockConnector]);
    });

    it('should return empty array when no connectors found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStarship('starship-123');

      expect(result).toEqual([]);
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.findByStarship('')).rejects.toThrow(
        'starshipId parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findByStarship('starship-123')).rejects.toThrow(
        'Failed to find connector instances by starship: Query failed'
      );
    });
  });

  describe('findByTemplate()', () => {
    it('should return connector instances for template', async () => {
      const mockResult = [{ c: mockConnector }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findByTemplate('template-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (c:MCPServerConnector)-[:CREATED_FROM]->(t:MCPServerOption {id: $templateId})'
        ),
        { templateId: 'template-123' }
      );
      expect(result).toEqual([mockConnector]);
    });

    it('should return empty array when no connectors found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByTemplate('template-123');

      expect(result).toEqual([]);
    });

    it('should throw error when templateId is empty', async () => {
      await expect(repository.findByTemplate('')).rejects.toThrow(
        'templateId parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(repository.findByTemplate('template-123')).rejects.toThrow(
        'Failed to find connector instances by template: Query failed'
      );
    });
  });

  describe('createFromTemplate()', () => {
    it('should create connector instance from template', async () => {
      const createSpy = jest.spyOn(repository, 'create').mockResolvedValue(mockConnector);

      const result = await repository.createFromTemplate('starship-123', 'template-123');

      expect(createSpy).toHaveBeenCalledWith({
        starshipId: 'starship-123',
        templateId: 'template-123',
        status: 'connecting',
        isActive: true,
      });
      expect(result).toEqual(mockConnector);
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.createFromTemplate('', 'template-123')).rejects.toThrow(
        'starshipId parameter is required'
      );
    });

    it('should throw error when templateId is empty', async () => {
      await expect(repository.createFromTemplate('starship-123', '')).rejects.toThrow(
        'templateId parameter is required'
      );
    });
  });

  describe('updateStatus()', () => {
    it('should update status successfully', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(mockConnector);

      const result = await repository.updateStatus('connector-123', 'active');

      expect(updateSpy).toHaveBeenCalledWith('connector-123', {
        status: 'active',
        errorMessage: undefined,
        lastUsed: '2024-01-01T00:00:00.000Z',
      });
      expect(result).toEqual(mockConnector);
    });

    it('should update status with error message', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(mockConnector);

      await repository.updateStatus('connector-123', 'error', 'Connection failed');

      expect(updateSpy).toHaveBeenCalledWith('connector-123', {
        status: 'error',
        errorMessage: 'Connection failed',
      });
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.updateStatus('', 'active')).rejects.toThrow(
        'ID parameter is required'
      );
    });

    it('should throw error when status is empty', async () => {
      await expect(repository.updateStatus('connector-123', '' as any)).rejects.toThrow(
        'status parameter is required'
      );
    });
  });

  describe('deactivate()', () => {
    it('should deactivate connector successfully', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(mockConnector);

      const result = await repository.deactivate('connector-123');

      expect(updateSpy).toHaveBeenCalledWith('connector-123', {
        isActive: false,
        status: 'inactive',
      });
      expect(result).toBe(true);
    });

    it('should return false when connector not found', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(null);

      const result = await repository.deactivate('non-existent');

      expect(result).toBe(false);
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.deactivate('')).rejects.toThrow('ID parameter is required');
    });
  });

  describe('activate()', () => {
    it('should activate connector successfully', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(mockConnector);

      const result = await repository.activate('connector-123');

      expect(updateSpy).toHaveBeenCalledWith('connector-123', {
        isActive: true,
        status: 'active',
        lastUsed: '2024-01-01T00:00:00.000Z',
      });
      expect(result).toBe(true);
    });

    it('should return false when connector not found', async () => {
      const updateSpy = jest.spyOn(repository, 'update').mockResolvedValue(null);

      const result = await repository.activate('non-existent');

      expect(result).toBe(false);
    });

    it('should throw error when ID is empty', async () => {
      await expect(repository.activate('')).rejects.toThrow('ID parameter is required');
    });
  });

  describe('findByStarshipAndTemplate()', () => {
    it('should return connector instance for starship and template', async () => {
      const mockResult = [{ c: mockConnector }];
      mockConnection.executeQuery.mockResolvedValue(mockResult);

      const result = await repository.findByStarshipAndTemplate('starship-123', 'template-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'MATCH (s:Starship {id: $starshipId})-[:HAS_CONNECTOR_INSTANCE]->(c:MCPServerConnector)-[:CREATED_FROM]->(t:MCPServerOption {id: $templateId})'
        ),
        { starshipId: 'starship-123', templateId: 'template-123' }
      );
      expect(result).toEqual(mockConnector);
    });

    it('should return null when no connector found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findByStarshipAndTemplate('starship-123', 'template-123');

      expect(result).toBeNull();
    });

    it('should throw error when starshipId is empty', async () => {
      await expect(repository.findByStarshipAndTemplate('', 'template-123')).rejects.toThrow(
        'starshipId parameter is required'
      );
    });

    it('should throw error when templateId is empty', async () => {
      await expect(repository.findByStarshipAndTemplate('starship-123', '')).rejects.toThrow(
        'templateId parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Query failed');
      mockConnection.executeQuery.mockRejectedValue(mockError);

      await expect(
        repository.findByStarshipAndTemplate('starship-123', 'template-123')
      ).rejects.toThrow('Failed to find connector instance by starship and template: Query failed');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete connector lifecycle', async () => {
      // Create
      mockConnection.executeQuery.mockResolvedValue([{ starshipExists: 1, templateExists: 1 }]);
      jest.spyOn(repository, 'findByStarshipAndTemplate').mockResolvedValue(null);
      mockConnection.executeWrite.mockResolvedValue([{ c: mockConnector }]);

      const created = await repository.create({
        starshipId: 'starship-123',
        templateId: 'template-123',
      });

      expect(created.status).toBe('connecting');

      // Update status to active
      const updatedConnector = { ...mockConnector, status: 'active' as const };
      mockConnection.executeWrite.mockResolvedValue([{ c: updatedConnector }]);

      const updated = await repository.update('connector-123', { status: 'active' });
      expect(updated?.status).toBe('active');

      // Deactivate
      const deactivatedConnector = {
        ...mockConnector,
        isActive: false,
        status: 'inactive' as const,
      };
      mockConnection.executeWrite.mockResolvedValue([{ c: deactivatedConnector }]);

      const deactivated = await repository.deactivate('connector-123');
      expect(deactivated).toBe(true);

      // Delete
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const deleted = await repository.delete('connector-123');
      expect(deleted).toBe(true);
    });

    it('should handle multiple connectors for same starship', async () => {
      const connectors = [
        { ...mockConnector, id: 'connector-1', templateId: 'template-1' },
        { ...mockConnector, id: 'connector-2', templateId: 'template-2' },
      ];

      mockConnection.executeQuery.mockResolvedValue(connectors.map((c) => ({ c })));

      const result = await repository.findByStarship('starship-123');

      expect(result).toHaveLength(2);
      expect(result[0].templateId).toBe('template-1');
      expect(result[1].templateId).toBe('template-2');
    });
  });
});
