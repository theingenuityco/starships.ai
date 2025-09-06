/**
 * MissionClarityRepository Unit Tests
 */

import { Neo4jConnection, getConnection } from '@/helpers/database';
import { MissionClarityRepository } from '@/repositories/MissionClarityRepository';
import { ConflictError, DatabaseError, NotFoundError } from '@starships/errors';
import type { CreateMissionClarityRequest, MissionClarityModel, UpdateMissionClarityRequest } from '@starships/protocol';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-clarity-id'),
}));

describe('MissionClarityRepository', () => {
  let repository: MissionClarityRepository;
  let mockGetConnection: jest.MockedFunction<any>;
  let mockConnection: jest.Mocked<Neo4jConnection>;

  beforeEach(() => {
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    } as any;

    // Mock getConnection to return our mock connection
    mockGetConnection = getConnection as jest.MockedFunction<typeof getConnection>;
    mockGetConnection.mockReturnValue(mockConnection);

    repository = new MissionClarityRepository();
    jest.clearAllMocks();
  });

  const createMockClarityRequest = (overrides: Partial<CreateMissionClarityRequest> = {}): CreateMissionClarityRequest => ({
    missionId: 'mission-123',
    objectiveClarity: 8,
    successMetrics: 7,
    timelineDefinition: 6,
    scopeBoundaries: 9,
    reasoning: 'Mission objectives are well-defined with clear success criteria.',
    iteration: 1,
    ...overrides,
  });

  const createMockClarity = (overrides: Partial<MissionClarityModel> = {}): MissionClarityModel => ({
    id: 'clarity-123',
    missionId: 'mission-123',
    objectiveClarity: 8,
    successMetrics: 7,
    timelineDefinition: 6,
    scopeBoundaries: 9,
    overallScore: 7.5,
    reasoning: 'Mission objectives are well-defined with clear success criteria.',
    iteration: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(MissionClarityRepository);
    });
  });

  describe('upsertByMissionId', () => {
    it('should create new mission clarity successfully', async () => {
      const request = createMockClarityRequest();
      const mockCreated = createMockClarity();
      // Mock mission existence check
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreated }]);
      // Mock relationship creation
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      const result = await repository.upsertByMissionId('mission-123', request);

      expect(result).toMatchObject({
        missionId: 'mission-123',
        objectiveClarity: 8,
        overallScore: 7.5,
      });
    });

    it('should calculate overall score correctly', async () => {
      const request = createMockClarityRequest({
        objectiveClarity: 10,
        successMetrics: 8,
        timelineDefinition: 6,
        scopeBoundaries: 4,
      });
      const mockCreated = createMockClarity({ overallScore: 7 });
      // Mock mission existence check
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreated }]);
      // Mock relationship creation
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      await repository.upsertByMissionId('mission-123', request);

      // Check that createEntityWithAutoId was called with the correct overallScore
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (n:MissionClarityModel)'),
        expect.objectContaining({
          props: expect.objectContaining({
            overallScore: 7, // (10 + 8 + 6 + 4) / 4
          }),
        })
      );
    });

    it('should validate required fields', async () => {
      const invalidRequest = { missionId: 'mission-123' }; // Missing required scores

      await expect(repository.upsertByMissionId('mission-123', invalidRequest as any)).rejects.toThrow(DatabaseError);
    });

    it('should validate score ranges', async () => {
      const invalidScores = [
        { objectiveClarity: -1 },
        { successMetrics: 11 },
        { timelineDefinition: 'invalid' },
        { scopeBoundaries: null },
      ];

      for (const invalidScore of invalidScores) {
        const request = createMockClarityRequest(invalidScore as any);
        await expect(repository.upsertByMissionId('mission-123', request)).rejects.toThrow(DatabaseError);
      }
    });

    it('should throw NotFoundError when mission does not exist', async () => {
      const request = createMockClarityRequest();
      // Mock mission check returning empty (mission not found)
      mockConnection.executeQuery.mockResolvedValueOnce([]);

      await expect(repository.upsertByMissionId('non-existent', request)).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      const request = createMockClarityRequest();
      // Mock mission exists first
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId failing
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.upsertByMissionId('mission-123', request)).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByMissionId', () => {
    it('should return mission clarity when found', async () => {
      const mockClarity = createMockClarity();
      mockConnection.executeQuery.mockResolvedValue([{ mc: mockClarity }]);

      const result = await repository.getByMissionId('mission-123');

      expect(result).toEqual(mockClarity);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (m:Mission {id: $missionId})-[:HAS_CLARITY]->(mc:MissionClarityModel)'),
        { missionId: 'mission-123' }
      );
    });

    it('should return null when clarity not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getByMissionId('mission-without-clarity');

      expect(result).toBeNull();
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.getByMissionId('')).rejects.toThrow(DatabaseError);
      await expect(repository.getByMissionId(null as any)).rejects.toThrow(DatabaseError);
      await expect(repository.getByMissionId(undefined as any)).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getByMissionId('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateByMissionId', () => {
    it('should update existing mission clarity', async () => {
      const updates: UpdateMissionClarityRequest = {
        objectiveClarity: 9,
        reasoning: 'Updated reasoning',
        iteration: 2,
      };
      const currentClarity = createMockClarity();
      const mockUpdated = createMockClarity({ ...updates, overallScore: 7.75 });

      // Mock getByMissionId for score recalculation
      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(currentClarity);
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      const result = await repository.updateByMissionId('mission-123', updates);

      expect(result).toMatchObject({
        objectiveClarity: 9,
        reasoning: 'Updated reasoning',
        iteration: 2,
      });
      expect(repository.getByMissionId).toHaveBeenCalledWith('mission-123');
    });

    it('should recalculate overall score when scores are updated', async () => {
      const updates = { objectiveClarity: 10 };
      const currentClarity = createMockClarity({
        successMetrics: 8,
        timelineDefinition: 6,
        scopeBoundaries: 4,
      });
      const mockUpdated = createMockClarity();

      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(currentClarity);
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      await repository.updateByMissionId('mission-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          overallScore: 7, // (10 + 8 + 6 + 4) / 4
        })
      );
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.updateByMissionId('', {})).rejects.toThrow(DatabaseError);
    });

    it('should validate score ranges in updates', async () => {
      const invalidUpdates = [{ objectiveClarity: -1 }, { successMetrics: 11 }, { timelineDefinition: 'invalid' }];

      for (const invalidUpdate of invalidUpdates) {
        await expect(repository.updateByMissionId('mission-123', invalidUpdate as any)).rejects.toThrow(DatabaseError);
      }
    });

    it('should throw NotFoundError when clarity does not exist for update', async () => {
      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(null);

      await expect(repository.updateByMissionId('mission-123', { objectiveClarity: 9 })).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError when update query returns no results', async () => {
      const currentClarity = createMockClarity();
      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(currentClarity);
      mockConnection.executeWrite.mockResolvedValue([]); // No results

      await expect(repository.updateByMissionId('mission-123', { reasoning: 'Updated' })).rejects.toThrow(NotFoundError);
    });

    it('should handle updates with only non-score fields', async () => {
      const updates = { reasoning: 'New reasoning', iteration: 3 };
      const mockUpdated = createMockClarity(updates);

      // Set up spy to track if method is called
      const getByMissionIdSpy = jest.spyOn(repository, 'getByMissionId');
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      const result = await repository.updateByMissionId('mission-123', updates);

      expect(result).toMatchObject(updates);
      // Should not call getByMissionId since no scores were updated
      expect(getByMissionIdSpy).not.toHaveBeenCalled();

      // Clean up spy
      getByMissionIdSpy.mockRestore();
    });
  });

  describe('deleteByMissionId', () => {
    it('should delete mission clarity successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.deleteByMissionId('mission-123');

      expect(result).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('DELETE mc'), { missionId: 'mission-123' });
    });

    it('should return false when clarity not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deleteByMissionId('non-existent');

      expect(result).toBe(false);
    });

    it('should return false when deletedCount is 0', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.deleteByMissionId('mission-123');

      expect(result).toBe(false);
    });

    it('should validate missionId parameter', async () => {
      await expect(repository.deleteByMissionId('')).rejects.toThrow(DatabaseError);
      await expect(repository.deleteByMissionId(null as any)).rejects.toThrow(DatabaseError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteByMissionId('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('getAll', () => {
    it('should return all mission clarities', async () => {
      const mockClarities = [createMockClarity({ id: 'clarity-1' }), createMockClarity({ id: 'clarity-2' })];
      mockConnection.executeQuery.mockResolvedValue(mockClarities.map((mc) => ({ mc })));

      const result = await repository.getAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'clarity-1' });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.stringContaining('ORDER BY mc.createdAt DESC'));
    });

    it('should return empty array when no clarities found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('getByScoreRange', () => {
    it('should return clarities within score range', async () => {
      const mockClarities = [createMockClarity({ overallScore: 8.5 }), createMockClarity({ overallScore: 7.0 })];
      mockConnection.executeQuery.mockResolvedValue(mockClarities.map((mc) => ({ mc })));

      const result = await repository.getByScoreRange(7, 9);

      expect(result).toHaveLength(2);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE mc.overallScore >= $minScore AND mc.overallScore <= $maxScore'),
        { minScore: 7, maxScore: 9 }
      );
    });

    it('should validate score range parameters', async () => {
      // Invalid ranges
      await expect(repository.getByScoreRange(-1, 5)).rejects.toThrow(DatabaseError);
      await expect(repository.getByScoreRange(5, 11)).rejects.toThrow(DatabaseError);
      await expect(repository.getByScoreRange(8, 5)).rejects.toThrow(DatabaseError); // min > max
    });

    it('should handle edge cases for score range', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      // Valid edge cases
      await repository.getByScoreRange(0, 10); // Full range
      await repository.getByScoreRange(5, 5); // Equal min/max

      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(2);
    });

    it('should return empty array when no clarities in range', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getByScoreRange(9, 10);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getByScoreRange(7, 9)).rejects.toThrow(DatabaseError);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete clarity lifecycle', async () => {
      const missionId = 'mission-123';
      const initialRequest = createMockClarityRequest();

      // Create - Mock mission existence check and creation
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      const mockCreated = createMockClarity();
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreated }]);
      mockConnection.executeWrite.mockResolvedValueOnce([]);
      const created = await repository.upsertByMissionId(missionId, initialRequest);
      expect(created.overallScore).toBe(7.5);

      // Get
      mockConnection.executeQuery.mockResolvedValue([{ mc: mockCreated }]);
      const retrieved = await repository.getByMissionId(missionId);
      expect(retrieved).toEqual(mockCreated);

      // Update
      const updates = { objectiveClarity: 10, iteration: 2 };
      const mockUpdated = createMockClarity({ ...updates, overallScore: 8 });
      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(mockCreated);
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);
      const updated = await repository.updateByMissionId(missionId, updates);
      expect(updated.objectiveClarity).toBe(10);

      // Delete
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);
      const deleted = await repository.deleteByMissionId(missionId);
      expect(deleted).toBe(true);
    });

    it('should handle upsert scenarios (create and update)', async () => {
      const request = createMockClarityRequest();
      const mockClarity = createMockClarity();

      // First call creates - mock mission check and creation
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockClarity }]);
      mockConnection.executeWrite.mockResolvedValueOnce([]);
      await repository.upsertByMissionId('mission-123', request);

      // Second call with same missionId should update - mock existing clarity found
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      mockConnection.executeQuery.mockResolvedValueOnce([{ mc: mockClarity }]);
      const updatedRequest = createMockClarityRequest({ objectiveClarity: 10 });
      const mockUpdated = createMockClarity({ objectiveClarity: 10, overallScore: 8 });
      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(mockClarity);
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      const result = await repository.upsertByMissionId('mission-123', updatedRequest);

      expect(result.objectiveClarity).toBe(10);
    });

    it('should handle analytics queries', async () => {
      const highScoreClarities = [createMockClarity({ overallScore: 9.5 })];
      const lowScoreClarities = [createMockClarity({ overallScore: 3.0 })];

      // High score range
      mockConnection.executeQuery.mockResolvedValue(highScoreClarities.map((mc) => ({ mc })));
      const highScores = await repository.getByScoreRange(9, 10);
      expect(highScores).toHaveLength(1);

      // Low score range
      mockConnection.executeQuery.mockResolvedValue(lowScoreClarities.map((mc) => ({ mc })));
      const lowScores = await repository.getByScoreRange(0, 4);
      expect(lowScores).toHaveLength(1);

      // All clarities
      mockConnection.executeQuery.mockResolvedValue([...highScoreClarities, ...lowScoreClarities].map((mc) => ({ mc })));
      const all = await repository.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      const request = createMockClarityRequest();
      // Mock mission exists first
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId failing with constraint violation
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(repository.upsertByMissionId('mission-123', request)).rejects.toThrow(ConflictError);
    });

    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.getByMissionId('mission-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.getAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle network errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('network error'));

      await expect(repository.deleteByMissionId('mission-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('edge cases', () => {
    it('should handle boundary score values', async () => {
      const boundaryRequest = createMockClarityRequest({
        objectiveClarity: 0,
        successMetrics: 10,
        timelineDefinition: 0,
        scopeBoundaries: 10,
      });
      const mockCreated = createMockClarity({ overallScore: 5 });
      // Mock mission existence check
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreated }]);
      // Mock relationship creation
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      const result = await repository.upsertByMissionId('mission-123', boundaryRequest);

      expect(result.overallScore).toBe(5); // (0 + 10 + 0 + 10) / 4
    });

    it('should handle very long reasoning text', async () => {
      const longReasoning = 'Very detailed reasoning: ' + 'x'.repeat(1000);
      const request = createMockClarityRequest({ reasoning: longReasoning });
      const mockCreated = createMockClarity({ reasoning: longReasoning });
      // Mock mission existence check
      mockConnection.executeQuery.mockResolvedValueOnce([{ id: 'mission-123' }]);
      // Mock getByMissionId returning null (no existing clarity)
      mockConnection.executeQuery.mockResolvedValueOnce([]);
      // Mock createEntityWithAutoId
      mockConnection.executeWrite.mockResolvedValueOnce([{ n: mockCreated }]);
      // Mock relationship creation
      mockConnection.executeWrite.mockResolvedValueOnce([]);

      const result = await repository.upsertByMissionId('mission-123', request);

      expect(result.reasoning).toBe(longReasoning);
    });

    it('should handle high iteration numbers', async () => {
      const updates = { iteration: 100 };
      const mockUpdated = createMockClarity(updates);

      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      const result = await repository.updateByMissionId('mission-123', updates);

      expect(result.iteration).toBe(100);
    });

    it('should handle partial score updates correctly', async () => {
      const currentClarity = createMockClarity({
        objectiveClarity: 5,
        successMetrics: 6,
        timelineDefinition: 7,
        scopeBoundaries: 8,
      });
      const updates = { objectiveClarity: 10 }; // Only update one score
      const mockUpdated = createMockClarity({ ...currentClarity, ...updates, overallScore: 7.75 });

      jest.spyOn(repository, 'getByMissionId').mockResolvedValue(currentClarity);
      mockConnection.executeWrite.mockResolvedValue([{ mc: mockUpdated }]);

      const result = await repository.updateByMissionId('mission-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          overallScore: 7.75, // (10 + 6 + 7 + 8) / 4
        })
      );
    });
  });
});
