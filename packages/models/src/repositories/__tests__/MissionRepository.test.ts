/**
 * MissionRepository Unit Tests
 */

import { MissionRepository } from '../MissionRepository';
import { getConnection } from '../../helpers/database';
import { ValidationError, NotFoundError, DatabaseError } from '../../helpers/errors';
import type {
  MissionModel,
  CreateMissionRequest,
  UpdateMissionRequest,
  MissionFilters,
  MissionSort
} from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

describe('MissionRepository', () => {
  let repository: MissionRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new MissionRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository['serviceName']).toBe('MissionRepository');
    });
  });

  describe('Private Methods', () => {
    describe('validateMissionStatus', () => {
      it('should validate correct mission status', () => {
        const validStatuses = ['draft', 'active', 'completed', 'failed', 'cancelled'];
        
        validStatuses.forEach(status => {
          expect(() => repository['validateMissionStatus'](status)).not.toThrow();
        });
      });

      it('should throw validation error for invalid status', () => {
        expect(() => repository['validateMissionStatus']('invalid')).toThrow(ValidationError);
      });
    });

    describe('parseMissionFromRecord', () => {
      it('should parse mission record correctly', () => {
        const record = {
          id: 'mission-123',
          starshipId: 'starship-456',
          name: 'Test Mission',
          description: 'Test Description',
          status: 'active',
          phase: 'execution',
          agentIds: ['agent-1', 'agent-2'],
          approvalStatus: 'approved',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          createdBy: 'user-123'
        };

        const result = repository['parseMissionFromRecord'](record);

        expect(result).toEqual(record);
      });

      it('should handle missing optional fields', () => {
        const record = {
          id: 'mission-123',
          starshipId: 'starship-456',
          name: 'Test Mission',
          description: 'Test Description',
          status: 'active',
          phase: 'execution',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          createdBy: 'user-123'
        };

        const result = repository['parseMissionFromRecord'](record);

        expect(result.agentIds).toEqual([]);
        expect(result.approvalStatus).toBe('pending');
      });
    });
  });

  describe('createMission', () => {
    const validRequest: CreateMissionRequest = {
      starshipId: 'starship-123',
      name: 'Test Mission',
      description: 'Test Description',
      agentIds: ['agent-1', 'agent-2']
    };

    it('should create mission successfully', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ id: 'starship-123' }]); // Starship exists
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createMission(validRequest, 'user-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (s:Starship {id: $starshipId}) RETURN s.id as id',
        { starshipId: 'starship-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (m:MissionModel $props) RETURN m',
        expect.objectContaining({
          props: expect.objectContaining({
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            starshipId: 'starship-123',
            name: 'Test Mission',
            description: 'Test Description',
            status: 'draft',
            phase: 'welcome',
            agentIds: ['agent-1', 'agent-2'],
            createdBy: 'user-123',
          })
        })
      );
      expect(result.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('should validate required fields', async () => {
      const invalidRequest = { ...validRequest, starshipId: undefined } as any;

      await expect(repository.createMission(invalidRequest, 'user-123'))
        .rejects.toThrow(ValidationError);
    });

    it('should validate userId', async () => {
      await expect(repository.createMission(validRequest, ''))
        .rejects.toThrow(ValidationError);
    });

    it('should validate field types', async () => {
      const invalidRequest = { ...validRequest, name: 123 } as any;

      await expect(repository.createMission(invalidRequest, 'user-123'))
        .rejects.toThrow(ValidationError);
    });

    it('should validate string lengths', async () => {
      const invalidRequest = { ...validRequest, name: '' };

      await expect(repository.createMission(invalidRequest, 'user-123'))
        .rejects.toThrow(ValidationError);
    });

    it('should validate agentIds is array', async () => {
      const invalidRequest = { ...validRequest, agentIds: 'not-array' } as any;

      await expect(repository.createMission(invalidRequest, 'user-123'))
        .rejects.toThrow(ValidationError);
    });

    it('should require at least one agent', async () => {
      const invalidRequest = { ...validRequest, agentIds: [] };

      await expect(repository.createMission(invalidRequest, 'user-123'))
        .rejects.toThrow(ValidationError);
    });

    it('should check starship exists', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Starship doesn't exist

      await expect(repository.createMission(validRequest, 'user-123'))
        .rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.createMission(validRequest, 'user-123'))
        .rejects.toThrow(DatabaseError);
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
        createdBy: 'user-123'
      };
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]);

      const result = await repository.getMissionById('mission-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MissionModel {id: $id}) RETURN m',
        { id: 'mission-123' }
      );
      expect(result).toEqual(expect.objectContaining({
        id: 'mission-123',
        name: 'Test Mission'
      }));
    });

    it('should validate id parameter', async () => {
      await expect(repository.getMissionById('')).rejects.toThrow(ValidationError);
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
        createdBy: 'user-123'
      },
      {
        id: 'mission-2',
        starshipId: 'starship-123',
        name: 'Mission 2',
        status: 'completed',
        createdBy: 'user-456'
      }
    ];

    it('should return missions by starship id', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map(m => ({ m })));

      const result = await repository.getMissionModelsByStarshipId('starship-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.starshipId = $starshipId'),
        { starshipId: 'starship-123' }
      );
      expect(result.missions).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter by status', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map(m => ({ m })));

      const filters: MissionFilters = { status: ['active'] };
      const result = await repository.getMissionModelsByStarshipId('starship-123', filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.status IN $statusList'),
        expect.objectContaining({
          statusList: ['active']
        })
      );
      expect(result.missions).toHaveLength(1);
    });

    it('should filter by createdBy', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map(m => ({ m })));

      const filters: MissionFilters = { createdBy: 'user-123' };
      const result = await repository.getMissionModelsByStarshipId('starship-123', filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('m.createdBy = $createdBy'),
        expect.objectContaining({
          createdBy: 'user-123'
        })
      );
    });

    it('should apply custom sorting', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map(m => ({ m })));

      const sort: MissionSort = { field: 'name', direction: 'asc' };
      await repository.getMissionModelsByStarshipId('starship-123', undefined, sort);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.name ASC'),
        expect.any(Object)
      );
    });

    it('should validate starshipId', async () => {
      await expect(repository.getMissionModelsByStarshipId('')).rejects.toThrow(ValidationError);
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
      { id: 'mission-2', name: 'Mission 2', status: 'completed' }
    ];

    it('should return all missions without filters', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map(m => ({ m })));

      const result = await repository.getAllMissions();

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:MissionModel)'),
        {}
      );
      expect(result.missions).toHaveLength(2);
    });

    it('should apply filters', async () => {
      mockConnection.executeQuery.mockResolvedValue([mockMissions[0]].map(m => ({ m })));

      const filters: MissionFilters = {
        starshipId: 'starship-123',
        status: ['active'],
        createdBy: 'user-123'
      };

      await repository.getAllMissions(filters);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE m.starshipId = $starshipId AND m.status IN $statusList AND m.createdBy = $createdBy'),
        expect.objectContaining({
          starshipId: 'starship-123',
          statusList: ['active'],
          createdBy: 'user-123'
        })
      );
    });

    it('should apply sorting', async () => {
      mockConnection.executeQuery.mockResolvedValue(mockMissions.map(m => ({ m })));

      const sort: MissionSort = { field: 'updatedAt', direction: 'desc' };
      await repository.getAllMissions(undefined, sort);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY m.updatedAt DESC'),
        expect.any(Object)
      );
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
      status: 'active'
    };

    it('should update mission successfully', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]); // Mission exists
      mockConnection.executeWrite.mockResolvedValue([{ m: mockMission }]);

      const updates: UpdateMissionRequest = {
        name: 'Updated Mission',
        status: 'active'
      };

      const result = await repository.updateMission('mission-123', updates);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MissionModel {id: $id}) RETURN m',
        { id: 'mission-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET m.updatedAt = $updatedAt, m.name = $name, m.status = $status'),
        expect.objectContaining({
          id: 'mission-123',
          name: 'Updated Mission',
          status: 'active',
          updatedAt: expect.any(String)
        })
      );
      expect(result).toEqual(expect.objectContaining({
        name: 'Updated Mission'
      }));
    });

    it('should validate id parameter', async () => {
      await expect(repository.updateMission('', {})).rejects.toThrow(ValidationError);
    });

    it('should require at least one update field', async () => {
      await expect(repository.updateMission('mission-123', {})).rejects.toThrow(ValidationError);
    });

    it('should validate mission status', async () => {
      const updates = { status: 'invalid-status' } as any;

      await expect(repository.updateMission('mission-123', updates))
        .rejects.toThrow(ValidationError);
    });

    it('should validate string lengths', async () => {
      const updates = { name: '' };

      await expect(repository.updateMission('mission-123', updates))
        .rejects.toThrow(ValidationError);
    });

    it('should check mission exists', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Mission doesn't exist

      const updates = { name: 'Updated' };

      await expect(repository.updateMission('non-existent', updates))
        .rejects.toThrow(NotFoundError);
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
        approvalStatus: 'approved'
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
          approvalStatus: 'approved'
        })
      );
    });

    it('should validate agentIds array', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]);

      const updates = { agentIds: 'not-array' } as any;

      await expect(repository.updateMission('mission-123', updates))
        .rejects.toThrow(ValidationError);
    });

    it('should handle update failure', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ m: mockMission }]);
      mockConnection.executeWrite.mockResolvedValue([]); // Update failed

      const updates = { name: 'Updated' };

      await expect(repository.updateMission('mission-123', updates))
        .rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteMissionModel', () => {
    it('should delete mission successfully', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ m: { id: 'mission-123' } }]); // Mission exists
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.deleteMissionModel('mission-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MissionModel {id: $id}) RETURN m',
        { id: 'mission-123' }
      );
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (m:MissionModel {id: $id}) DELETE m',
        { id: 'mission-123' }
      );
    });

    it('should validate id parameter', async () => {
      await expect(repository.deleteMissionModel('')).rejects.toThrow(ValidationError);
    });

    it('should check mission exists before deletion', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Mission doesn't exist

      await expect(repository.deleteMissionModel('non-existent'))
        .rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

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