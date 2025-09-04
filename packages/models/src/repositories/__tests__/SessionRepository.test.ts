/**
 * SessionRepository Unit Tests
 */

import { ConflictError, DatabaseError } from '@starships/errors';
import type { SessionModel } from '@starships/protocol';
import { Neo4jConnection, getConnection } from '../../helpers/database';
import { SessionRepository } from '../SessionRepository';

// Mock dependencies
jest.mock('../../helpers/database/connection');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-session-id'),
}));

describe('SessionRepository', () => {
  let repository: SessionRepository;
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

    repository = new SessionRepository();
    jest.clearAllMocks();
  });

  const createMockSession = (overrides: Partial<SessionModel> = {}): SessionModel => ({
    id: 'session-123',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    lastActivityAt: '2024-01-01T00:00:00.000Z',
    messageCount: 5,
    totalTokens: 1000,
    status: 'active',
    metadata: { theme: 'space' },
    ...overrides,
  });

  const createMockSessionRecord = (session: SessionModel) => ({
    id: session.id,
    created_at: session.createdAt,
    updated_at: session.updatedAt,
    last_activity_at: session.lastActivityAt,
    message_count: session.messageCount,
    total_tokens: session.totalTokens,
    status: session.status,
    metadata: session.metadata ? JSON.stringify(session.metadata) : null,
  });

  describe('constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository).toBeInstanceOf(SessionRepository);
    });
  });

  describe('findAll', () => {
    it('should return all sessions ordered by last activity', async () => {
      const mockSessions = [
        createMockSession({ id: 'session-1' }),
        createMockSession({ id: 'session-2' }),
      ];
      mockConnection.executeQuery.mockResolvedValue(
        mockSessions.map((s) => ({ s: createMockSessionRecord(s) }))
      );

      const result = await repository.findAll();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'session-1' });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY s.last_activity_at DESC')
      );
    });

    it('should return empty array when no sessions found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findAll();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });

  describe('findById', () => {
    it('should return session when found', async () => {
      const mockSession = createMockSession();
      mockConnection.executeQuery.mockResolvedValue([{ s: createMockSessionRecord(mockSession) }]);

      const result = await repository.findById('session-123');

      expect(result).toMatchObject({
        id: 'session-123',
        status: 'active',
      });
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.id = $id'),
        { id: 'session-123' }
      );
    });

    it('should return null when session not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findById('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    it('should create session successfully', async () => {
      const createInput = {
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'active' as const,
      };
      const mockCreated = {
        id: 'test-session-id',
        created_at: expect.any(String),
        last_activity_at: '2024-01-01T00:00:00.000Z',
        message_count: 0,
        total_tokens: 0,
        status: 'active',
        metadata: null,
      };

      // Mock createEntityWithAutoId call
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      const result = await repository.create(createInput);

      expect(result).toMatchObject({
        status: 'active',
        messageCount: 0,
      });
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (n:SessionModel)'),
        expect.objectContaining({
          props: expect.objectContaining({
            message_count: 0,
            total_tokens: 0,
            status: 'active',
          }),
        })
      );
    });

    it('should use default values for optional fields', async () => {
      const minimalInput = {
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'active' as const,
      };
      const mockCreated = {
        id: 'test-session-id',
        created_at: expect.any(String),
        last_activity_at: '2024-01-01T00:00:00.000Z',
        message_count: 0,
        total_tokens: 0,
        status: 'active',
        metadata: null,
      };

      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      await repository.create(minimalInput);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          props: expect.objectContaining({
            message_count: 0,
            total_tokens: 0,
            status: 'active',
          }),
        })
      );
    });

    it('should serialize metadata as JSON', async () => {
      const inputWithMetadata = {
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'active' as const,
        metadata: { theme: 'dark', language: 'en' },
      };
      const mockCreated = {
        id: 'test-session-id',
        created_at: expect.any(String),
        last_activity_at: '2024-01-01T00:00:00.000Z',
        message_count: 0,
        total_tokens: 0,
        status: 'active',
        metadata: JSON.stringify({ theme: 'dark', language: 'en' }),
      };

      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);

      await repository.create(inputWithMetadata);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          props: expect.objectContaining({
            metadata: JSON.stringify({ theme: 'dark', language: 'en' }),
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(
        repository.create({
          lastActivityAt: '2024-01-01T00:00:00.000Z',
          messageCount: 0,
          status: 'active' as const,
        })
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('should update session successfully', async () => {
      const updates = { status: 'completed' as const, messageCount: 10 };
      const mockUpdated = createMockSession(updates);

      mockConnection.executeWrite.mockResolvedValue([{ s: createMockSessionRecord(mockUpdated) }]);

      const result = await repository.update('session-123', updates);

      expect(result).toMatchObject(updates);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET'),
        expect.objectContaining({
          id: 'session-123',
          status: 'completed',
          messageCount: 10,
        })
      );
    });

    it('should return existing session when no updates provided', async () => {
      const mockSession = createMockSession();
      jest.spyOn(repository, 'findById').mockResolvedValue(mockSession);

      const result = await repository.update('session-123', {});

      expect(result).toEqual(mockSession);
      expect(repository.findById).toHaveBeenCalledWith('session-123');
    });

    it('should handle session not found on update', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await expect(repository.update('non-existent', { status: 'completed' })).rejects.toThrow();
    });

    it('should serialize metadata updates', async () => {
      const updates = { metadata: { newField: 'value' } };
      const mockUpdated = createMockSession(updates);

      mockConnection.executeWrite.mockResolvedValue([{ s: createMockSessionRecord(mockUpdated) }]);

      await repository.update('session-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: JSON.stringify({ newField: 'value' }),
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.update('session-123', { status: 'completed' })).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('should delete session successfully', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

      const result = await repository.delete('session-123');

      expect(result).toBe(true);
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('DETACH DELETE s'),
        { id: 'session-123' }
      );
    });

    it('should return false when session not found', async () => {
      mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

      const result = await repository.delete('non-existent');

      expect(result).toBe(false);
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.delete('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateActivity', () => {
    it('should update last activity timestamp', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateActivity('session-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET s.last_activity_at = $timestamp'),
        expect.objectContaining({
          id: 'session-123',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.updateActivity('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('incrementMessageCount', () => {
    it('should increment message count with default value', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.incrementMessageCount('session-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET s.message_count = s.message_count + $increment'),
        expect.objectContaining({
          id: 'session-123',
          increment: 1,
          timestamp: expect.any(String),
        })
      );
    });

    it('should increment message count with custom value', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.incrementMessageCount('session-123', 5);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          increment: 5,
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.incrementMessageCount('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateTokenCount', () => {
    it('should update token count', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateTokenCount('session-123', 500);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET s.total_tokens = s.total_tokens + $tokens'),
        expect.objectContaining({
          id: 'session-123',
          tokens: 500,
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle negative token counts', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateTokenCount('session-123', -100);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          tokens: -100,
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.updateTokenCount('session-123', 500)).rejects.toThrow(DatabaseError);
    });
  });

  describe('markAsCompleted', () => {
    it('should mark session as completed', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.markAsCompleted('session-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET s.status = $status'),
        expect.objectContaining({
          id: 'session-123',
          status: 'completed',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.markAsCompleted('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('archiveSession', () => {
    it('should archive session', async () => {
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.archiveSession('session-123');

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET s.status = $status'),
        expect.objectContaining({
          id: 'session-123',
          status: 'archived',
          timestamp: expect.any(String),
        })
      );
    });

    it('should handle database errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

      await expect(repository.archiveSession('session-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('mapToSession', () => {
    it('should map database record to session model correctly', () => {
      const repo = repository as any;
      const dbRecord = {
        id: 'session-123',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T01:00:00.000Z',
        last_activity_at: '2024-01-01T02:00:00.000Z',
        message_count: 10,
        total_tokens: 2000,
        status: 'active',
        metadata: JSON.stringify({ theme: 'space' }),
      };

      const result = repo.mapToSession(dbRecord);

      expect(result).toEqual({
        id: 'session-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T01:00:00.000Z',
        lastActivityAt: '2024-01-01T02:00:00.000Z',
        messageCount: 10,
        totalTokens: 2000,
        status: 'active',
        metadata: { theme: 'space' },
      });
    });

    it('should handle missing optional fields', () => {
      const repo = repository as any;
      const minimalRecord = {
        id: 'session-123',
        created_at: '2024-01-01T00:00:00.000Z',
      };

      const result = repo.mapToSession(minimalRecord);

      expect(result).toEqual({
        id: 'session-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z', // Should default to createdAt
        lastActivityAt: '2024-01-01T00:00:00.000Z', // Should default to createdAt
        messageCount: 0,
        totalTokens: 0,
        status: 'active',
        metadata: undefined,
      });
    });

    it('should handle null metadata', () => {
      const repo = repository as any;
      const recordWithNullMetadata = {
        id: 'session-123',
        created_at: '2024-01-01T00:00:00.000Z',
        metadata: null,
      };

      const result = repo.mapToSession(recordWithNullMetadata);

      expect(result.metadata).toBeUndefined();
    });

    it('should parse JSON metadata correctly', () => {
      const repo = repository as any;
      const recordWithMetadata = {
        id: 'session-123',
        created_at: '2024-01-01T00:00:00.000Z',
        metadata: JSON.stringify({ complex: { nested: 'value' } }),
      };

      const result = repo.mapToSession(recordWithMetadata);

      expect(result.metadata).toEqual({ complex: { nested: 'value' } });
    });

    it('should handle invalid JSON metadata gracefully', () => {
      const repo = repository as any;
      const recordWithInvalidJson = {
        id: 'session-123',
        created_at: '2024-01-01T00:00:00.000Z',
        metadata: 'invalid-json{',
      };

      // Should not throw, but return undefined metadata
      const result = repo.mapToSession(recordWithInvalidJson);
      expect(result.metadata).toBeUndefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete session lifecycle', async () => {
      const sessionId = 'test-session-id';
      const createInput = {
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        messageCount: 0,
        status: 'active' as const,
      };

      // Create
      const mockCreated = {
        id: 'test-session-id',
        created_at: expect.any(String),
        last_activity_at: '2024-01-01T00:00:00.000Z',
        message_count: 0,
        total_tokens: 0,
        status: 'active',
        metadata: null,
      };
      // Mock createEntityWithAutoId format
      mockConnection.executeWrite.mockResolvedValue([{ n: mockCreated }]);
      const created = await repository.create(createInput);
      expect(created.id).toBe('test-session-id');

      // Update activity
      mockConnection.executeWrite.mockResolvedValue([]);
      await repository.updateActivity(sessionId);

      // Increment messages
      await repository.incrementMessageCount(sessionId, 3);

      // Update tokens
      await repository.updateTokenCount(sessionId, 750);

      // Mark completed
      await repository.markAsCompleted(sessionId);

      // Archive
      await repository.archiveSession(sessionId);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(6);
    });

    it('should handle basic session operations', async () => {
      const mockSessions = [createMockSession()];
      const mockResults = mockSessions.map((s) => ({ s: createMockSessionRecord(s) }));
      mockConnection.executeQuery.mockResolvedValue(mockResults);

      // Test available find methods
      await repository.findAll();
      await repository.findById('session-123');

      expect(mockConnection.executeQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('error scenarios', () => {
    it('should handle constraint violations', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(
        repository.create({
          lastActivityAt: '2024-01-01T00:00:00.000Z',
          messageCount: 0,
          status: 'active' as const,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should handle connection timeouts', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection timeout'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle query syntax errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('syntax error in query'));

      await expect(repository.findById('session-123')).rejects.toThrow(DatabaseError);
    });
  });
});
