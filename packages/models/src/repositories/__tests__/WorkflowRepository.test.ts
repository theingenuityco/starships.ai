/**
 * WorkflowRepository Unit Tests
 */

import { getConnection } from '@/helpers/database';
import { WorkflowRepository } from '@/repositories/WorkflowRepository';
import type { Blueprint } from '@starships/autopilot';
import { DatabaseError, NotFoundError, ValidationError } from '@starships/errors';
import type { WorkflowModel } from '@starships/protocol';

// Mock the database connection
jest.mock('../../helpers/database', () => ({
  getConnection: jest.fn(),
  convertNeo4jIntsInObject: jest.fn((obj) => obj),
  convertNeo4jIntsInArray: jest.fn((arr) => arr),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'),
}));

describe('WorkflowRepository', () => {
  let repository: WorkflowRepository;
  let mockConnection: any;

  beforeEach(() => {
    repository = new WorkflowRepository();
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create repository with correct service name', () => {
      expect(repository['serviceName']).toBe('WorkflowRepository');
    });
  });

  describe('Private Helper Methods', () => {
    describe('getSafeValueLocal', () => {
      it('should return value when valid', () => {
        const result = repository['getSafeValueLocal']('test-value', 'default');
        expect(result).toBe('test-value');
      });

      it('should return default for null', () => {
        const result = repository['getSafeValueLocal'](null, 'default');
        expect(result).toBe('default');
      });

      it('should return default for undefined', () => {
        const result = repository['getSafeValueLocal'](undefined, 'default');
        expect(result).toBe('default');
      });

      it('should return default for empty object', () => {
        const result = repository['getSafeValueLocal']({}, 'default');
        expect(result).toBe('default');
      });
    });

    describe('serializeComplexFields', () => {
      it('should serialize using new serialization utilities', () => {
        const workflow = {
          id: 'workflow-1',
          name: 'Test Workflow',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          authorId: 'author-123',
          isPublic: false,
          usageCount: 0,
          executionMode: 'workflow',
          category: 'automation',
          version: '1.0.0',
          blueprint: { nodes: [], edges: [], metadata: {} },
          tags: ['test', 'workflow'],
          allowedStarshipClasses: ['scout', 'cruiser'],
        } as WorkflowModel;

        const result = repository['serializeComplexFields'](workflow);

        // Should preserve the workflow as-is (since serializeForDatabase handles the transformation)
        expect(result).toEqual(
          expect.objectContaining({
            id: 'workflow-1',
            name: 'Test Workflow',
            blueprint: { nodes: [], edges: [], metadata: {} },
            tags: ['test', 'workflow'],
            allowedStarshipClasses: ['scout', 'cruiser'],
          })
        );
      });
    });

    describe('deserializeComplexFields', () => {
      it('should deserialize using new mapping utilities', () => {
        const workflow = {
          id: 'workflow-1',
          name: 'Test Workflow',
          blueprint: '{"nodes":[],"edges":[],"metadata":{}}',
          tags: ['test'],
          allowedStarshipClasses: ['scout'],
        };

        const result = repository['deserializeComplexFields'](workflow);

        expect(result.blueprint).toEqual({ nodes: [], edges: [], metadata: {} });
        expect(result.tags).toEqual(['test']);
        expect(result.allowedStarshipClasses).toEqual(['scout']);
        // Should have default values applied
        expect(result.timeout).toBe(30000);
        expect(result.usageCount).toBe(0);
        expect(result.isPublic).toBe(false);
        expect(result.version).toBe('1.0.0');
        expect(result.executionMode).toBe('workflow');
      });

      it('should handle missing arrays with defaults', () => {
        const workflow = {
          id: 'workflow-1',
          name: 'Test Workflow',
        };

        const result = repository['deserializeComplexFields'](workflow);

        expect(result.tags).toEqual([]);
        expect(result.allowedStarshipClasses).toEqual([]);
        expect(result.timeout).toBe(30000);
        expect(result.usageCount).toBe(0);
        expect(result.isPublic).toBe(false);
      });
    });
  });

  describe('CRUD Operations', () => {
    describe('findAll', () => {
      it('should return all workflows', async () => {
        const mockWorkflows = [
          { id: 'workflow-1', name: 'Workflow 1' },
          { id: 'workflow-2', name: 'Workflow 2' },
        ];
        const expectedResult = [
          {
            id: 'workflow-1',
            name: 'Workflow 1',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
          {
            id: 'workflow-2',
            name: 'Workflow 2',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findAll();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (w:Workflow) RETURN w ORDER BY w.createdAt DESC');
        expect(result).toEqual(expectedResult);
      });

      it('should handle empty result', async () => {
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
      it('should return workflow by id', async () => {
        const mockWorkflow = { id: 'workflow-1', name: 'Test Workflow' };
        mockConnection.executeQuery.mockResolvedValue([{ w: mockWorkflow }]);

        const result = await repository.findById('workflow-1');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith('MATCH (w:Workflow) WHERE w.id = $id RETURN w', { id: 'workflow-1' });
        expect(result).toEqual(mockWorkflow);
      });

      it('should return null when workflow not found', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findById('non-existent');

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

        await expect(repository.findById('workflow-1')).rejects.toThrow(DatabaseError);
      });
    });

    describe('create', () => {
      const mockWorkflowData = {
        name: 'Test Workflow',
        authorId: 'author-123',
        category: 'automation' as WorkflowModel['category'],
        starshipId: 'starship-123',
        blueprint: { nodes: [], edges: [], metadata: {} } as Blueprint,
        version: '1.0.0',
        isPublic: false,
        tags: ['test'],
        executionMode: 'workflow' as const,
        allowedStarshipClasses: ['scout'],
        timeout: 60000,
      };

      it('should create workflow successfully', async () => {
        const createdWorkflow = {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Test Workflow',
          authorId: 'author-123',
          usageCount: 0,
          starshipId: 'starship-123', // Include starshipId to trigger relationship creation
        };

        // Mock createEntityWithAutoId format
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: createdWorkflow }]) // createEntityWithAutoId result
          .mockResolvedValueOnce([]); // relationship creation

        const result = await repository.create(mockWorkflowData);

        expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Workflow + relationship
        expect(result.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
        expect(result.name).toBe('Test Workflow');
        expect(result.authorId).toBe('author-123');
        expect(result.usageCount).toBe(0);
      });

      it('should validate required fields', async () => {
        const invalidData = { ...mockWorkflowData, name: undefined } as any;

        await expect(repository.create(invalidData)).rejects.toThrow(ValidationError);
      });

      it('should create with default blueprint when none provided', async () => {
        const createdWorkflow = {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          name: 'Test Workflow',
          authorId: 'author-123',
          blueprint: '{"nodes":[],"edges":[],"metadata":{}}',
        };

        mockConnection.executeWrite.mockResolvedValueOnce([{ n: createdWorkflow }]);

        const dataWithoutBlueprint = {
          name: 'Test Workflow',
          authorId: 'author-123',
        };

        const result = await repository.create(dataWithoutBlueprint);

        expect(result.blueprint).toEqual({ nodes: [], edges: [], metadata: {} });
      });

      it('should create Neo4j relationship when starshipId provided', async () => {
        const createdWorkflow = {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          starshipId: 'starship-123',
        };

        mockConnection.executeWrite
          .mockResolvedValueOnce([{ n: createdWorkflow }]) // createEntityWithAutoId result
          .mockResolvedValueOnce([]); // relationship creation

        await repository.create(mockWorkflowData);

        expect(mockConnection.executeWrite).toHaveBeenCalledTimes(2); // Workflow + relationship
        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('CREATE (w)-[:DEPLOYED_ON'),
          expect.objectContaining({
            starshipId: 'starship-123',
            workflowId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          })
        );
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.create(mockWorkflowData)).rejects.toThrow(DatabaseError);
      });
    });

    describe('update', () => {
      it('should update workflow successfully', async () => {
        const mockWorkflow = { id: 'workflow-1', name: 'Updated Workflow' };
        const expectedResult = {
          id: 'workflow-1',
          name: 'Updated Workflow',
          blueprint: null,
          tags: [],
          allowedStarshipClasses: [],
        };
        const updates = { name: 'Updated Workflow' };
        mockConnection.executeWrite.mockResolvedValue([{ w: mockWorkflow }]);

        const result = await repository.update('workflow-1', updates);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith('MATCH (w:Workflow) WHERE w.id = $id SET w += $updates RETURN w', {
          id: 'workflow-1',
          updates: expect.objectContaining({
            ...updates,
            updatedAt: expect.any(String),
          }),
        });
        expect(result).toEqual(expectedResult);
      });

      it('should validate id parameter', async () => {
        await expect(repository.update('', {})).rejects.toThrow(ValidationError);
      });

      it('should return null when workflow not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        const result = await repository.update('non-existent', { name: 'Updated' });

        expect(result).toBeNull();
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.update('workflow-1', { name: 'Updated' })).rejects.toThrow(DatabaseError);
      });
    });

    describe('delete', () => {
      it('should delete workflow successfully', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 1 }]);

        const result = await repository.delete('workflow-1');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.id = $id DETACH DELETE w RETURN count(w) as deletedCount',
          { id: 'workflow-1' }
        );
        expect(result).toBe(true);
      });

      it('should return false when workflow not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ deletedCount: 0 }]);

        const result = await repository.delete('non-existent');

        expect(result).toBe(false);
      });

      it('should handle database errors', async () => {
        mockConnection.executeWrite.mockRejectedValue(new Error('Database error'));

        await expect(repository.delete('workflow-1')).rejects.toThrow(DatabaseError);
      });
    });
  });

  describe('Relationship Methods', () => {
    describe('findByUser', () => {
      it('should return user workflows', async () => {
        const mockWorkflows = [{ id: 'workflow-1', name: 'User Workflow' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            name: 'User Workflow',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(
          mockWorkflows.map((w) => ({
            w: { ...w, blueprint: null, tags: [], allowedStarshipClasses: [] },
          }))
        );

        const result = await repository.findByUser('user-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow)<-[:INTERACTS_WITH]-(u:User) WHERE u.id = $userId RETURN w',
          { userId: 'user-123' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findByStarship', () => {
      it('should return starship workflows', async () => {
        const mockWorkflows = [{ id: 'workflow-1', name: 'Starship Workflow' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            name: 'Starship Workflow',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findByStarship('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow)-[:DEPLOYED_ON]->(s:Starship) WHERE s.id = $starshipId RETURN w ORDER BY w.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findByStarshipId', () => {
      it('should return workflows by starshipId property', async () => {
        const mockWorkflows = [{ id: 'workflow-1', starshipId: 'starship-123' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            starshipId: 'starship-123',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findByStarshipId('starship-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.starshipId = $starshipId RETURN w ORDER BY w.name',
          { starshipId: 'starship-123' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('updateStarshipId', () => {
      it('should update workflow starshipId successfully', async () => {
        mockConnection.executeWrite
          .mockResolvedValueOnce([{ count: 1 }]) // Workflow update
          .mockResolvedValueOnce([]) // Remove relationship
          .mockResolvedValueOnce([]); // Create relationship

        await repository.updateStarshipId('workflow-123', 'starship-456');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          expect.stringContaining('SET w.starshipId = $starshipId'),
          expect.objectContaining({
            workflowId: 'workflow-123',
            starshipId: 'starship-456',
          })
        );
      });

      it('should throw error when workflowId is missing', async () => {
        await expect(repository.updateStarshipId('', 'starship-456')).rejects.toThrow('Workflow ID is required');
      });

      it('should throw error when starshipId is missing', async () => {
        await expect(repository.updateStarshipId('workflow-123', '')).rejects.toThrow('Starship ID is required');
      });

      it('should throw error when workflow not found', async () => {
        mockConnection.executeWrite.mockResolvedValue([{ count: 0 }]);

        await expect(repository.updateStarshipId('non-existent', 'starship-456')).rejects.toThrow(NotFoundError);
      });
    });

    describe('findUndeployedWorkflows', () => {
      it('should return workflows without starshipId', async () => {
        const mockWorkflows = [{ id: 'workflow-1', starshipId: null }];
        const expectedResult = [
          {
            id: 'workflow-1',
            starshipId: null,
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findUndeployedWorkflows();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.starshipId IS NULL OR w.starshipId = "" RETURN w ORDER BY w.createdAt DESC',
          {}
        );
        expect(result).toEqual(expectedResult);
      });
    });
  });

  describe('Query Methods', () => {
    describe('findByAuthor', () => {
      it('should return workflows by author', async () => {
        const mockWorkflows = [{ id: 'workflow-1', authorId: 'author-123' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            authorId: 'author-123',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findByAuthor('author-123');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.authorId = $authorId RETURN w ORDER BY w.updatedAt DESC',
          { authorId: 'author-123' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findByCategory', () => {
      it('should return workflows by category', async () => {
        const mockWorkflows = [{ id: 'workflow-1', category: 'automation' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            category: 'automation',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findByCategory('automation');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.category = $category RETURN w ORDER BY w.name',
          { category: 'automation' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findByTags', () => {
      it('should return workflows by tags', async () => {
        const mockWorkflows = [{ id: 'workflow-1', tags: ['automation', 'test'] }];
        const expectedResult = [
          {
            id: 'workflow-1',
            tags: ['automation', 'test'],
            blueprint: null,
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findByTags(['automation', 'test']);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE ANY(tag IN $tags WHERE tag IN w.tags) RETURN w ORDER BY w.name',
          { tags: ['automation', 'test'] }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findPublic', () => {
      it('should return public workflows with pagination', async () => {
        const mockWorkflows = [{ id: 'workflow-1', isPublic: true }];
        const expectedResult = [
          {
            id: 'workflow-1',
            isPublic: true,
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const result = await repository.findPublic(10, 5);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.isPublic = true RETURN w ORDER BY w.usageCount DESC, w.rating DESC SKIP $offset LIMIT $limit',
          {
            limit: 10,
            offset: 5,
          }
        );
        expect(result).toEqual(expectedResult);
      });

      it('should use default pagination values', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        await repository.findPublic();

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(expect.any(String), {
          limit: 50,
          offset: 0,
        });
      });
    });

    describe('searchWorkflows', () => {
      it('should search workflows with fulltext search', async () => {
        const mockWorkflows = [{ id: 'workflow-1', name: 'Matching Workflow' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            name: 'Matching Workflow',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w, score: 0.95 })));

        const result = await repository.searchWorkflows('test query');

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'CALL db.index.fulltext.queryNodes("workflowSearch", $query) YIELD node as w, score RETURN w, score ORDER BY score DESC LIMIT 20',
          { query: 'test query' }
        );
        expect(result).toEqual(expectedResult);
      });
    });

    describe('findWithFilters', () => {
      it('should filter workflows by multiple criteria', async () => {
        const mockWorkflows = [{ id: 'workflow-1', category: 'automation' }];
        const expectedResult = [
          {
            id: 'workflow-1',
            category: 'automation',
            blueprint: null,
            tags: [],
            allowedStarshipClasses: [],
          },
        ];
        mockConnection.executeQuery.mockResolvedValue(mockWorkflows.map((w) => ({ w })));

        const filters = {
          category: 'automation',
          authorId: 'author-123',
          isPublic: true,
          tags: ['test'],
          starshipClass: 'scout' as const,
        };

        const result = await repository.findWithFilters(filters);

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE 1=1'),
          expect.objectContaining({
            category: 'automation',
            authorId: 'author-123',
            isPublic: true,
            tags: ['test'],
            starshipClass: 'scout',
          })
        );
        expect(result).toEqual(expectedResult);
      });

      it('should handle empty filters', async () => {
        mockConnection.executeQuery.mockResolvedValue([]);

        const result = await repository.findWithFilters({});

        expect(mockConnection.executeQuery).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE 1=1 RETURN w ORDER BY w.usageCount DESC, w.rating DESC',
          {}
        );
        expect(result).toEqual([]);
      });
    });
  });

  describe('Action Methods', () => {
    describe('incrementUsageCount', () => {
      it('should increment usage count', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.incrementUsageCount('workflow-123');

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.id = $id SET w.usageCount = w.usageCount + 1, w.updatedAt = $timestamp',
          {
            id: 'workflow-123',
            timestamp: expect.any(String),
          }
        );
      });
    });

    describe('updateRating', () => {
      it('should update workflow rating', async () => {
        mockConnection.executeWrite.mockResolvedValue([]);

        await repository.updateRating('workflow-123', 4.5);

        expect(mockConnection.executeWrite).toHaveBeenCalledWith(
          'MATCH (w:Workflow) WHERE w.id = $id SET w.rating = $rating, w.updatedAt = $timestamp',
          {
            id: 'workflow-123',
            rating: 4.5,
            timestamp: expect.any(String),
          }
        );
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle database connection errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('connection failed'));

      await expect(repository.findById('workflow-123')).rejects.toThrow(DatabaseError);
    });

    it('should handle timeout errors', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('operation timeout'));

      await expect(repository.findAll()).rejects.toThrow(DatabaseError);
    });

    it('should handle constraint violation errors', async () => {
      mockConnection.executeWrite.mockRejectedValue(new Error('constraint violation'));

      await expect(
        repository.create({
          name: 'Test',
          authorId: 'author-123',
        })
      ).rejects.toThrow();
    });
  });
});
