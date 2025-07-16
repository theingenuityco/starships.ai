import { UserContainerManager } from '../../src/docker/UserContainerManager';
import { MCPConfiguration } from '@starships/protocol';
import Docker from 'dockerode';

describe('UserContainerManager', () => {
  let containerManager: UserContainerManager;
  let mockDocker: jest.Mocked<Docker>;

  beforeEach(() => {
    containerManager = new UserContainerManager();
    mockDocker = (containerManager as any).docker;
  });

  describe('initialize', () => {
    it('should initialize Docker connection successfully', async () => {
      await containerManager.initialize();
      expect(mockDocker.ping).toHaveBeenCalled();
    });

    it('should handle Docker connection failure', async () => {
      mockDocker.ping.mockRejectedValueOnce(new Error('Docker not available'));
      
      await expect(containerManager.initialize()).rejects.toThrow('Docker initialization failed');
    });
  });

  describe('createUserContainer', () => {
    const mockConfig: MCPConfiguration = {
      id: 'test-config-1',
      userId: 'test-user-1',
      name: 'Test MCP Server',
      containerImage: 'starships-mcp-tools:latest',
      tools: [
        {
          name: 'web_scraper',
          description: 'Scrape web content',
          parameters: { url: { type: 'string', required: true } },
          permissions: ['web_access'],
          category: 'data'
        }
      ],
      resources: [],
      environment: { NODE_ENV: 'test' },
      limits: {
        memory: '512m',
        cpu: '0.5',
        timeout: 30000
      },
      agentPermissions: {
        'agent-1': ['web_scraper']
      },
      agentToolCredentials: {
        'agent-1': {
          'web_scraper': { apiKey: 'test-key' }
        }
      },
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z'
    };

    it('should create a container with proper configuration', async () => {
      const containerId = await containerManager.createUserContainer('test-user-1', mockConfig);

      expect(mockDocker.createContainer).toHaveBeenCalledWith({
        Image: 'starships-mcp-tools:latest',
        name: 'starships-user-test-user-1-mcp-tools',
        Env: [
          'USER_ID=test-user-1',
          'TOOLS=web_scraper',
          'NODE_ENV=test'
        ],
        HostConfig: expect.objectContaining({
          Memory: 536870912, // 512MB in bytes
          CpuShares: 512, // 0.5 CPU
          NetworkMode: 'none',
          RestartPolicy: { Name: 'unless-stopped' },
          PidsLimit: 100,
          CapDrop: ['ALL'],
          CapAdd: []
        }),
        WorkingDir: '/app',
        ExposedPorts: {
          '8080/tcp': {}
        },
        Labels: expect.objectContaining({
          'starships.user_id': 'test-user-1',
          'starships.type': 'mcp-tools'
        })
      });

      expect(containerId).toBe('mock-container-id');
    });

    it('should handle container creation failure', async () => {
      mockDocker.createContainer.mockRejectedValueOnce(new Error('Docker error'));

      await expect(
        containerManager.createUserContainer('test-user-1', mockConfig)
      ).rejects.toThrow('Container creation failed: Docker error');
    });

    it('should return existing container if already running', async () => {
      // Mock existing container
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: true }
        })
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);
      
      // Set up existing container mapping
      (containerManager as any).userContainers.set('test-user-1', 'existing-container-id');

      const containerId = await containerManager.createUserContainer('test-user-1', mockConfig);

      expect(containerId).toBe('existing-container-id');
      expect(mockDocker.createContainer).not.toHaveBeenCalled();
    });
  });

  describe('executeToolInContainer', () => {
    const mockToolCall = {
      id: 'test-tool-call-1',
      toolName: 'web_scraper',
      parameters: { url: 'https://example.com' },
      agentId: 'test-agent-1',
      userId: 'test-user-1',
      timestamp: '2024-01-01T00:00:00.000Z'
    };

    it('should execute tool in container', async () => {
      // Set up container mapping
      (containerManager as any).userContainers.set('test-user-1', 'container-id');
      
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: true }
        }),
        exec: jest.fn().mockResolvedValue({
          start: jest.fn().mockResolvedValue({
            on: jest.fn((event, callback) => {
              if (event === 'end') {
                setTimeout(() => callback(), 10);
              }
            })
          })
        })
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const result = await containerManager.executeToolInContainer('test-user-1', mockToolCall);

      expect(mockContainer.exec).toHaveBeenCalledWith({
        Cmd: ['python3', '/app/tools/executor.py', 'web_scraper', '{"url":"https://example.com"}'],
        AttachStdout: true,
        AttachStderr: true,
        Env: ['url=https://example.com']
      });
    });

    it('should throw error if no container found', async () => {
      await expect(
        containerManager.executeToolInContainer('test-user-1', mockToolCall)
      ).rejects.toThrow('No container found for user test-user-1');
    });

    it('should throw error if container is not running', async () => {
      (containerManager as any).userContainers.set('test-user-1', 'container-id');
      
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          State: { Running: false }
        })
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      await expect(
        containerManager.executeToolInContainer('test-user-1', mockToolCall)
      ).rejects.toThrow('Container for user test-user-1 is not running');
    });
  });

  describe('getUserContainerInfo', () => {
    it('should return container information', async () => {
      (containerManager as any).userContainers.set('test-user-1', 'container-id');
      
      const mockContainer = {
        inspect: jest.fn().mockResolvedValue({
          Id: 'full-container-id',
          State: { Status: 'running', FinishedAt: null },
          Created: '2024-01-01T00:00:00.000Z'
        }),
        stats: jest.fn().mockResolvedValue({
          memory_stats: { usage: 104857600 }, // 100MB
          cpu_stats: { cpu_usage: { total_usage: 1000000 }, system_cpu_usage: 10000000, online_cpus: 1 },
          precpu_stats: { cpu_usage: { total_usage: 900000 }, system_cpu_usage: 9000000 }
        })
      };
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      const info = await containerManager.getUserContainerInfo('test-user-1');

      expect(info).toEqual({
        id: 'container-id',
        dockerId: 'full-container-id',
        status: 'running',
        resourceUsage: {
          memory: '100MB',
          cpu: expect.any(String)
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        lastActivity: expect.any(String)
      });
    });

    it('should throw error if no container found', async () => {
      await expect(
        containerManager.getUserContainerInfo('test-user-1')
      ).rejects.toThrow('No container found for user test-user-1');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all user containers', async () => {
      const mockContainer1 = {
        stop: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
      };
      const mockContainer2 = {
        stop: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
      };

      (containerManager as any).userContainers.set('user-1', 'container-1');
      (containerManager as any).userContainers.set('user-2', 'container-2');

      mockDocker.getContainer
        .mockReturnValueOnce(mockContainer1 as any)
        .mockReturnValueOnce(mockContainer2 as any);

      await containerManager.cleanup();

      expect(mockContainer1.stop).toHaveBeenCalledWith({ t: 10 });
      expect(mockContainer1.remove).toHaveBeenCalled();
      expect(mockContainer2.stop).toHaveBeenCalledWith({ t: 10 });
      expect(mockContainer2.remove).toHaveBeenCalled();
      expect((containerManager as any).userContainers.size).toBe(0);
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockContainer = {
        stop: jest.fn().mockRejectedValue(new Error('Stop failed')),
        remove: jest.fn().mockResolvedValue(undefined)
      };

      (containerManager as any).userContainers.set('user-1', 'container-1');
      mockDocker.getContainer.mockReturnValue(mockContainer as any);

      // Should not throw error
      await expect(containerManager.cleanup()).resolves.toBeUndefined();
    });
  });
});