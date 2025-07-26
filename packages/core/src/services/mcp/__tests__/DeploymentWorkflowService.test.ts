import { DeploymentWorkflowService, DeploymentWorkflowOptions, WorkflowResult } from '../DeploymentWorkflowService';
import { MCPServerConnector, MCPServerConnectorRepository } from '@starships/models';
import { MCPDeployer, DeploymentResult } from '../MCPDeployer';

// Mock dependencies
jest.mock('@starships/models');
jest.mock('../DockerComposeDeployer');

const mockMCPConnectorRepo = {
  createFromTemplate: jest.fn(),
  updateDockerStatus: jest.fn(),
  updateDockerHealth: jest.fn(),
  findById: jest.fn(),
  delete: jest.fn(),
} as jest.Mocked<MCPServerConnectorRepository>;

const mockDeployer = {
  deploy: jest.fn(),
  remove: jest.fn(),
  getStatus: jest.fn(),
  checkHealth: jest.fn(),
} as jest.Mocked<MCPDeployer>;

describe('DeploymentWorkflowService', () => {
  let service: DeploymentWorkflowService;
  let notificationCallback: jest.Mock;

  const mockConnector: MCPServerConnector = {
    id: 'connector-123',
    starshipId: 'starship-456',
    templateId: 'github-template',
    status: 'connecting',
    isActive: true,
    connectedAt: '2025-01-25T10:00:00Z',
    env: JSON.stringify({
      GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token'
    }),
    createdAt: '2025-01-25T10:00:00Z',
    updatedAt: '2025-01-25T10:00:00Z',
    dockerStatus: 'pending',
    dockerServiceName: 'mcp-starship-456-github',
    dockerNetworkName: 'starship-starship-456'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DeploymentWorkflowService(mockMCPConnectorRepo, mockDeployer);
    notificationCallback = jest.fn();
    service.addNotificationCallback(notificationCallback);
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('handleMCPServerSelection', () => {
    const deploymentOptions: DeploymentWorkflowOptions = {
      starshipId: 'starship-456',
      templateId: 'github-template',
      apiKeys: {
        GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token'
      },
      userId: 'user-789'
    };

    it('should successfully deploy an MCP server', async () => {
      // Mock successful connector creation
      mockMCPConnectorRepo.createFromTemplate.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.updateDockerStatus.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.updateDockerHealth.mockResolvedValue(mockConnector);

      // Mock successful deployment
      const deploymentResult: DeploymentResult = {
        success: true,
        serviceName: 'mcp-starship-456-github',
        containerId: 'container-abc123',
        networkName: 'starship-starship-456',
        deploymentTime: 5000
      };
      mockDeployer.deploy.mockResolvedValue(deploymentResult);
      mockDeployer.checkHealth.mockResolvedValue({ healthy: true, status: 'healthy' });

      const result = await service.handleMCPServerSelection(deploymentOptions);

      expect(result.success).toBe(true);
      expect(result.connectorId).toBe(mockConnector.id);
      expect(result.serviceName).toBe('mcp-starship-456-github');
      expect(typeof result.deploymentTime).toBe('number');

      // Verify connector was created
      expect(mockMCPConnectorRepo.createFromTemplate).toHaveBeenCalledWith(
        'starship-456',
        'github-template',
        JSON.stringify(deploymentOptions.apiKeys)
      );

      // Verify Docker status was updated
      expect(mockMCPConnectorRepo.updateDockerStatus).toHaveBeenCalledWith(
        mockConnector.id,
        'pending',
        expect.any(Object)
      );

      // Verify deployment was called
      expect(mockDeployer.deploy).toHaveBeenCalledWith('starship-456', mockConnector);

      // Verify notifications were sent
      expect(notificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_started',
          connectorId: mockConnector.id,
          starshipId: 'starship-456'
        })
      );

      expect(notificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_success',
          connectorId: mockConnector.id,
          serviceName: 'mcp-starship-456-github'
        })
      );
    });

    it('should handle deployment failure gracefully', async () => {
      // Mock connector creation
      mockMCPConnectorRepo.createFromTemplate.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.updateDockerStatus.mockResolvedValue(mockConnector);

      // Mock deployment failure
      const deploymentResult: DeploymentResult = {
        success: false,
        serviceName: 'mcp-starship-456-github',
        errorMessage: 'Docker daemon not available',
        deploymentTime: 2000
      };
      mockDeployer.deploy.mockResolvedValue(deploymentResult);

      const result = await service.handleMCPServerSelection(deploymentOptions);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Docker daemon not available');
      expect(result.rollbackRequired).toBe(true);
      expect(result.connectorId).toBe(mockConnector.id);

      // Verify error status was set
      expect(mockMCPConnectorRepo.updateDockerStatus).toHaveBeenCalledWith(
        mockConnector.id,
        'error',
        expect.objectContaining({
          errorMessage: 'Docker daemon not available'
        })
      );

      // Verify failure notification was sent
      expect(notificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'deployment_failed',
          connectorId: mockConnector.id,
          message: expect.stringContaining('Docker daemon not available')
        })
      );
    });

    it('should handle connector creation failure', async () => {
      // Mock connector creation failure
      mockMCPConnectorRepo.createFromTemplate.mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await service.handleMCPServerSelection(deploymentOptions);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBe('Database connection failed');
      expect(result.rollbackRequired).toBe(true);

      // Verify deployment was not attempted
      expect(mockDeployer.deploy).not.toHaveBeenCalled();
    });

    it('should start health monitoring after successful deployment', async () => {
      // Mock successful deployment
      mockMCPConnectorRepo.createFromTemplate.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.updateDockerStatus.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.updateDockerHealth.mockResolvedValue(mockConnector);
      mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);

      const deploymentResult: DeploymentResult = {
        success: true,
        serviceName: 'mcp-starship-456-github',
        containerId: 'container-abc123',
        networkName: 'starship-starship-456',
        deploymentTime: 5000
      };
      mockDeployer.deploy.mockResolvedValue(deploymentResult);
      mockDeployer.checkHealth.mockResolvedValue({ healthy: true, status: 'healthy' });

      await service.handleMCPServerSelection(deploymentOptions);

      // Wait for health check to be called (it's called immediately and then on interval)
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify health monitoring was started
      expect(mockDeployer.checkHealth).toHaveBeenCalledWith('starship-456', mockConnector.id);
    });
  });

  describe('rollbackDeployment', () => {
    it('should successfully rollback a deployment', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);
      mockDeployer.remove.mockResolvedValue(true);
      mockMCPConnectorRepo.delete.mockResolvedValue(undefined);

      const result = await service.rollbackDeployment('connector-123');

      expect(result).toBe(true);
      expect(mockDeployer.remove).toHaveBeenCalledWith('starship-456', 'connector-123');
      expect(mockMCPConnectorRepo.delete).toHaveBeenCalledWith('connector-123');
    });

    it('should handle rollback when connector not found', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(null);

      const result = await service.rollbackDeployment('nonexistent-connector');

      expect(result).toBe(false);
      expect(mockDeployer.remove).not.toHaveBeenCalled();
      expect(mockMCPConnectorRepo.delete).not.toHaveBeenCalled();
    });

    it('should handle rollback failure gracefully', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);
      mockDeployer.remove.mockRejectedValue(new Error('Container removal failed'));

      const result = await service.rollbackDeployment('connector-123');

      expect(result).toBe(false);
    });
  });

  describe('getDeploymentStatus', () => {
    it('should return deployment status for existing connector', async () => {
      const connectorWithDocker = {
        ...mockConnector,
        dockerStatus: 'running' as const,
        dockerHealthStatus: 'healthy' as const,
        dockerLastHealthCheck: '2025-01-25T10:05:00Z'
      };

      mockMCPConnectorRepo.findById.mockResolvedValue(connectorWithDocker);
      mockDeployer.getStatus.mockResolvedValue({
        connectorId: 'connector-123',
        status: 'running',
        healthStatus: 'healthy',
        lastUpdated: '2025-01-25T10:05:00Z'
      });

      const status = await service.getDeploymentStatus('connector-123');

      expect(status).toBeDefined();
      expect(status!.connectorId).toBe('connector-123');
      expect(status!.status).toBe('running');
      expect(status!.healthStatus).toBe('healthy');
      expect(status!.serviceName).toBe('mcp-starship-456-github');
    });

    it('should return null for non-existent connector', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(null);

      const status = await service.getDeploymentStatus('nonexistent-connector');

      expect(status).toBeNull();
    });

    it('should handle status retrieval errors', async () => {
      mockMCPConnectorRepo.findById.mockRejectedValue(new Error('Database error'));

      const status = await service.getDeploymentStatus('connector-123');

      expect(status).toBeNull();
    });
  });

  describe('health monitoring', () => {
    it('should perform health checks periodically', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);
      mockDeployer.checkHealth.mockResolvedValue({ healthy: true, status: 'healthy' });
      mockMCPConnectorRepo.updateDockerHealth.mockResolvedValue(mockConnector);

      // Start health monitoring
      await service['startHealthMonitoring']('connector-123');

      // Wait for first health check
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDeployer.checkHealth).toHaveBeenCalledWith('starship-456', 'connector-123');
      expect(mockMCPConnectorRepo.updateDockerHealth).toHaveBeenCalledWith('connector-123', {
        healthStatus: 'healthy',
        lastHealthCheck: expect.any(String)
      });
    });

    it('should handle health check failures', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);
      mockDeployer.checkHealth.mockRejectedValue(new Error('Health check failed'));

      // Start health monitoring
      await service['startHealthMonitoring']('connector-123');

      // Wait for health check attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify failure notification was sent
      expect(notificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'health_check_failed',
          connectorId: 'connector-123',
          message: expect.stringContaining('Health check failed')
        })
      );
    });

    it('should stop health monitoring', async () => {
      // Start monitoring first
      await service['startHealthMonitoring']('connector-123');
      
      // Stop monitoring
      await service.stopHealthMonitoring('connector-123');

      // Verify internal state is cleaned up
      expect(service['healthCheckIntervals'].has('connector-123')).toBe(false);
    });
  });

  describe('notifications', () => {
    it('should add and remove notification callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      service.addNotificationCallback(callback1);
      service.addNotificationCallback(callback2);

      // Send a test notification
      service['sendNotification']({
        type: 'deployment_started',
        connectorId: 'test',
        starshipId: 'test',
        message: 'test',
        timestamp: new Date().toISOString()
      });

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();

      // Remove one callback
      service.removeNotificationCallback(callback1);
      
      // Clear previous calls
      callback1.mockClear();
      callback2.mockClear();

      // Send another notification
      service['sendNotification']({
        type: 'deployment_success',
        connectorId: 'test',
        starshipId: 'test',
        message: 'test',
        timestamp: new Date().toISOString()
      });

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const faultyCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      service.addNotificationCallback(faultyCallback);

      // This should not throw
      expect(() => {
        service['sendNotification']({
          type: 'deployment_started',
          connectorId: 'test',
          starshipId: 'test',
          message: 'test',
          timestamp: new Date().toISOString()
        });
      }).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should cleanup all resources', async () => {
      const callback = jest.fn();
      service.addNotificationCallback(callback);
      await service['startHealthMonitoring']('connector-123');

      await service.cleanup();

      // Verify callbacks are cleared
      expect(service['notificationCallbacks'].length).toBe(0);
      
      // Verify health check intervals are cleared
      expect(service['healthCheckIntervals'].size).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid template IDs', async () => {
      const invalidOptions: DeploymentWorkflowOptions = {
        starshipId: 'starship-456',
        templateId: 'invalid-template',
        apiKeys: {},
        userId: 'user-789'
      };

      const result = await service.handleMCPServerSelection(invalidOptions);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No Docker service template found');
    });

    it('should handle missing connector data during health checks', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(null);

      // Start health monitoring
      await service['startHealthMonitoring']('nonexistent-connector');

      // Wait for health check attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should handle gracefully without crashing
      expect(notificationCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'health_check_failed',
          message: expect.stringContaining('Connector not found')
        })
      );
    });
  });
});