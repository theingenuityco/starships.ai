import request from 'supertest';
import express from 'express';
import { createDeploymentApiRoutes, dockerDeploymentMiddleware, deploymentErrorHandler } from '../DeploymentApiRoutes';
import { DeploymentWorkflowService } from '../DeploymentWorkflowService';
import { MCPServerConnector } from '@starships/models';

// Mock dependencies
jest.mock('../DeploymentWorkflowService');
jest.mock('@starships/models');

const mockStarshipRepo = {
  findById: jest.fn(),
  findBySlug: jest.fn(),
};

const mockMCPConnectorRepo = {
  createFromTemplate: jest.fn(),
  findById: jest.fn(),
  findByStarshipId: jest.fn(),
  findByStarshipWithDockerInfo: jest.fn(),
};

const mockMCPServerOptionRepo = {
  findAll: jest.fn(),
  findById: jest.fn(),
};

const mockWorkflowService = {
  handleMCPServerSelection: jest.fn(),
  getDeploymentStatus: jest.fn(),
  rollbackDeployment: jest.fn(),
  cleanup: jest.fn(),
} as jest.Mocked<DeploymentWorkflowService>;

// Mock auth middleware
const mockAuthMiddleware = (req: any, res: any, next: any) => {
  req.user = { id: 'user-123' };
  next();
};

