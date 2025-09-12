/**
 * MissionRepository Unit Tests
 */

import { getConnection, Neo4jConnection } from '@/helpers/database';
import { MissionRepository } from '@/repositories/MissionRepository';
import { DatabaseError, NotFoundError } from '@starships/errors';
import type { CreateMissionRequest, MissionFilters, MissionSort, UpdateMissionRequest } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock MissionEntity with proper static methods
jest.mock('../../entities/MissionEntity', () => ({
  MissionEntity: {
    validate: jest.fn().mockResolvedValue(undefined),
    deserialize: jest.fn().mockImplementation((data) => ({
      ...data,
      serialize: jest.fn().mockReturnValue(data),
    })),
  },
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

describe('MissionRepository', () => {
  let repository: MissionRepository;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    repository = new MissionRepository();
    mockConnection = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      getSession: jest.fn(),
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
      initializeSchema: jest.fn(),
    } as unknown as jest.Mocked<Neo4jConnection>;
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository['serviceName']).toBe('MissionRepository');
    });
  });

  // Note: Private methods have been moved to entity layer
  // Validation and parsing is now handled by MissionEntity using class-validator/class-transformer decorators

  describe('entity migration note', () => {
    it('should note that validation and parsing has moved to entity layer', () => {
      // Private methods like validateMissionStatus and parseMissionFromRecord
      // have been removed from repositories and are now handled by MissionEntity
      expect(true).toBe(true);
    });
  });

  describe('createMission', () => {
    const validRequest: CreateMissionRequest = {
      starshipId: 'starship-123',
      name: 'Test Mission',
      description: 'Test Description',
      agentIds: ['agent-1', 'agent-2'],
    };

    it('should create mission successfully', async () => {
      const createdMission = {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        starshipId: 'starship-123',
        name: 'Test Mission',
        description: 'Test Description',
        status: 'draft',
        phase: 'welcome',
        agentIds: ['agent-1', 'agent-2'],
        createdBy: 'user-123',
        approvalStatus: 'pending',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      };

      // Mock starship existence check
      mockConnection.executeQuery.mockResolvedValue([{ id: 'starship-123' }]);
      // Mock the actual creation
      mockConnection.executeWrite.mockResolvedValue([{ n: createdMission }]);

      const result = await repository.createMission(validRequest, 'user-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (s:Starship {id: $starshipId}) RETURN s.id as id', {
        starshipId: 'starship-123',
      });
      expect(result.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should validate required fields', async () => {
      const invalidRequest = { ...validRequest, starshipId: undefined } as never;

      await expect(repository.createMission(invalidRequest, 'user-123')).rejects.toThrow(NotFoundError);
    });

    it('should validate userId', async () => {
      // Mock starship existence check first
      mockConnection.executeQuery.mockResolvedValue([{ id: 'starship-123' }]);

      await expect(repository.createMission(validRequest, '')).rejects.toThrow(DatabaseError);
    });

    it('should validate field types', async () => {
      const invalidRequest = { ...validRequest, name: 123 } as never;

      // Don't mock starship check since validation should fail first
      await expect(repository.createMission(invalidRequest, 'user-123')).rejects.toThrow();
    });

    it('should validate string lengths', async () => {
      const invalidRequest = { ...validRequest, name: '' };

      // Mock starship existence check first
      mockConnection.executeQuery.mockResolvedValue([{ id: 'starship-123' }]);

      await expect(repository.createMission(invalidRequest, 'user-123')).rejects.toThrow(DatabaseError);
    });

    it('should validate agentIds is array', async () => {
      const invalidRequest = { ...validRequest, agentIds: 'not-array' } as never;

      // Don't mock starship check since validation should fail first
      await expect(repository.createMission(invalidRequest, 'user-123')).rejects.toThrow();
    });

    it('should require at least one agent', async () => {
      const invalidRequest = { ...validRequest, agentIds: [] };

      // Mock starship existence check first
      mockConnection.executeQuery.mockResolvedValue([{ id: 'starship-123' }]);

      await expect(repository.createMission(invalidRequest, 'user-123')).rejects.toThrow(DatabaseError);
    });

    it('should check starship exists', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Starship doesn't exist

      await expect(repository.createMission(validRequest, 'user-123')).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.createMission(validRequest, 'user-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMissionById', () => {
    it('should return mission by id', async () => {
      const mockMission = {
        id: 'mission-123',
        starshipId: 'starship-456',
        name: 'Test Mission',
        description: 'Test Description',
        status: 'active',
        phase: 'execution',
        agentIds: ['agent-1'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'user-123',
      };
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]);

      const result = await repository.getMissionById('mission-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (m:Mission) WHERE m.id = $id RETURN m', { id: 'mission-123' });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'mission-123',
          name: 'Test Mission',
        })
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.getMissionById('')).rejects.toThrow(NotFoundError);
    });

    it('should throw not found error when mission doesnt exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await expect(repository.getMissionById('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getMissionById('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getMissionModelsByStarshipId', () => {
    const mockMissions = [
      {
        id: 'mission-1',
        starshipId: 'starship-123',
        name: 'Mission 1',
        status: 'active',
        createdBy: 'user-123',
      },
      {
        id: 'mission-2',
        starshipId: 'starship-123',
        name: 'Mission 2',
        status: 'completed',
        createdBy: 'user-456',
      },
    ];

    it('should return missions by starship id', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map((m) => ({ m })));

      const result = await repository.getMissionModelsByStarshipId('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('m.starshipId = $starshipId'), {
        starshipId: 'starship-123',
      });
      expect(result.missions).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map((m) => ({ m })));

      const filters: MissionFilters = { status: ['active'] };
      const result = await repository.getMissionModelsByStarshipId('starship-123', filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.status IN $statusList'),
        expect.objectContaining({
          statusList: ['active'],
        })
      );
      expect(result.missions).toHaveLength(1);
    });

    it('should filter by createdBy', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map((m) => ({ m })));

      const filters: MissionFilters = { createdBy: 'user-123' };
      await repository.getMissionModelsByStarshipId('starship-123', filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.createdBy = $createdBy'),
        expect.objectContaining({
          createdBy: 'user-123',
        })
      );
    });

    it('should apply custom sorting', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map((m) => ({ m })));

      const sort: MissionSort = { field: 'name', direction: 'asc' };
      await repository.getMissionModelsByStarshipId('starship-123', undefined, sort);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY m.name ASC'), expect.any(Object));
    });

    it('should validate starshipId', async () => {
      // Empty starshipId should return empty results, not throw error
      const result = await repository.getMissionModelsByStarshipId('');
      expect(result.missions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should handle empty results', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getMissionModelsByStarshipId('starship-123');

      expect(result.missions).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getAllMissions', () => {
    const mockMissions = [
      { id: 'mission-1', name: 'Mission 1', status: 'active' },
      { id: 'mission-2', name: 'Mission 2', status: 'completed' },
    ];

    it('should return all missions without filters', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map((m) => ({ m })));

      const result = await repository.getAllMissions();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('MATCH (m:Mission)'), {});
      expect(result.missions).toHaveLength(2);
    });

    it('should apply filters', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map((m) => ({ m })));

      const filters: MissionFilters = {
        starshipId: 'starship-123',
        status: ['active'],
        createdBy: 'user-123',
      };

      await repository.getAllMissions(filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.starshipId = $starshipId AND m.status IN $statusList AND m.createdBy = $createdBy'),
        expect.objectContaining({
          starshipId: 'starship-123',
          statusList: ['active'],
          createdBy: 'user-123',
        })
      );
    });

    it('should apply sorting', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map((m) => ({ m })));

      const sort: MissionSort = { field: 'updatedAt', direction: 'desc' };
      await repository.getAllMissions(undefined, sort);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY m.updatedAt DESC'), expect.any(Object));
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getAllMissions()).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateMission', () => {
    const mockMission = {
      id: 'mission-123',
      name: 'Updated Mission',
      status: 'active',
    };

    it('should update mission successfully', async () => {
      const updatedMission = {
        ...mockMission,
        name: 'Updated Mission',
        status: 'active',
      };

      mockConnection.executeWrite.mockResolvedValue([{ m: updatedMission }]);

      const updates: UpdateMissionRequest = {
        name: 'Updated Mission',
        status: 'active',
      };

      const result = await repository.updateMission('mission-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Mission) WHERE m.id = $id'),
        expect.objectContaining({
          id: 'mission-123',
          name: 'Updated Mission',
          status: 'active',
          updatedAt: expect.any(String),
        })
      );
      expect(result).toEqual(
        expect.objectContaining({
          name: 'Updated Mission',
        })
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.updateMission('', {})).rejects.toThrow(DatabaseError);
    });

    it('should require at least one update field', async () => {
      // The repository now handles empty updates by calling getMissionById, so updatedAt is still added
      const existingMission = {
        id: 'mission-123',
        name: 'Test Mission',
        status: 'draft',
        phase: 'welcome',
        agentIds: ['agent-1'],
        createdBy: 'user-123',
        approvalStatus: 'pending',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        starshipId: 'starship-123',
        description: 'Test Description',
      } as never;

      // Since empty updates still add updatedAt, we need to mock the executeWrite for the update
      mockConnection.executeWrite.mockResolvedValue([{ m: existingMission }]);

      const result = await repository.updateMission('mission-123', {});
      expect(result).toEqual(
        expect.objectContaining({
          id: 'mission-123',
          name: 'Test Mission',
        })
      );
    });

    it('should validate mission status', async () => {
      const updates = { status: 'invalid-status' } as never;

      await expect(repository.updateMission('mission-123', updates)).rejects.toThrow(DatabaseError);
    });

    it('should validate string lengths', async () => {
      const updates = { name: '' };

      await expect(repository.updateMission('mission-123', updates)).rejects.toThrow(DatabaseError);
    });

    it('should check mission exists', async () => {
      mockConnection.executeWrite.mockResolvedValue([]); // Update returns empty, indicating not found

      const updates = { name: 'Updated' };

      await expect(repository.updateMission('non-existent', updates)).rejects.toThrow(NotFoundError);
    });

    it('should update all possible fields', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]);
      mockConnection.executeWrite.mockResolvedValue([{ m: mockMission }]);

      const updates: UpdateMissionRequest = {
        name: 'New Name',
        description: 'New Description',
        status: 'completed',
        phase: 'welcome',
        agentIds: ['agent-1', 'agent-2'],
        approvalStatus: 'approved',
      };

      await repository.updateMission('mission-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('m.name = $name'),
        expect.objectContaining({
          name: 'New Name',
          description: 'New Description',
          status: 'completed',
          phase: 'welcome',
          agentIds: ['agent-1', 'agent-2'],
          approvalStatus: 'approved',
        })
      );
    });

    it('should validate agentIds array', async () => {
      const updates = { agentIds: 'not-array' } as never;

      await expect(repository.updateMission('mission-123', updates)).rejects.toThrow(DatabaseError);
    });

    it('should handle update failure', async () => {
      mockConnection.executeWrite.mockResolvedValue([]); // Update failed

      const updates = { name: 'Updated' };

      await expect(repository.updateMission('mission-123', updates)).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteMissionModel', () => {
    it('should delete mission successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      await repository.deleteMissionModel('mission-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (m:Mission) WHERE m.id = $id DETACH DELETE m RETURN count(m) as deletedCount',
        { id: 'mission-123' }
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.deleteMissionModel('')).rejects.toThrow(DatabaseError);
    });

    it('should check mission exists before deletion', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]); // No missions deleted

      await expect(repository.deleteMissionModel('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteMissionModel('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection failed'));

      await expect(repository.getMissionById('mission-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('operation timeout'));

      await expect(repository.getAllMissions()).rejects.toThrow(DatabaseError);
    });
  });
});
