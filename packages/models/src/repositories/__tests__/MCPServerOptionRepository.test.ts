import { MCPServerOptionRepository } from '../MCPServerOptionRepository';
import { getConnection } from '../../connection';
import { MCPServerOption } from '../../types';

// Mock the connection
jest.mock('../../connection');
const mockConnection = {
  executeQuery: jest.fn(),
  executeWrite: jest.fn(),
};
(getConnection as jest.Mock).mockReturnValue(mockConnection);

describe('MCPServerOptionRepository - Slug System', () => {
  let repository: MCPServerOptionRepository;

  beforeEach(() => {
    repository = new MCPServerOptionRepository();
    jest.clearAllMocks();
  });

  describe('create method - slug validation', () => {
    it('should accept valid slug formats', async () => {
      const validSlugs = ['github', 'my-app', 'app123', 'test-app-2'];
      
      // Mock findBySlug to return null (slug doesn't exist)
      mockConnection.executeQuery.mockResolvedValue([]);
      mockConnection.executeWrite.mockResolvedValue([]);

      for (const slug of validSlugs) {
        const serverData = {
          name: 'Test Server',
          slug,
          command: 'docker',
          args: ['run', 'test'],
        };

        await expect(repository.create(serverData)).resolves.toBeDefined();
      }
    });

    it('should reject invalid slug formats', async () => {
      const invalidSlugs = [
        'GitHub', // uppercase
        'my_app', // underscore
        'my app', // space
        'my.app', // dot
        'my@app', // special character
      ];

      for (const slug of invalidSlugs) {
        const serverData = {
          name: 'Test Server',
          slug,
          command: 'docker',
          args: ['run', 'test'],
        };

        await expect(repository.create(serverData)).rejects.toThrow(
          'Slug must contain only lowercase letters, numbers, and hyphens'
        );
      }
    });

    it('should reject empty slug', async () => {
      const serverData = {
        name: 'Test Server',
        slug: '', // empty
        command: 'docker',
        args: ['run', 'test'],
      };

      await expect(repository.create(serverData)).rejects.toThrow(
        'Name, command, and slug are required fields'
      );
    });

    it('should enforce slug uniqueness', async () => {
      const existingServer: MCPServerOption = {
        id: 'existing-id',
        name: 'Existing Server',
        slug: 'github',
        command: 'docker',
        args: ['run', 'test'],
        env: '{}',
      };

      // Mock findBySlug to return existing server
      mockConnection.executeQuery.mockResolvedValue([{ m: existingServer }]);

      const serverData = {
        name: 'New Server',
        slug: 'github', // Same slug as existing
        command: 'docker',
        args: ['run', 'test'],
      };

      await expect(repository.create(serverData)).rejects.toThrow(
        "A MCP server option with slug 'github' already exists"
      );
    });

    it('should require slug field', async () => {
      const serverData = {
        name: 'Test Server',
        // slug: missing
        command: 'docker',
        args: ['run', 'test'],
      } as any;

      await expect(repository.create(serverData)).rejects.toThrow(
        'Name, command, and slug are required fields'
      );
    });
  });

  describe('findBySlug method', () => {
    it('should find server by slug', async () => {
      const mockServer: MCPServerOption = {
        id: 'test-id',
        name: 'GitHub',
        slug: 'github',
        command: 'docker',
        args: ['run', 'github'],
        env: '{}',
      };

      mockConnection.executeQuery.mockResolvedValue([{ m: mockServer }]);

      const result = await repository.findBySlug('github');

      expect(result).toEqual(mockServer);
      expect(mockConnection.executeQuery).toHaveBeenCalledWith(
        'MATCH (m:MCPServerOption) WHERE m.slug = $slug RETURN m',
        { slug: 'github' }
      );
    });

    it('should return null when slug not found', async () => {
      mockConnection.executeQuery.mockResolvedValue([]);

      const result = await repository.findBySlug('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw error for empty slug parameter', async () => {
      await expect(repository.findBySlug('')).rejects.toThrow(
        'Slug parameter is required'
      );
    });

    it('should handle database errors gracefully', async () => {
      mockConnection.executeQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.findBySlug('github')).rejects.toThrow(
        'Failed to retrieve MCP server option by slug: Database error'
      );
    });
  });

  describe('slug system integration', () => {
    it('should work with create-find cycle', async () => {
      const serverData = {
        name: 'GitHub',
        slug: 'github',
        command: 'docker',
        args: ['run', 'github'],
        env: '{}',
      };

      // Mock successful creation
      mockConnection.executeQuery.mockResolvedValue([]); // No existing slug
      mockConnection.executeWrite.mockResolvedValue([]);

      // Create server
      await repository.create(serverData);

      // Verify create was called with correct slug
      expect(mockConnection.executeWrite).toHaveBeenCalledWith(
        'CREATE (m:MCPServerOption $props) RETURN m',
        expect.objectContaining({
          props: expect.objectContaining({
            slug: 'github',
          }),
        })
      );
    });
  });
});