describe('DeploymentApiRoutes', () => {
  let app: express.Application;

  const mockStarship = {
    id: 'starship-456',
    slug: 'test-starship',
    userId: 'user-123',
    name: 'Test Starship',
    class: 'scout',
    status: 'active'
  };

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
    dockerStatus: 'running',
    dockerServiceName: 'mcp-starship-456-github',
    dockerNetworkName: 'starship-starship-456',
    dockerContainerId: 'container-abc123',
    dockerHealthStatus: 'healthy'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    app = express();
    app.use(express.json());
    app.use(mockAuthMiddleware);
    app.use(dockerDeploymentMiddleware(true));
    
    const router = createDeploymentApiRoutes({
      starshipRepo: mockStarshipRepo as any,
      mcpConnectorRepo: mockMCPConnectorRepo as any,
      mcpServerOptionRepo: mockMCPServerOptionRepo as any,
      enableDockerDeployment: true
    });
    
    app.use('/api', router);
    app.use(deploymentErrorHandler());

    // Setup default mocks
    mockStarshipRepo.findById.mockResolvedValue(mockStarship);
    mockMCPConnectorRepo.findById.mockResolvedValue(mockConnector);
  });

  describe('POST /starships/:id/connectors/:templateId', () => {
    it('should create connector with Docker deployment', async () => {
      mockWorkflowService.handleMCPServerSelection.mockResolvedValue({
        success: true,
        connectorId: 'connector-123',
        serviceName: 'mcp-starship-456-github',
        deploymentTime: 5000
      });

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/github-template')
        .send({
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token'
          }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connectorId).toBe('connector-123');
      expect(response.body.data.serviceName).toBe('mcp-starship-456-github');
    });

    it('should handle deployment failures', async () => {
      mockWorkflowService.handleMCPServerSelection.mockResolvedValue({
        success: false,
        errorMessage: 'Docker daemon not available',
        rollbackRequired: true,
        deploymentTime: 2000
      });

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/github-template')
        .send({
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token'
          }
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe('Docker daemon not available');
      expect(response.body.error.rollbackRequired).toBe(true);
    });

    it('should handle starship not found', async () => {
      mockStarshipRepo.findById.mockResolvedValue(null);
      mockStarshipRepo.findBySlug.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/starships/nonexistent/connectors/github-template')
        .send({
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_test_token'
          }
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Starship not found');
    });

    it('should validate required parameters', async () => {
      const response = await request(app)
        .post('/api/starships/starship-456/connectors/github-template')
        .send({}); // Missing env

      expect(response.status).toBe(201); // Should still work with empty env
    });
  });

  describe('GET /starships/:id/connectors/:connectorId/docker/status', () => {
    it('should return deployment status', async () => {
      mockWorkflowService.getDeploymentStatus.mockResolvedValue({
        connectorId: 'connector-123',
        status: 'running',
        healthStatus: 'healthy',
        serviceName: 'mcp-starship-456-github',
        containerId: 'container-abc123',
        networkName: 'starship-starship-456',
        lastHealthCheck: '2025-01-25T10:05:00Z',
        lastUpdated: '2025-01-25T10:05:00Z'
      });

      const response = await request(app)
        .get('/api/starships/starship-456/connectors/connector-123/docker/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connectorId).toBe('connector-123');
      expect(response.body.data.status).toBe('running');
      expect(response.body.data.healthStatus).toBe('healthy');
    });

    it('should handle connector not found', async () => {
      mockWorkflowService.getDeploymentStatus.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/starships/starship-456/connectors/nonexistent/docker/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Deployment status not found');
    });
  });

  describe('POST /starships/:id/connectors/:connectorId/docker/restart', () => {
    it('should restart connector successfully', async () => {
      mockWorkflowService.rollbackDeployment.mockResolvedValue(true);
      mockWorkflowService.handleMCPServerSelection.mockResolvedValue({
        success: true,
        connectorId: 'connector-123',
        serviceName: 'mcp-starship-456-github',
        deploymentTime: 3000
      });

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/connector-123/docker/restart');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connectorId).toBe('connector-123');
      expect(response.body.data.serviceName).toBe('mcp-starship-456-github');
    });

    it('should handle restart failure during removal', async () => {
      mockWorkflowService.rollbackDeployment.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/connector-123/docker/restart');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Restart failed during container removal');
    });

    it('should handle restart failure during redeployment', async () => {
      mockWorkflowService.rollbackDeployment.mockResolvedValue(true);
      mockWorkflowService.handleMCPServerSelection.mockResolvedValue({
        success: false,
        errorMessage: 'Redeployment failed',
        deploymentTime: 1000
      });

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/connector-123/docker/restart');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Restart failed during redeployment');
    });
  });

  describe('POST /starships/:id/connectors/:connectorId/docker/rollback', () => {
    it('should rollback deployment successfully', async () => {
      mockWorkflowService.rollbackDeployment.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/connector-123/docker/rollback')
        .send({ reason: 'Manual rollback' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rolledBack).toBe(true);
      expect(response.body.data.reason).toBe('Manual rollback');
    });

    it('should handle rollback failure', async () => {
      mockWorkflowService.rollbackDeployment.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/connector-123/docker/rollback');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Rollback failed');
    });
  });

  describe('GET /starships/:id/connectors/:connectorId/docker/logs', () => {
    it('should return deployment logs', async () => {
      const response = await request(app)
        .get('/api/starships/starship-456/connectors/connector-123/docker/logs')
        .query({ tail: 50 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.connectorId).toBe('connector-123');
      expect(response.body.data.logs).toBeDefined();
      expect(Array.isArray(response.body.data.logs)).toBe(true);
    });

    it('should handle connector not found for logs', async () => {
      mockMCPConnectorRepo.findById.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/starships/starship-456/connectors/nonexistent/docker/logs');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Connector not found');
    });
  });

  describe('GET /starships/:id/docker/status', () => {
    it('should return Docker status for all connectors', async () => {
      const mockConnectors = [mockConnector];
      mockMCPConnectorRepo.findByStarshipWithDockerInfo.mockResolvedValue(mockConnectors);
      mockWorkflowService.getDeploymentStatus.mockResolvedValue({
        connectorId: 'connector-123',
        status: 'running',
        healthStatus: 'healthy',
        serviceName: 'mcp-starship-456-github',
        lastUpdated: '2025-01-25T10:05:00Z'
      });

      const response = await request(app)
        .get('/api/starships/starship-456/docker/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.starshipId).toBe('starship-456');
      expect(response.body.data.connectorCount).toBe(1);
      expect(response.body.data.runningCount).toBe(1);
      expect(response.body.data.connectors).toHaveLength(1);
    });

    it('should handle starship not found for status', async () => {
      mockStarshipRepo.findById.mockResolvedValue(null);
      mockStarshipRepo.findBySlug.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/starships/nonexistent/docker/status');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Starship not found');
    });
  });

  describe('DELETE /starships/:id/docker', () => {
    it('should cleanup all Docker resources for starship', async () => {
      const mockConnectors = [mockConnector];
      mockMCPConnectorRepo.findByStarshipId.mockResolvedValue(mockConnectors);
      mockWorkflowService.rollbackDeployment.mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/starships/starship-456/docker');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.starshipId).toBe('starship-456');
      expect(response.body.data.totalConnectors).toBe(1);
      expect(response.body.data.cleanedUp).toBe(1);
      expect(response.body.data.failed).toBe(0);
    });

    it('should handle partial cleanup failures', async () => {
      const mockConnectors = [mockConnector, { ...mockConnector, id: 'connector-456' }];
      mockMCPConnectorRepo.findByStarshipId.mockResolvedValue(mockConnectors);
      mockWorkflowService.rollbackDeployment
        .mockResolvedValueOnce(true)  // First connector succeeds
        .mockResolvedValueOnce(false); // Second connector fails

      const response = await request(app)
        .delete('/api/starships/starship-456/docker');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalConnectors).toBe(2);
      expect(response.body.data.cleanedUp).toBe(1);
      expect(response.body.data.failed).toBe(1);
    });
  });

  describe('GET /docker/health', () => {
    it('should return Docker system health', async () => {
      const response = await request(app)
        .get('/api/docker/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.services).toBeDefined();
    });
  });

  describe('GET /docker/metrics', () => {
    it('should return Docker deployment metrics', async () => {
      const response = await request(app)
        .get('/api/docker/metrics');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.deployment).toBeDefined();
      expect(response.body.data.containers).toBeDefined();
      expect(response.body.data.resources).toBeDefined();
    });
  });

  describe('Middleware', () => {
    it('should set Docker deployment flag', () => {
      const middleware = dockerDeploymentMiddleware(true);
      const req = {} as any;
      const res = {} as any;
      const next = jest.fn();

      middleware(req, res, next);

      expect(req.dockerDeploymentEnabled).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should handle deployment errors', () => {
      const errorHandler = deploymentErrorHandler();
      const error = new Error('Test deployment error');
      const req = {} as any;
      const res = {
        headersSent: false,
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;
      const next = jest.fn();

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Internal deployment error',
        error: {
          message: 'Test deployment error',
          code: 'DEPLOYMENT_ERROR'
        }
      });
    });

    it('should skip error handling if headers already sent', () => {
      const errorHandler = deploymentErrorHandler();
      const error = new Error('Test error');
      const req = {} as any;
      const res = { headersSent: true } as any;
      const next = jest.fn();

      errorHandler(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('Error handling', () => {
    it('should handle validation errors', async () => {
      const response = await request(app)
        .post('/api/starships//connectors/github-template') // Empty starship ID
        .send({});

      expect(response.status).toBe(404); // Express router will return 404 for invalid route
    });

    it('should handle internal errors', async () => {
      mockWorkflowService.handleMCPServerSelection.mockRejectedValue(new Error('Internal error'));

      const response = await request(app)
        .post('/api/starships/starship-456/connectors/github-template')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Deployment failed');
    });
  });
});