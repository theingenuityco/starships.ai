import { DockerComposeDeployer } from '../DockerComposeDeployer';
import { MCPServerConnector } from '@starships/models';
import { promises as fs } from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    unlink: jest.fn(),
    rm: jest.fn(),
  },
}));

jest.mock('../../../services/docker/NetworkManager');

const mockExecAsync = jest.fn();
jest.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('DockerComposeDeployer', () => {
  let deployer: DockerComposeDeployer;
  const testStarshipId = 'starship-test-123';
  const testConnector: MCPServerConnector = {
    id: 'connector-456',
    starshipId: testStarshipId,
    templateId: 'github-template',
    status: 'connecting',
    isActive: true,
    connectedAt: '2025-01-25T10:00:00Z',
    env: JSON.stringify({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'test-token',
    }),
    createdAt: '2025-01-25T10:00:00Z',
    updatedAt: '2025-01-25T10:00:00Z',
  };

  beforeEach(() => {
    deployer = new DockerComposeDeployer();
    jest.clearAllMocks();
    
    // Mock successful directory creation
    mockFs.mkdir.mockResolvedValue(undefined);
  });

  describe('deploy', () => {
    it('should successfully deploy a GitHub MCP connector', async () => {
      // Mock no existing compose file
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      
      // Mock successful docker-compose execution
      mockExecAsync.mockResolvedValue({ 
        stdout: 'Creating mcp-starship-test-123-github ... done', 
        stderr: '' 
      });

      // Mock container ID retrieval
      mockExecAsync.mockResolvedValueOnce({ stdout: 'container-abc123\n', stderr: '' });

      const result = await deployer.deploy(testStarshipId, testConnector);

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('mcp-starship-test-123-github');
      expect(result.containerId).toBe('container-abc123');
      expect(result.networkName).toBe('starship-starship-test-123');
      expect(typeof result.deploymentTime).toBe('number');
    });

    it('should handle deployment failures gracefully', async () => {
      // Mock compose file operations
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      
      // Mock docker-compose failure
      mockExecAsync.mockRejectedValue(new Error('Docker daemon not running'));

      const result = await deployer.deploy(testStarshipId, testConnector);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Docker daemon not running');
      expect(typeof result.deploymentTime).toBe('number');
    });

    it('should load existing compose file and add new service', async () => {
      const existingCompose = `
version: '3.8'
services:
  mcp-starship-test-123-filesystem:
    image: starships/mcp-node:latest
    container_name: mcp-starship-test-123-filesystem
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(existingCompose);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockExecAsync.mockResolvedValue({ stdout: 'done', stderr: '' });

      const result = await deployer.deploy(testStarshipId, testConnector);

      expect(result.success).toBe(true);
      expect(mockFs.writeFile).toHaveBeenCalled();
      
      // Check that the compose file was updated with both services
      const writeCall = mockFs.writeFile.mock.calls[0];
      const updatedCompose = writeCall[1] as string;
      expect(updatedCompose).toContain('mcp-starship-test-123-github');
      expect(updatedCompose).toContain('mcp-starship-test-123-filesystem');
    });

    it('should create volume directories for filesystem services', async () => {
      const filesystemConnector: MCPServerConnector = {
        ...testConnector,
        templateId: 'filesystem-template',
      };

      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockExecAsync.mockResolvedValue({ stdout: 'done', stderr: '' });

      await deployer.deploy(testStarshipId, filesystemConnector);

      // Check that volume directories were created
      expect(mockFs.mkdir).toHaveBeenCalledWith(
        '/data/starships/starship-test-123/filesystem',
        { recursive: true }
      );
    });
  });

  describe('remove', () => {
    it('should successfully remove a specific connector', async () => {
      const composeWithService = `
version: '3.8'
services:
  mcp-starship-test-123-github:
    image: ghcr.io/github/github-mcp-server
    container_name: mcp-starship-test-123-github
    labels:
      connector.id: connector-456
      starship.id: starship-test-123
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(composeWithService);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockExecAsync.mockResolvedValue({ stdout: 'Stopping...', stderr: '' });

      const result = await deployer.remove(testStarshipId, 'connector-456');

      expect(result).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('docker-compose -f')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('stop mcp-starship-test-123-github')
      );
    });

    it('should return false when connector not found', async () => {
      const composeWithoutService = `
version: '3.8'
services: {}
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(composeWithoutService);

      const result = await deployer.remove(testStarshipId, 'nonexistent-connector');

      expect(result).toBe(false);
    });
  });

  describe('removeAll', () => {
    it('should remove all services and cleanup resources', async () => {
      mockFs.access.mockResolvedValue(undefined); // File exists
      
      const composeWithServices = `
version: '3.8'
services:
  mcp-starship-test-123-github:
    image: ghcr.io/github/github-mcp-server
  mcp-starship-test-123-filesystem:
    image: starships/mcp-node:latest
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(composeWithServices);
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.rm.mockResolvedValue(undefined);
      mockExecAsync.mockResolvedValue({ stdout: 'Removing...', stderr: '' });

      const removedCount = await deployer.removeAll(testStarshipId);

      expect(removedCount).toBe(2);
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('docker-compose -f')
      );
      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining('down --volumes')
      );
      expect(mockFs.unlink).toHaveBeenCalled();
      expect(mockFs.rm).toHaveBeenCalledWith(
        '/data/starships/starship-test-123',
        { recursive: true, force: true }
      );
    });

    it('should return 0 when no compose file exists', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const removedCount = await deployer.removeAll(testStarshipId);

      expect(removedCount).toBe(0);
    });

    it('should return 0 when compose file has no services', async () => {
      mockFs.access.mockResolvedValue(undefined);
      
      const emptyCompose = `
version: '3.8'
services: {}
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(emptyCompose);

      const removedCount = await deployer.removeAll(testStarshipId);

      expect(removedCount).toBe(0);
    });
  });

  describe('getStarshipStatus', () => {
    it('should return status for all services in a starship', async () => {
      const composeWithServices = `
version: '3.8'
services:
  mcp-starship-test-123-github:
    image: ghcr.io/github/github-mcp-server
    labels:
      connector.id: connector-456
      starship.id: starship-test-123
  mcp-starship-test-123-filesystem:
    image: starships/mcp-node:latest
    labels:
      connector.id: connector-789
      starship.id: starship-test-123
networks:
  starship-starship-test-123:
    external: true
`;

      mockFs.readFile.mockResolvedValue(composeWithServices);

      const statuses = await deployer.getStarshipStatus(testStarshipId);

      expect(statuses).toHaveLength(2);
      expect(statuses[0].connectorId).toBe('connector-456');
      expect(statuses[1].connectorId).toBe('connector-789');
      expect(statuses[0].status).toBe('running');
      expect(statuses[0].networkName).toBe('starship-starship-test-123');
    });

    it('should return empty array when no services found', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const statuses = await deployer.getStarshipStatus(testStarshipId);

      expect(statuses).toHaveLength(0);
    });
  });

  describe('service configuration building', () => {
    it('should build correct service config for GitHub template', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockImplementation((filePath, content) => {
        // Capture the compose file content to verify service configuration
        const yamlContent = content as string;
        
        expect(yamlContent).toContain('mcp-starship-test-123-github');
        expect(yamlContent).toContain('ghcr.io/github/github-mcp-server');
        expect(yamlContent).toContain('starship.id: starship-test-123');
        expect(yamlContent).toContain('connector.id: connector-456');
        expect(yamlContent).toContain('template.slug: github');
        expect(yamlContent).toContain('restart: unless-stopped');
        expect(yamlContent).toContain('GITHUB_PERSONAL_ACCESS_TOKEN: test-token');
        
        return Promise.resolve();
      });
      
      mockExecAsync.mockResolvedValue({ stdout: 'done', stderr: '' });

      await deployer.deploy(testStarshipId, testConnector);

      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should build correct service config for filesystem template with volumes', async () => {
      const filesystemConnector: MCPServerConnector = {
        ...testConnector,
        templateId: 'filesystem-template',
      };

      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockImplementation((filePath, content) => {
        const yamlContent = content as string;
        
        expect(yamlContent).toContain('mcp-starship-test-123-filesystem');
        expect(yamlContent).toContain('starships/mcp-node:latest');
        expect(yamlContent).toContain('/data/starships/starship-test-123/filesystem:/workspace:rw');
        expect(yamlContent).toContain('template.slug: filesystem');
        
        return Promise.resolve();
      });
      
      mockExecAsync.mockResolvedValue({ stdout: 'done', stderr: '' });

      await deployer.deploy(testStarshipId, filesystemConnector);

      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Permission denied'));
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      const result = await deployer.deploy(testStarshipId, testConnector);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeTruthy();
    });

    it('should handle Docker command errors gracefully', async () => {
      mockFs.readFile.mockRejectedValue(new Error('File not found'));
      mockFs.writeFile.mockResolvedValue(undefined);
      
      mockExecAsync.mockRejectedValue(new Error('Container already exists'));

      const result = await deployer.deploy(testStarshipId, testConnector);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Container already exists');
    });
  });
});