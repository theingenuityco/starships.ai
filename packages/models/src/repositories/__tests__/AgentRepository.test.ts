/**
 * AgentRepository Unit Tests
 */

import { getConnection } from '@/helpers/database';
import { AgentRepository } from '@/repositories/AgentRepository';
import { ConflictError, DatabaseError, NotFoundError } from '@starships/errors';

// Mock the database connection only
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
}));

// Mock nanoid for predictable ID generation
jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'test-nanoid-1234'),
}));

describe('AgentRepository', () => {
  let repository: AgentRepository;
  let mockConnection: {
    query: jest.Mock;
    queryOne: jest.Mock;
  };

  beforeEach(() => {
    // Create fresh mock connection for each test
    mockConnection = {
      query: jest.fn(),
      queryOne: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new AgentRepository();
    // Clear all mocks to ensure clean state
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository['serviceName']).toBe('AgentRepository');
    });
  });

  describe('database migration note', () => {
    it('should note that database has been migrated from Neo4j to PostgreSQL', () => {
      // Database has been migrated from Neo4j (Cypher) to PostgreSQL (SQL)
      // Tests now use query() and queryOne() methods instead of executeQuery() and executeWrite()
      expect(true).toBe(true);
    });
  });

  describe('CRUD Operations', () => {
    describe('findAll', () => {
      it('should return all agents', async () => {
        const mockAgents = [
          { id: 'agent-1', name: 'Agent 1', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
          { id: 'agent-2', name: 'Agent 2', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        ];
        mockConnection.query.mockResolvedValue(mockAgents);

        const result = await repository.findAll();

        expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM agents ORDER BY created_at DESC');
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
        expect(result[1]).toEqual(expect.objectContaining({ id: 'agent-2', name: 'Agent 2' }));
      });

      it('should handle empty result', async () => {
        mockConnection.query.mockResolvedValue([]);

        const result = await repository.findAll();

        expect(result).toEqual([]);
      });

      it('should handle database errors', async () => {
        mockConnection.query.mockRejectedValue(new Error('Database error'));

        await expect(repository.findAll()).rejects.toThrow(DatabaseError);
      });
    });

    describe('findById', () => {
      it('should return agent by id', async () => {
        const mockAgent = {
          id: 'agent-1',
          name: 'Agent 1',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };
        mockConnection.query.mockResolvedValue([mockAgent]);

        const result = await repository.findById('agent-1');

        expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = $1', ['agent-1']);
        expect(result).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
      });

      it('should return null when agent not found', async () => {
        mockConnection.query.mockResolvedValue([]);

        const result = await repository.findById('non-existent');

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.query.mockRejectedValue(new Error('Database error'));

        await expect(repository.findById('agent-1')).rejects.toThrow(DatabaseError);
      });
    });

    describe('create', () => {
      const mockAgentData = {
        name: 'Test Agent',
        description: 'Test Description',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        timeout: 30000,
        systemPrompt: 'Test agent',
        state: { messages: [], tools: [] },
        blueprint: { type: 'test', nodes: [], edges: [] },
      };

      it('should create agent successfully', async () => {
        const mockCreatedAgent = {
          id: 'test-nanoid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          timeout: 30000,
          system_prompt: 'Test agent',
          state: '{"messages":[],"tools":[]}',
          blueprint: '{"type":"test","nodes":[],"edges":[]}',
          starship_id: 'starship-123',
          deployed_at: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockConnection.query.mockResolvedValue([mockCreatedAgent]);

        const result = await repository.create(mockAgentData, 'starship-123');

        expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO agents'), expect.any(Array));
        expect(result.id).toBe('test-nanoid-1234');
        expect(result.name).toBe('Test Agent');
      });

      it('should validate required fields', async () => {
        const invalidData = { ...mockAgentData, name: '' }; // Empty name should fail validation

        await expect(repository.create(invalidData, 'starship-123')).rejects.toThrow(DatabaseError);
      });

      it('should handle database errors', async () => {
        mockConnection.query.mockRejectedValue(new Error('Database error'));

        await expect(repository.create(mockAgentData, 'starship-123')).rejects.toThrow(DatabaseError);
      });

      it('should create agent with starship foreign key', async () => {
        const mockCreatedAgent = {
          id: 'test-nanoid-1234',
          name: 'Test Agent',
          description: 'Test Description',
          model: 'gpt-4',
          temperature: 0.7,
          max_tokens: 1000,
          timeout: 30000,
          system_prompt: 'Test agent',
          state: '{"messages":[],"tools":[]}',
          blueprint: '{"type":"test","nodes":[],"edges":[]}',
          starship_id: 'starship-123',
          deployed_at: '2024-01-01T00:00:00.000Z',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        };

        mockConnection.query.mockResolvedValue([mockCreatedAgent]);

        await repository.create(mockAgentData, 'starship-123');

        expect(mockConnection.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO agents'),
          expect.arrayContaining([expect.anything()])
        );
      });
    });

    describe('update', () => {
      it('should update agent successfully', async () => {
        const mockAgent = { id: 'agent-1', name: 'Updated Agent', updated_at: '2024-01-01T00:00:00.000Z' };
        const updates = { name: 'Updated Agent' };
        mockConnection.query.mockResolvedValue([mockAgent]);

        const result = await repository.update('agent-1', updates);

        expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE agents'), expect.any(Array));
        expect(result).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Updated Agent' }));
      });

      it('should return null when agent not found', async () => {
        mockConnection.query.mockResolvedValue([]);

        const result = await repository.update('non-existent', { name: 'Updated' });

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.query.mockRejectedValue(new Error('Database error'));

        await expect(repository.update('agent-1', { name: 'Updated' })).rejects.toThrow(DatabaseError);
      });
    });

    describe('delete', () => {
      it('should delete agent successfully', async () => {
        mockConnection.query.mockResolvedValue({ rowCount: 1 });

        const result = await repository.delete('agent-1');

        expect(mockConnection.query).toHaveBeenCalledWith('DELETE FROM agents WHERE id = $1', ['agent-1']);
        expect(result).toBe(true);
      });

      it('should return false when agent not found', async () => {
        mockConnection.query.mockResolvedValue({ rowCount: 0 });

        const result = await repository.delete('non-existent');

        expect(result).toBe(false);
      });

      it('should handle database errors', async () => {
        mockConnection.query.mockRejectedValue(new Error('Database error'));

        await expect(repository.delete('agent-1')).rejects.toThrow(DatabaseError);
      });
    });
  });

  describe('Relationship Methods', () => {
    describe('findByStarship', () => {
      it('should return starship agents', async () => {
        const mockAgents = [
          {
            id: 'agent-1',
            name: 'Agent 1',
            starship_id: 'starship-123',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ];
        mockConnection.query.mockResolvedValue(mockAgents);

        const result = await repository.findByStarship('starship-123');

        expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM agents WHERE starship_id = $1 ORDER BY created_at DESC', [
          'starship-123',
        ]);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Agent 1' }));
      });
    });

    describe('updateStarship', () => {
      it('should update agent starshipId successfully', async () => {
        mockConnection.queryOne.mockResolvedValue({ count: '1' }); // Starship exists
        mockConnection.query.mockResolvedValue([{ id: 'agent-123', starship_id: 'starship-456', updated_at: '2024-01-01T00:00:00.000Z' }]); // Update agent

        const result = await repository.updateStarship('agent-123', 'starship-456');

        expect(mockConnection.queryOne).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM starships WHERE id = $1', ['starship-456']);
        expect(result).toMatchObject({ id: 'agent-123' });
      });

      it('should throw error when starship not found', async () => {
        mockConnection.queryOne.mockResolvedValue({ count: '0' }); // Starship doesn't exist

        await expect(repository.updateStarship('agent-123', 'non-existent')).rejects.toThrow(NotFoundError);
      });

      it('should throw error when agent not found', async () => {
        mockConnection.queryOne.mockResolvedValue({ count: '1' }); // Starship exists
        mockConnection.query.mockResolvedValue([]); // Update agent - empty result

        await expect(repository.updateStarship('non-existent', 'starship-456')).rejects.toThrow(NotFoundError);
      });
    });
  });

  describe('Query Methods', () => {
    describe('searchAgents', () => {
      it('should search agents with fulltext search', async () => {
        const mockAgents = [
          { id: 'agent-1', name: 'Matching Agent', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' },
        ];
        mockConnection.query.mockResolvedValue(mockAgents);

        const result = await repository.searchAgents('test query');

        expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('to_tsvector'), ['test query']);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(expect.objectContaining({ id: 'agent-1', name: 'Matching Agent' }));
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle constraint violation errors', async () => {
      // PostgreSQL constraint violation error with proper error code
      const constraintError = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505', // PostgreSQL unique_violation error code
      });
      mockConnection.query.mockRejectedValue(constraintError);

      await expect(repository.findAll()).rejects.toThrow(ConflictError);
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('connection failed');
      mockConnection.query.mockRejectedValue(connectionError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('operation timeout');
      mockConnection.query.mockRejectedValue(timeoutError);

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });
  });
});
