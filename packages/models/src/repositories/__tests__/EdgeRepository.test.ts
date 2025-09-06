/**
 * EdgeRepository Unit Tests
 */

import { EdgeRepository } from '@/repositories/EdgeRepository';
import { DatabaseError, NotFoundError, ValidationError } from '@starships/errors';
import type { EdgeModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  })),
}));

import { getConnection } from '@/helpers/database';

describe('EdgeRepository', () => {
  let repository: EdgeRepository;
  let mockConnection: any;

  beforeEach(() => {
    // Create fresh mock connection for each test
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    repository = new EdgeRepository();
    // Clear all mocks to ensure clean state
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('EdgeRepository');
    });
  });

  describe('createEdge', () => {
    const validEdgeData: Omit<EdgeModel, 'id'> = {
      from: 'node-1',
      to: 'node-2',
      ref: 'test-edge',
    };

    it('should create edge successfully', async () => {
      const blueprintId = 'blueprint-123';
      const mockEdgeId = 'edge-456';
      // Mock blueprint exists
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }]) // Blueprint check
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }]) // Nodes check
        .mockResolvedValueOnce([{ edgeId: mockEdgeId, ref: 'test-edge' }]); // Edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdge(blueprintId, validEdgeData);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', { blueprintId });

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node {id: $fromId})'),
        { blueprintId, fromId: 'node-1', toId: 'node-2' }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:FLOWS_TO {id: randomUUID(), ref: $ref}]->(to)'),
        expect.objectContaining({
          blueprintId,
          fromId: 'node-1',
          toId: 'node-2',
          ref: 'test-edge',
        })
      );

      expect(result).toMatchObject({
        id: mockEdgeId,
        from: 'node-1',
        to: 'node-2',
        ref: 'test-edge',
      });
    });

    it('should use provided ref value', async () => {
      const edgeDataWithRef = {
        from: 'node-1',
        to: 'node-2',
        ref: 'custom-edge-ref',
      };

      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: 'blueprint-123' }])
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-456', ref: 'custom-edge-ref' }]); // Edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdge('blueprint-123', edgeDataWithRef);

      expect(result.ref).toEqual('custom-edge-ref');
    });

    it('should throw ValidationError for missing required parameters', async () => {
      await expect(repository.createEdge('', validEdgeData)).rejects.toThrow(ValidationError);

      await expect(repository.createEdge('blueprint-123', { from: '', to: 'node-2' } as any)).rejects.toThrow(ValidationError);

      await expect(repository.createEdge('blueprint-123', { from: 'node-1', to: '' } as any)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Blueprint not found

      await expect(repository.createEdge('non-existent', validEdgeData)).rejects.toThrow(NotFoundError);
    });

    it('should throw ValidationError when nodes do not exist', async () => {
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: 'blueprint-123' }]) // Blueprint exists
        .mockResolvedValueOnce([]); // Nodes don't exist

      await expect(repository.createEdge('blueprint-123', validEdgeData)).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(repository.createEdge('blueprint-123', validEdgeData)).rejects.toThrow(DatabaseError);
    });
  });

  describe('createEdges', () => {
    const validEdgesData: Array<Omit<EdgeModel, 'id'>> = [
      { from: 'start', to: 'process', ref: 'start-process' },
      { from: 'process', to: 'end', ref: 'process-end' },
    ];

    it('should create multiple edges successfully', async () => {
      const blueprintId = 'blueprint-123';
      const idMapping = new Map([
        ['start', 'node-1'],
        ['process', 'node-2'],
        ['end', 'node-3'],
      ]);

      // Mock blueprint exists, then node checks, then edge ID retrieval queries
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }]) // Blueprint check
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }]) // First edge nodes check
        .mockResolvedValueOnce([{ edgeId: 'edge-1', ref: 'start-process' }]) // First edge ID retrieval
        .mockResolvedValueOnce([{ fromId: 'node-2', toId: 'node-3' }]) // Second edge nodes check
        .mockResolvedValueOnce([{ edgeId: 'edge-2', ref: 'process-end' }]); // Second edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdges(blueprintId, validEdgesData, idMapping);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'edge-1',
        from: 'node-1', // Mapped from 'start'
        to: 'node-2', // Mapped from 'process'
        ref: 'start-process',
      });
      expect(result[1]).toMatchObject({
        id: 'edge-2',
        from: 'node-2', // Mapped from 'process'
        to: 'node-3', // Mapped from 'end'
        ref: 'process-end',
      });
    });

    it('should use original IDs when no mapping provided', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }])
        .mockResolvedValueOnce([{ fromId: 'start', toId: 'process' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-1', ref: 'start-process' }])
        .mockResolvedValueOnce([{ fromId: 'process', toId: 'end' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-2', ref: 'process-end' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdges(blueprintId, validEdgesData);

      expect(result[0].from).toBe('start');
      expect(result[0].to).toBe('process');
    });

    it('should skip edges when nodes do not exist', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }]) // Blueprint exists
        .mockResolvedValueOnce([]) // First edge nodes don't exist (skipped)
        .mockResolvedValueOnce([{ fromId: 'process', toId: 'end' }]) // Second edge nodes exist
        .mockResolvedValueOnce([{ edgeId: 'edge-2', ref: 'process-end' }]); // Second edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await repository.createEdges(blueprintId, validEdgesData);

      expect(result).toHaveLength(1); // Only one edge created
      expect(consoleSpy).toHaveBeenCalledWith('Skipping edge creation: nodes not found', {
        from: 'start',
        to: 'process',
      });

      consoleSpy.mockRestore();
    });

    it('should throw ValidationError for invalid edges array', async () => {
      await expect(repository.createEdges('blueprint-123', 'invalid' as any)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      await expect(repository.createEdges('non-existent', validEdgesData)).rejects.toThrow(NotFoundError);
    });

    it('should validate required blueprintId parameter', async () => {
      await expect(repository.createEdges('', validEdgesData)).rejects.toThrow(ValidationError);
    });

    it('should generate ref when not provided', async () => {
      const edgesWithoutRef = [{ from: 'node-1', to: 'node-2', ref: '' }];

      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: 'blueprint-123' }])
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-123', ref: null }]); // Edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdges('blueprint-123', edgesWithoutRef);

      expect(result[0].ref).toEqual('edge-123'); // Should use edge ID as ref
    });
  });

  describe('getEdgesByBlueprintId', () => {
    it('should return edges for blueprint', async () => {
      const blueprintId = 'blueprint-123';
      const mockEdges = [
        { edgeId: 'edge-1', fromId: 'node-1', toId: 'node-2', ref: 'edge-ref-1' },
        { edgeId: 'edge-2', fromId: 'node-2', toId: 'node-3', ref: 'edge-ref-2' },
      ];

      mockConnection.executeQuery.mockResolvedValue(mockEdges);

      const result = await repository.getEdgesByBlueprintId(blueprintId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node)'),
        { blueprintId }
      );

      expect(result).toEqual([
        { id: 'edge-1', from: 'node-1', to: 'node-2', ref: 'edge-ref-1' },
        { id: 'edge-2', from: 'node-2', to: 'node-3', ref: 'edge-ref-2' },
      ]);
    });

    it('should return empty array when no edges found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getEdgesByBlueprintId('blueprint-123');

      expect(result).toEqual([]);
    });

    it('should handle null result from database', async () => {
      mockConnection.executeQuery.mockResolvedValue(null);

      const result = await repository.getEdgesByBlueprintId('blueprint-123');

      expect(result).toEqual([]);
    });

    it('should use edge ID as ref when ref is null', async () => {
      const mockEdges = [{ edgeId: 'edge-1', fromId: 'node-1', toId: 'node-2', ref: null }];

      mockConnection.executeQuery.mockResolvedValue(mockEdges);

      const result = await repository.getEdgesByBlueprintId('blueprint-123');

      expect(result[0].ref).toBe('edge-1');
    });

    it('should validate required blueprintId parameter', async () => {
      await expect(repository.getEdgesByBlueprintId('')).rejects.toThrow(ValidationError);
    });
  });

  describe('getEdgeById', () => {
    it('should return edge by ID', async () => {
      const edgeId = 'edge-123';
      const mockEdge = {
        edgeId,
        fromId: 'node-1',
        toId: 'node-2',
        ref: 'test-ref',
      };

      mockConnection.executeQuery.mockResolvedValue([mockEdge]);

      const result = await repository.getEdgeById(edgeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (from:Node)-[r:FLOWS_TO {id: $edgeId}]->(to:Node)'),
        { edgeId }
      );

      expect(result).toEqual({
        id: edgeId,
        from: 'node-1',
        to: 'node-2',
        ref: 'test-ref',
      });
    });

    it('should return null when edge not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getEdgeById('non-existent');

      expect(result).toBeNull();
    });

    it('should use edge ID as ref when ref is null', async () => {
      const edgeId = 'edge-123';
      const mockEdge = {
        edgeId,
        fromId: 'node-1',
        toId: 'node-2',
        ref: null,
      };

      mockConnection.executeQuery.mockResolvedValue([mockEdge]);

      const result = await repository.getEdgeById(edgeId);

      expect(result?.ref).toBe(edgeId);
    });

    it('should validate required edgeId parameter', async () => {
      await expect(repository.getEdgeById('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.getEdgeById('edge-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateEdge', () => {
    const edgeId = 'edge-123';

    it('should update edge from/to nodes by recreating relationship', async () => {
      const updates: Partial<EdgeModel> = {
        from: 'new-node-1',
        to: 'new-node-2',
        ref: 'updated-ref',
      };

      const currentEdge: EdgeModel = {
        id: edgeId,
        from: 'old-node-1',
        to: 'old-node-2',
        ref: 'old-ref',
      };

      jest
        .spyOn(repository, 'getEdgeById')
        .mockResolvedValueOnce(currentEdge) // For update operation
        .mockResolvedValueOnce({ ...currentEdge, ...updates }); // For return value

      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.updateEdge(edgeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r', { edgeId });

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:FLOWS_TO {id: $edgeId, ref: $ref}]->(to)'),
        {
          fromId: 'new-node-1',
          toId: 'new-node-2',
          edgeId,
          ref: 'updated-ref',
        }
      );

      expect(result).toMatchObject(updates);
    });

    it('should update only ref when from/to are not changed', async () => {
      const updates: Partial<EdgeModel> = {
        ref: 'new-ref-only',
      };

      jest.spyOn(repository, 'getEdgeById').mockResolvedValue({
        id: edgeId,
        from: 'node-1',
        to: 'node-2',
        ref: 'new-ref-only',
      });

      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.updateEdge(edgeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() SET r.ref = $ref', {
        edgeId,
        ref: 'new-ref-only',
      });

      expect(result?.ref).toBe('new-ref-only');
    });

    it('should handle partial updates with from/to', async () => {
      const updates: Partial<EdgeModel> = {
        from: 'new-node-1',
        // to and ref not provided
      };

      const currentEdge: EdgeModel = {
        id: edgeId,
        from: 'old-node-1',
        to: 'existing-node-2',
        ref: 'existing-ref',
      };

      jest
        .spyOn(repository, 'getEdgeById')
        .mockResolvedValueOnce(currentEdge)
        .mockResolvedValueOnce({ ...currentEdge, from: 'new-node-1' });

      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateEdge(edgeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (from)-[:FLOWS_TO {id: $edgeId, ref: $ref}]->(to)'),
        {
          fromId: 'new-node-1',
          toId: 'existing-node-2', // Should use existing value
          edgeId,
          ref: 'existing-ref', // Should use existing value
        }
      );
    });

    it('should throw ValidationError for missing edgeId', async () => {
      await expect(repository.updateEdge('', { ref: 'new-ref' })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty updates', async () => {
      await expect(repository.updateEdge(edgeId, {})).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when edge does not exist', async () => {
      jest.spyOn(repository, 'getEdgeById').mockResolvedValue(null);

      await expect(repository.updateEdge(edgeId, { ref: 'new-ref' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteEdge', () => {
    it('should delete edge successfully', async () => {
      const edgeId = 'edge-123';

      mockConnection.executeQuery.mockResolvedValue([{ edgeId }]); // Edge exists
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deleteEdge(edgeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() RETURN r.id as edgeId', { edgeId });

      expect(mockConnection.executeWrite).toHaveBeenCalledWith('MATCH ()-[r:FLOWS_TO {id: $edgeId}]->() DELETE r', { edgeId });

      expect(result).toBe(true);
    });

    it('should throw NotFoundError when edge does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Edge not found

      await expect(repository.deleteEdge('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should validate required edgeId parameter', async () => {
      await expect(repository.deleteEdge('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteEdge('edge-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteEdgesByBlueprintId', () => {
    it('should delete all edges for blueprint', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]); // Blueprint exists
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.deleteEdgesByBlueprintId(blueprintId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id', { blueprintId });

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(from:Node)'),
        { blueprintId }
      );
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Blueprint not found

      await expect(repository.deleteEdgesByBlueprintId('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should validate required blueprintId parameter', async () => {
      await expect(repository.deleteEdgesByBlueprintId('')).rejects.toThrow(ValidationError);
    });
  });

  describe('getEdgesByFromNode', () => {
    it('should return edges originating from node', async () => {
      const fromNodeId = 'node-1';
      const mockEdges = [
        { edgeId: 'edge-1', fromId: fromNodeId, toId: 'node-2', ref: 'ref-1' },
        { edgeId: 'edge-2', fromId: fromNodeId, toId: 'node-3', ref: 'ref-2' },
      ];

      mockConnection.executeQuery.mockResolvedValue(mockEdges);

      const result = await repository.getEdgesByFromNode(fromNodeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (from:Node {id: $fromNodeId})-[r:FLOWS_TO]->(to:Node)'),
        { fromNodeId }
      );

      expect(result).toEqual([
        { id: 'edge-1', from: fromNodeId, to: 'node-2', ref: 'ref-1' },
        { id: 'edge-2', from: fromNodeId, to: 'node-3', ref: 'ref-2' },
      ]);
    });

    it('should return empty array when no edges found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getEdgesByFromNode('node-1');

      expect(result).toEqual([]);
    });

    it('should handle null result from database', async () => {
      mockConnection.executeQuery.mockResolvedValue(null);

      const result = await repository.getEdgesByFromNode('node-1');

      expect(result).toEqual([]);
    });

    it('should validate required fromNodeId parameter', async () => {
      await expect(repository.getEdgesByFromNode('')).rejects.toThrow(ValidationError);
    });
  });

  describe('getEdgesByToNode', () => {
    it('should return edges pointing to node', async () => {
      const toNodeId = 'node-2';
      const mockEdges = [
        { edgeId: 'edge-1', fromId: 'node-1', toId: toNodeId, ref: 'ref-1' },
        { edgeId: 'edge-2', fromId: 'node-3', toId: toNodeId, ref: 'ref-2' },
      ];

      mockConnection.executeQuery.mockResolvedValue(mockEdges);

      const result = await repository.getEdgesByToNode(toNodeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (from:Node)-[r:FLOWS_TO]->(to:Node {id: $toNodeId})'),
        { toNodeId }
      );

      expect(result).toEqual([
        { id: 'edge-1', from: 'node-1', to: toNodeId, ref: 'ref-1' },
        { id: 'edge-2', from: 'node-3', to: toNodeId, ref: 'ref-2' },
      ]);
    });

    it('should return empty array when no edges found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getEdgesByToNode('node-1');

      expect(result).toEqual([]);
    });

    it('should validate required toNodeId parameter', async () => {
      await expect(repository.getEdgesByToNode('')).rejects.toThrow(ValidationError);
    });
  });

  describe('error scenarios', () => {
    it('should handle constraint violations', async () => {
      const error = new Error('unique constraint violation');
      mockConnection.executeWrite.mockRejectedValue(error);

      await expect(
        repository.createEdge('blueprint-123', {
          from: 'node-1',
          to: 'node-2',
          ref: 'test-ref',
        })
      ).rejects.toThrow();
    });

    it('should handle connection timeouts', async () => {
      const error = new Error('connection timeout');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.getEdgesByBlueprintId('blueprint-123')).rejects.toThrow();
    });

    it('should handle query syntax errors', async () => {
      const error = new Error('syntax error in query');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.getEdgeById('edge-123')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const error = new Error('network error');
      mockConnection.executeWrite.mockRejectedValue(error);

      await expect(repository.deleteEdge('edge-123')).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete edge lifecycle', async () => {
      const blueprintId = 'blueprint-123';
      const edgeData: Omit<EdgeModel, 'id'> = {
        from: 'node-1',
        to: 'node-2',
        ref: 'test-edge',
      };

      // Mock create edge
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }])
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-123', ref: 'test-edge' }]); // Edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const createdEdge = await repository.createEdge(blueprintId, edgeData);

      // Mock update edge
      jest
        .spyOn(repository, 'getEdgeById')
        .mockResolvedValueOnce(createdEdge)
        .mockResolvedValueOnce({ ...createdEdge, ref: 'updated-ref' });

      await repository.updateEdge(createdEdge.id, { ref: 'updated-ref' });

      // Mock delete edge
      mockConnection.executeQuery.mockResolvedValue([{ edgeId: createdEdge.id }]);
      await repository.deleteEdge(createdEdge.id);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3); // create, update, delete
    });

    it('should handle bulk edge operations', async () => {
      const blueprintId = 'blueprint-123';
      const edgesData = [
        { from: 'start', to: 'middle', ref: 'start-middle' },
        { from: 'middle', to: 'end', ref: 'middle-end' },
      ];

      const idMapping = new Map([
        ['start', 'node-1'],
        ['middle', 'node-2'],
        ['end', 'node-3'],
      ]);

      // Mock create edges
      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: blueprintId }])
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-1', ref: 'start-middle' }]) // First edge ID retrieval
        .mockResolvedValueOnce([{ fromId: 'node-2', toId: 'node-3' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-2', ref: 'middle-end' }]); // Second edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const createdEdges = await repository.createEdges(blueprintId, edgesData, idMapping);

      // Mock delete all edges
      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]);
      await repository.deleteEdgesByBlueprintId(blueprintId);

      expect(createdEdges).toHaveLength(2);
      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3); // 2 creates + 1 bulk delete
    });
  });

  describe('edge cases', () => {
    it('should handle edges with missing ref falling back to ID', async () => {
      const mockEdges = [{ edgeId: 'edge-1', fromId: 'node-1', toId: 'node-2', ref: undefined }];

      mockConnection.executeQuery.mockResolvedValue(mockEdges);

      const result = await repository.getEdgesByBlueprintId('blueprint-123');

      expect(result[0].ref).toBe('edge-1');
    });

    it('should handle empty edges array in createEdges', async () => {
      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);

      const result = await repository.createEdges('blueprint-123', []);

      expect(result).toEqual([]);
    });

    it('should handle updates with null values', async () => {
      const updates = { ref: null as any };

      jest.spyOn(repository, 'getEdgeById').mockResolvedValue({
        id: 'edge-123',
        from: 'node-1',
        to: 'node-2',
        ref: null as any,
      });

      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.updateEdge('edge-123', updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(expect.stringContaining('SET r.ref = $ref'), {
        edgeId: 'edge-123',
        ref: null,
      });
    });

    it('should handle very long ref values', async () => {
      const longRef = 'a'.repeat(1000);
      const edgeData: Omit<EdgeModel, 'id'> = {
        from: 'node-1',
        to: 'node-2',
        ref: longRef,
      };

      mockConnection.executeQuery
        .mockResolvedValueOnce([{ id: 'blueprint-123' }])
        .mockResolvedValueOnce([{ fromId: 'node-1', toId: 'node-2' }])
        .mockResolvedValueOnce([{ edgeId: 'edge-123', ref: longRef }]); // Edge ID retrieval
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createEdge('blueprint-123', edgeData);

      expect(result.ref).toBe(longRef);
    });
  });
});
