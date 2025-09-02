/**
 * NodeRepository Unit Tests
 */

import { NodeRepository } from '../NodeRepository';
import { ValidationError, NotFoundError, DatabaseError } from '../../helpers/errors';
import type { NodeModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(() => ({
    executeQuery: jest.fn(),
    executeWrite: jest.fn(),
  }))
}));

import { getConnection } from '../../helpers/database';

describe('NodeRepository', () => {
  let repository: NodeRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new NodeRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct service name', () => {
      expect((repository as any).serviceName).toBe('NodeRepository');
    });
  });

  describe('createNode', () => {
    const validNodeData = {
      type: 'agent' as const,
      name: 'Test Node',
      description: 'A test node',
      parameters: { config: 'test' },
      ref: 'test-node'
    };

    it('should create node successfully', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]); // Blueprint exists
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode(blueprintId, validNodeData);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id',
        { blueprintId }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (b)-[:CONTAINS]->(n:Node $nodeProps)'),
        {
          blueprintId,
          nodeProps: expect.objectContaining({
            id: expect.any(String),
            type: 'agent',
            name: 'Test Node',
            description: 'A test node',
            parameters: '{"config":"test"}', // Should be serialized
            ref: 'test-node'
          })
        }
      );

      expect(result).toMatchObject({
        id: expect.any(String),
        type: 'agent',
        name: 'Test Node',
        description: 'A test node',
        parameters: { config: 'test' },
        ref: 'test-node'
      });
    });

    it('should use provided ref value', async () => {
      const nodeDataWithRef = {
        type: 'start' as const,
        name: 'Start Node',
        description: 'Start node description',
        parameters: {},
        ref: 'custom-ref-123'
      };

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode('blueprint-123', nodeDataWithRef);

      expect(result.ref).toEqual('custom-ref-123');
    });

    it('should handle empty parameters object', async () => {
      const nodeData = {
        type: 'end' as const,
        name: 'End Node',
        description: 'End node description',
        parameters: {},
        ref: 'end-node'
      };

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode('blueprint-123', nodeData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeProps: expect.objectContaining({
            parameters: '{}' // Empty object should be serialized
          })
        })
      );
    });

    it('should handle undefined parameters', async () => {
      const nodeData = {
        type: 'agent' as const,
        name: 'Agent Node',
        description: 'Agent node description',
        ref: 'agent-node'
        // parameters is undefined
      } as any;

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode('blueprint-123', nodeData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeProps: expect.objectContaining({
            parameters: '{}' // Should default to empty object
          })
        })
      );
    });

    it('should throw ValidationError for missing required fields', async () => {
      await expect(repository.createNode('', validNodeData)).rejects.toThrow(ValidationError);
      
      await expect(repository.createNode('blueprint-123', { name: 'Test' } as any))
        .rejects.toThrow(ValidationError);
      
      await expect(repository.createNode('blueprint-123', { type: 'start' } as any))
        .rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Blueprint not found

      await expect(repository.createNode('non-existent', validNodeData)).rejects.toThrow(NotFoundError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(repository.createNode('blueprint-123', validNodeData)).rejects.toThrow(DatabaseError);
    });
  });

  describe('createNodes', () => {
    const validNodesData = [
      { type: 'start' as const, name: 'Start', description: 'Start node', parameters: {}, ref: 'start', aiId: 'start' },
      { type: 'agent' as const, name: 'Process', description: 'Process node', parameters: { config: 'test' }, ref: 'process', aiId: 'process' },
      { type: 'end' as const, name: 'End', description: 'End node', parameters: {}, ref: 'end' }
    ];

    it('should create multiple nodes and return ID mapping', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]); // Blueprint exists
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNodes(blueprintId, validNodesData);

      expect(result.nodes).toHaveLength(3);
      expect(result.idMapping.size).toBe(2); // Only nodes with aiId get mapped

      expect(result.idMapping.get('start')).toEqual(result.nodes[0].id);
      expect(result.idMapping.get('process')).toEqual(result.nodes[1].id);
      expect(result.idMapping.has('end')).toBe(false); // No aiId provided

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3); // One call per node
    });

    it('should create nodes without aiId mapping', async () => {
      const nodesWithoutAiId = [
        { type: 'start' as const, name: 'Start', description: 'Start node', parameters: {}, ref: 'start' },
        { type: 'end' as const, name: 'End', description: 'End node', parameters: {}, ref: 'end' }
      ];

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNodes('blueprint-123', nodesWithoutAiId);

      expect(result.nodes).toHaveLength(2);
      expect(result.idMapping.size).toBe(0); // No aiId mappings
    });

    it('should throw ValidationError for empty nodes array', async () => {
      await expect(repository.createNodes('blueprint-123', [])).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid nodes array', async () => {
      await expect(repository.createNodes('blueprint-123', 'invalid' as any)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing blueprintId', async () => {
      await expect(repository.createNodes('', validNodesData)).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Blueprint not found

      await expect(repository.createNodes('non-existent', validNodesData)).rejects.toThrow(NotFoundError);
    });

    it('should handle complex nested parameters', async () => {
      const complexNodesData = [
        {
          type: 'agent' as const,
          name: 'Complex Agent',
          description: 'Complex agent node',
          ref: 'complex-agent',
          parameters: {
            config: {
              model: 'gpt-4',
              temperature: 0.7,
              tools: ['search', 'calculator'],
              memory: { type: 'vector', size: 1000 }
            },
            metadata: {
              version: '1.0',
              tags: ['ai', 'agent']
            }
          }
        }
      ];

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNodes('blueprint-123', complexNodesData);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeProps: expect.objectContaining({
            parameters: expect.stringContaining('"model":"gpt-4"')
          })
        })
      );

      expect(result.nodes[0].parameters).toEqual(complexNodesData[0].parameters);
    });
  });

  describe('getNodesByBlueprintId', () => {
    it('should return nodes for blueprint', async () => {
      const blueprintId = 'blueprint-123';
      const mockNodes = [
        {
          id: 'node-1',
          type: 'start',
          name: 'Start',
          description: 'Start node',
          parameters: '{"init":true}',
          ref: 'start'
        },
        {
          id: 'node-2',
          type: 'end',
          name: 'End',
          description: 'End node',
          parameters: '{}',
          ref: 'end'
        }
      ];

      mockConnection.executeQuery.mockResolvedValue([
        { n: mockNodes[0] },
        { n: mockNodes[1] }
      ]);

      const result = await repository.getNodesByBlueprintId(blueprintId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)'),
        { blueprintId }
      );

      expect(result).toEqual([
        {
          id: 'node-1',
          type: 'start',
          name: 'Start',
          description: 'Start node',
          parameters: { init: true }, // Should be deserialized
          ref: 'start'
        },
        {
          id: 'node-2',
          type: 'end',
          name: 'End',
          description: 'End node',
          parameters: {}, // Should be deserialized
          ref: 'end'
        }
      ]);
    });

    it('should return empty array when no nodes found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getNodesByBlueprintId('blueprint-123');

      expect(result).toEqual([]);
    });

    it('should handle null result from database', async () => {
      mockConnection.executeQuery.mockResolvedValue(null);

      const result = await repository.getNodesByBlueprintId('blueprint-123');

      expect(result).toEqual([]);
    });

    it('should handle malformed parameters JSON gracefully', async () => {
      const mockNodes = [
        {
          id: 'node-1',
          type: 'start',
          name: 'Start',
          parameters: 'invalid-json',
          ref: 'start'
        }
      ];

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNodes[0] }]);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await repository.getNodesByBlueprintId('blueprint-123');

      expect(result[0].parameters).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse node parameters JSON:',
        'node-1',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should validate required blueprintId parameter', async () => {
      await expect(repository.getNodesByBlueprintId('')).rejects.toThrow(ValidationError);
    });
  });

  describe('getNodeById', () => {
    it('should return node by ID', async () => {
      const nodeId = 'node-123';
      const mockNode = {
        id: nodeId,
        type: 'agent',
        name: 'Agent Node',
        description: 'Agent node description',
        parameters: '{"config":"test"}',
        ref: 'agent'
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNode }]);

      const result = await repository.getNodeById(nodeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

      expect(result).toEqual({
        id: nodeId,
        type: 'agent',
        name: 'Agent Node',
        description: 'Agent node description',
        parameters: { config: 'test' }, // Should be deserialized
        ref: 'agent'
      });
    });

    it('should return null when node not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.getNodeById('non-existent');

      expect(result).toBeNull();
    });

    it('should handle malformed parameters JSON', async () => {
      const mockNode = {
        id: 'node-123',
        type: 'start',
        name: 'Start',
        parameters: 'invalid-json'
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNode }]);

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await repository.getNodeById('node-123');

      expect(result?.parameters).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse node parameters JSON:',
        'node-123',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle null parameters', async () => {
      const mockNode = {
        id: 'node-123',
        type: 'start',
        name: 'Start',
        parameters: null
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNode }]);

      const result = await repository.getNodeById('node-123');

      expect(result?.parameters).toEqual({});
    });

    it('should validate required nodeId parameter', async () => {
      await expect(repository.getNodeById('')).rejects.toThrow(ValidationError);
    });
  });

  describe('updateNode', () => {
    it('should update node successfully', async () => {
      const nodeId = 'node-123';
      const updates: Partial<NodeModel> = {
        name: 'Updated Node',
        description: 'Updated description',
        parameters: { newConfig: 'updated' },
        ref: 'updated-ref'
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]); // Node exists
      mockConnection.executeWrite.mockResolvedValue([{
        n: {
          id: nodeId,
          name: 'Updated Node',
          description: 'Updated description',
          parameters: '{"newConfig":"updated"}',
          ref: 'updated-ref'
        }
      }]);

      const result = await repository.updateNode(nodeId, updates);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET n.name = $name'),
        expect.objectContaining({
          nodeId,
          name: 'Updated Node',
          description: 'Updated description',
          parameters: '{"newConfig":"updated"}',
          ref: 'updated-ref'
        })
      );

      expect(result).toMatchObject({
        id: nodeId,
        name: 'Updated Node',
        parameters: { newConfig: 'updated' } // Should be deserialized
      });
    });

    it('should handle partial updates', async () => {
      const nodeId = 'node-123';
      const updates: Partial<NodeModel> = {
        name: 'Updated Name Only'
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]);
      mockConnection.executeWrite.mockResolvedValue([{
        n: { id: nodeId, name: 'Updated Name Only', parameters: '{}' }
      }]);

      const result = await repository.updateNode(nodeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET n.name = $name'),
        expect.objectContaining({
          nodeId,
          name: 'Updated Name Only'
        })
      );
    });

    it('should throw ValidationError when no updates provided', async () => {
      const nodeId = 'node-123';

      await expect(repository.updateNode(nodeId, {})).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing nodeId', async () => {
      await expect(repository.updateNode('', { name: 'Test' })).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty updates', async () => {
      const nodeId = 'node-123';
      await expect(repository.updateNode(nodeId, {})).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when node does not exist', async () => {
      const nodeId = 'node-123';
      mockConnection.executeQuery.mockResolvedValue([]); // Node not found

      await expect(repository.updateNode(nodeId, { name: 'Test' })).rejects.toThrow(NotFoundError);
    });

    it('should handle update failure', async () => {
      const nodeId = 'node-123';
      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]);
      mockConnection.executeWrite.mockResolvedValue([]); // Update failed

      await expect(repository.updateNode(nodeId, { name: 'Test' })).rejects.toThrow('Database operation failed');
    });

    it('should serialize complex parameters correctly', async () => {
      const nodeId = 'node-123';
      const complexUpdates: Partial<NodeModel> = {
        parameters: {
          config: {
            model: 'gpt-4',
            temperature: 0.7,
            tools: ['search', 'calculator']
          },
          metadata: {
            tags: ['ai', 'complex']
          }
        }
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]);
      mockConnection.executeWrite.mockResolvedValue([{
        n: {
          id: nodeId,
          parameters: JSON.stringify(complexUpdates.parameters)
        }
      }]);

      await repository.updateNode(nodeId, complexUpdates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          parameters: JSON.stringify(complexUpdates.parameters)
        })
      );
    });
  });

  describe('deleteNode', () => {
    it('should delete node successfully', async () => {
      const nodeId = 'node-123';

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]); // Node exists
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.deleteNode(nodeId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (n:Node {id: $nodeId}) RETURN n',
        { nodeId }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'MATCH (n:Node {id: $nodeId}) DETACH DELETE n',
        { nodeId }
      );

      expect(result).toBe(true);
    });

    it('should throw NotFoundError when node does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Node not found

      await expect(repository.deleteNode('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should validate required nodeId parameter', async () => {
      await expect(repository.deleteNode('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteNode('node-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteNodesByBlueprintId', () => {
    it('should delete all nodes for blueprint', async () => {
      const blueprintId = 'blueprint-123';

      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]); // Blueprint exists
      mockConnection.executeWrite.mockResolvedValue([]);

      await repository.deleteNodesByBlueprintId(blueprintId);

      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (b:Blueprint {id: $blueprintId}) RETURN b.id as id',
        { blueprintId }
      );

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('MATCH (b:Blueprint {id: $blueprintId})-[:CONTAINS]->(n:Node)'),
        { blueprintId }
      );
    });

    it('should throw NotFoundError when blueprint does not exist', async () => {
      mockConnection.executeQuery.mockResolvedValue([]); // Blueprint not found

      await expect(repository.deleteNodesByBlueprintId('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should validate required blueprintId parameter', async () => {
      await expect(repository.deleteNodesByBlueprintId('')).rejects.toThrow(ValidationError);
    });

    it('should handle database errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.deleteNodesByBlueprintId('blueprint-123')).rejects.toThrow(DatabaseError);
    });
  });

  describe('error handling scenarios', () => {
    it('should handle constraint violations', async () => {
      const error = new Error('unique constraint violation');
      mockConnection.executeWrite.mockRejectedValue(error);

      await expect(repository.createNode('blueprint-123', {
        type: 'start' as const,
        name: 'Test',
        description: 'Test node',
        parameters: {},
        ref: 'test'
      })).rejects.toThrow();
    });

    it('should handle connection timeouts', async () => {
      const error = new Error('connection timeout');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.getNodesByBlueprintId('blueprint-123')).rejects.toThrow();
    });

    it('should handle query syntax errors', async () => {
      const error = new Error('syntax error in query');
      mockConnection.executeQuery.mockRejectedValue(error);

      await expect(repository.getNodeById('node-123')).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      const error = new Error('network error');
      mockConnection.executeWrite.mockRejectedValue(error);

      await expect(repository.deleteNode('node-123')).rejects.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete node lifecycle', async () => {
      const blueprintId = 'blueprint-123';
      const nodeData = {
        type: 'agent' as const,
        name: 'Lifecycle Node',
        description: 'Node for lifecycle testing',
        parameters: { config: 'test' },
        ref: 'lifecycle'
      };

      // Mock create node
      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const createdNode = await repository.createNode(blueprintId, nodeData);

      // Mock update node
      mockConnection.executeQuery.mockResolvedValue([{ n: createdNode }]);
      mockConnection.executeWrite.mockResolvedValue([{
        n: { ...createdNode, name: 'Updated Node', parameters: '{"updated":true}' }
      }]);

      await repository.updateNode(createdNode.id, { name: 'Updated Node', parameters: { updated: true } });

      // Mock delete node
      mockConnection.executeQuery.mockResolvedValue([{ n: createdNode }]);
      await repository.deleteNode(createdNode.id);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(3); // create, update, delete
    });

    it('should handle bulk node operations with ID mapping', async () => {
      const blueprintId = 'blueprint-123';
      const nodesData = [
        { type: 'start' as const, name: 'Start', description: 'Start node', parameters: {}, ref: 'start', aiId: 'ai-start' },
        { type: 'agent' as const, name: 'Middle', description: 'Middle node', parameters: {}, ref: 'middle', aiId: 'ai-middle' },
        { type: 'end' as const, name: 'End', description: 'End node', parameters: {}, ref: 'end', aiId: 'ai-end' }
      ];

      // Mock create nodes
      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNodes(blueprintId, nodesData);

      // Verify ID mapping is created correctly
      expect(result.idMapping.get('ai-start')).toBeDefined();
      expect(result.idMapping.get('ai-middle')).toBeDefined();
      expect(result.idMapping.get('ai-end')).toBeDefined();

      // Mock delete all nodes
      mockConnection.executeQuery.mockResolvedValue([{ id: blueprintId }]);
      await repository.deleteNodesByBlueprintId(blueprintId);

      expect(mockConnection.executeWrite).toHaveBeenCalledTimes(4); // 3 creates + 1 bulk delete
    });
  });

  describe('edge cases', () => {
    it('should handle nodes with null parameters', async () => {
      const mockNode = {
        id: 'node-123',
        type: 'start',
        name: 'Start',
        parameters: null
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNode }]);

      const result = await repository.getNodeById('node-123');

      expect(result?.parameters).toEqual({});
    });

    it('should handle nodes with undefined parameters field', async () => {
      const mockNode = {
        id: 'node-123',
        type: 'start',
        name: 'Start'
        // parameters field is missing
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: mockNode }]);

      const result = await repository.getNodeById('node-123');

      expect(result?.parameters).toEqual({});
    });

    it('should handle very large parameters object', async () => {
      const largeParameters = {
        config: {
          data: 'x'.repeat(10000),
          settings: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` }))
        }
      };

      const nodeData = {
        type: 'agent' as const,
        name: 'Large Node',
        description: 'Node with large parameters',
        parameters: largeParameters,
        ref: 'large'
      };

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode('blueprint-123', nodeData);

      expect(result.parameters).toEqual(largeParameters);
    });

    it('should handle update with undefined parameter fields', async () => {
      const nodeId = 'node-123';
      const updates: Partial<NodeModel> = {
        name: 'Updated Name',
        parameters: undefined
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]);
      mockConnection.executeWrite.mockResolvedValue([{
        n: { id: nodeId, name: 'Updated Name', parameters: '{}' }
      }]);

      await repository.updateNode(nodeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET n.name = $name, n.parameters = $parameters'),
        expect.objectContaining({
          parameters: '{}' // undefined should serialize to empty object
        })
      );
    });

    it('should handle nodes with special characters in name and description', async () => {
      const nodeData = {
        type: 'agent' as const,
        name: 'Node with "quotes" & <symbols>',
        description: 'Description with émojis 🚀 and unicode ñ',
        parameters: { text: 'Special chars: @#$%^&*()' },
        ref: 'special-node'
      };

      mockConnection.executeQuery.mockResolvedValue([{ id: 'blueprint-123' }]);
      mockConnection.executeWrite.mockResolvedValue([]);

      const result = await repository.createNode('blueprint-123', nodeData);

      expect(result.name).toBe('Node with "quotes" & <symbols>');
      expect(result.description).toBe('Description with émojis 🚀 and unicode ñ');
    });

    it('should handle type updates', async () => {
      const nodeId = 'node-123';
      const updates: Partial<NodeModel> = {
        type: 'agent'
      };

      mockConnection.executeQuery.mockResolvedValue([{ n: { id: nodeId } }]);
      mockConnection.executeWrite.mockResolvedValue([{
        n: { id: nodeId, type: 'agent', parameters: '{}' }
      }]);

      await repository.updateNode(nodeId, updates);

      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        expect.stringContaining('SET n.type = $type'),
        expect.objectContaining({
          type: 'agent'
        })
      );
    });
  });
});