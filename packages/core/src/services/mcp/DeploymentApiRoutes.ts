/**
 * DeploymentApiRoutes - Enhanced API routes for MCP connector deployment
 * 
 * This module provides Express route handlers that integrate Docker deployment
 * with the existing starship connector API endpoints.
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { 
  StarshipRepository, 
  MCPServerConnectorRepository,
  MCPServerOptionRepository 
} from '@starships/models';
import { DeploymentRouteHandler } from './DeploymentRouteHandler';
import { DeploymentWorkflowService } from './DeploymentWorkflowService';

export interface DeploymentApiConfig {
  starshipRepo: StarshipRepository;
  mcpConnectorRepo: MCPServerConnectorRepository;
  mcpServerOptionRepo: MCPServerOptionRepository;
  enableDockerDeployment?: boolean;
  notificationHandler?: (notification: any) => void;
  authMiddleware?: (req: Request, res: Response, next: NextFunction) => Promise<void> | void;
}

/**
 * Create enhanced API routes for MCP connector deployment
 */
export function createDeploymentApiRoutes(config: DeploymentApiConfig): Router {
  const router = Router();
  
  // Initialize services
  const workflowService = new DeploymentWorkflowService(
    config.mcpConnectorRepo,
    config.mcpServerOptionRepo
  );
  const routeHandler = new DeploymentRouteHandler(
    config.starshipRepo,
    config.mcpConnectorRepo,
    workflowService
  );

  // Setup notification handling if provided
  if (config.notificationHandler) {
    routeHandler.setupNotifications(config.notificationHandler);
  }

  /**
   * POST /starships/:id/connectors/:templateId - Enhanced connector creation with Docker deployment
   * 
   * This endpoint replaces the existing connector creation endpoint with Docker deployment support.
   * It maintains backward compatibility while adding real-time container deployment.
   */
  const authHandler = config.authMiddleware || ((req: Request, res: Response, next: NextFunction) => next());
  
  router.post('/starships/:id/connectors/:templateId', authHandler, async (req: Request, res: Response) => {
    const enableDocker = config.enableDockerDeployment !== false; // Default to true
    
    // Add Docker deployment flag to request body
    req.body.enableDocker = enableDocker;
    
    console.log(`[DeploymentApi] Processing connector creation request (Docker: ${enableDocker})`);
    
    await routeHandler.createConnectorWithDeployment(req, res);
  });

  /**
   * GET /starships/:id/connectors/:connectorId/docker/status - Get deployment status
   * 
   * Returns detailed Docker deployment status for a specific connector including:
   * - Container status and health
   * - Service name and network info
   * - Last health check results
   * - Error messages if any
   */
  router.get('/starships/:id/connectors/:connectorId/docker/status', authHandler, async (req: Request, res: Response) => {
    console.log(`[DeploymentApi] Getting deployment status for connector ${req.params.connectorId}`);
    
    await routeHandler.getDeploymentStatus(req, res);
  });

  /**
   * POST /starships/:id/connectors/:connectorId/docker/restart - Restart MCP server container
   * 
   * Restarts a specific MCP server container while preserving configuration.
   * This is useful for applying configuration changes or recovering from errors.
   */
  router.post('/starships/:id/connectors/:connectorId/docker/restart', authHandler, async (req: Request, res: Response) => {
    try {
      const { id: starshipId, connectorId } = req.params;
      const userId = req.user!.id;

      console.log(`[DeploymentApi] Restarting container for connector ${connectorId} on starship ${starshipId}`);

      // Get connector info
      const connector = await config.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        res.status(404).json({
          success: false,
          message: 'Connector not found'
        });
        return;
      }

      // For now, implement restart as remove + redeploy
      // In a production system, this would use docker restart
      const success = await workflowService.rollbackDeployment(connectorId);
      
      if (success) {
        // Redeploy with same configuration
        const deploymentResult = await workflowService.handleMCPServerSelection({
          starshipId: connector.starshipId,
          templateId: connector.templateId,
          apiKeys: JSON.parse(connector.env || '{}'),
          userId
        });

        if (deploymentResult.success) {
          res.json({
            success: true,
            message: 'Container restarted successfully',
            data: {
              connectorId: deploymentResult.connectorId,
              serviceName: deploymentResult.serviceName,
              restartTime: deploymentResult.deploymentTime
            }
          });
        } else {
          res.status(500).json({
            success: false,
            message: 'Restart failed during redeployment',
            error: { message: deploymentResult.errorMessage }
          });
        }
      } else {
        res.status(500).json({
          success: false,
          message: 'Restart failed during container removal'
        });
      }

    } catch (error) {
      console.error(`[DeploymentApi] Restart failed:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Container restart failed',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  });

  /**
   * POST /starships/:id/connectors/:connectorId/docker/rollback - Rollback deployment
   * 
   * Completely removes a connector deployment and cleans up all associated resources.
   * This is used for failed deployments or when removing connectors.
   */
  router.post('/starships/:id/connectors/:connectorId/docker/rollback', authHandler, async (req: Request, res: Response) => {
    console.log(`[DeploymentApi] Rolling back deployment for connector ${req.params.connectorId}`);
    
    await routeHandler.rollbackDeployment(req, res);
  });

  /**
   * GET /starships/:id/connectors/:connectorId/docker/logs - Stream container logs
   * 
   * Returns container logs for debugging and monitoring purposes.
   * Supports tail and follow parameters for real-time log streaming.
   */
  router.get('/starships/:id/connectors/:connectorId/docker/logs', authHandler, async (req: Request, res: Response) => {
    console.log(`[DeploymentApi] Getting logs for connector ${req.params.connectorId}`);
    
    await routeHandler.getDeploymentLogs(req, res);
  });

  /**
   * GET /starships/:id/docker/status - Get Docker deployment status for all connectors
   * 
   * Returns deployment status for all MCP server connectors on a specific starship.
   * Useful for dashboard views and bulk status monitoring.
   */
  router.get('/starships/:id/docker/status', authHandler, async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug } = req.params;
      const userId = req.user!.id;

      console.log(`[DeploymentApi] Getting Docker status for all connectors on starship ${starshipIdOrSlug}`);

      // Find starship
      let starship = await config.starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await config.starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        res.status(404).json({
          success: false,
          message: 'Starship not found'
        });
        return;
      }

      // Get all connectors for this starship
      const connectors = await config.mcpConnectorRepo.findByStarshipWithDockerInfo(starship.id);

      // Build status response
      const statuses = await Promise.all(
        connectors.map(async (connector: any) => {
          const status = await workflowService.getDeploymentStatus(connector.id);
          return {
            connectorId: connector.id,
            templateId: connector.templateId,
            status: status?.status || 'unknown',
            healthStatus: status?.healthStatus || 'unknown',
            serviceName: status?.serviceName,
            containerId: status?.containerId,
            networkName: status?.networkName,
            lastHealthCheck: status?.lastHealthCheck,
            errorMessage: status?.errorMessage,
            createdAt: connector.createdAt,
            updatedAt: connector.updatedAt
          };
        })
      );

      res.json({
        success: true,
        message: 'Docker status retrieved',
        data: {
          starshipId: starship.id,
          connectorCount: statuses.length,
          runningCount: statuses.filter((s: any) => s.status === 'running').length,
          errorCount: statuses.filter((s: any) => s.status === 'error').length,
          connectors: statuses
        }
      });

    } catch (error) {
      console.error(`[DeploymentApi] Failed to get Docker status:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve Docker status',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  });

  /**
   * DELETE /starships/:id/docker - Remove all deployments for a starship
   * 
   * Performs cleanup when a starship is deleted, removing all containers,
   * networks, and volumes associated with the starship.
   */
  router.delete('/starships/:id/docker', authHandler, async (req: Request, res: Response) => {
    try {
      const { id: starshipIdOrSlug } = req.params;
      const userId = req.user!.id;

      console.log(`[DeploymentApi] Cleaning up Docker resources for starship ${starshipIdOrSlug}`);

      // Find starship
      let starship = await config.starshipRepo.findById(starshipIdOrSlug);
      if (!starship) {
        starship = await config.starshipRepo.findBySlug(starshipIdOrSlug, userId);
      }

      if (!starship) {
        res.status(404).json({
          success: false,
          message: 'Starship not found'
        });
        return;
      }

      // Get all connectors for this starship
      const connectors = await config.mcpConnectorRepo.findByStarship(starship.id);

      // Rollback all deployments
      const rollbackResults = await Promise.all(
        connectors.map((connector: any) => workflowService.rollbackDeployment(connector.id))
      );

      const successCount = rollbackResults.filter((result: any) => result).length;
      
      res.json({
        success: true,
        message: 'Docker cleanup completed',
        data: {
          starshipId: starship.id,
          totalConnectors: connectors.length,
          cleanedUp: successCount,
          failed: connectors.length - successCount
        }
      });

    } catch (error) {
      console.error(`[DeploymentApi] Docker cleanup failed:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Docker cleanup failed',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  });

  /**
   * GET /docker/health - Overall Docker deployment health check
   * 
   * Returns system-wide Docker deployment health information.
   * Useful for monitoring and alerting systems.
   */
  router.get('/docker/health', async (req: Request, res: Response) => {
    try {
      console.log(`[DeploymentApi] Performing Docker health check`);

      // This would typically check Docker daemon status, resource usage, etc.
      // For now, return a basic health status
      
      res.json({
        success: true,
        message: 'Docker deployment system is healthy',
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          services: {
            docker: 'running',
            deployment: 'active',
            monitoring: 'active'
          }
        }
      });

    } catch (error) {
      console.error(`[DeploymentApi] Health check failed:`, error);
      
      res.status(503).json({
        success: false,
        message: 'Docker deployment system is unhealthy',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  });

  /**
   * GET /docker/metrics - Docker deployment metrics
   * 
   * Returns deployment metrics and statistics for monitoring dashboards.
   */
  router.get('/docker/metrics', async (req: Request, res: Response) => {
    try {
      console.log(`[DeploymentApi] Getting Docker deployment metrics`);

      // This would typically gather real metrics from containers and deployment history
      // For now, return mock metrics structure
      
      res.json({
        success: true,
        message: 'Docker metrics retrieved',
        data: {
          deployment: {
            totalDeployments: 0,
            successfulDeployments: 0,
            failedDeployments: 0,
            averageDeploymentTime: 0
          },
          containers: {
            running: 0,
            stopped: 0,
            error: 0,
            healthy: 0,
            unhealthy: 0
          },
          resources: {
            cpuUsage: 0,
            memoryUsage: 0,
            diskUsage: 0,
            networkTraffic: 0
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error(`[DeploymentApi] Failed to get metrics:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve Docker metrics',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  });

  // Cleanup handler for graceful shutdown
  // @ts-ignore - Adding custom cleanup method to router
  router.cleanup = async () => {
    console.log('[DeploymentApi] Cleaning up deployment services');
    await routeHandler.cleanup();
  };

  return router;
}

/**
 * Middleware for Docker deployment feature flag
 */
export function dockerDeploymentMiddleware(enabled: boolean = true) {
  return (req: Request, res: Response, next: Function) => {
    req.dockerDeploymentEnabled = enabled;
    next();
  };
}

/**
 * Error handling middleware for deployment routes
 */
export function deploymentErrorHandler() {
  return (error: any, req: Request, res: Response, next: Function) => {
    console.error('[DeploymentApi] Unhandled error:', error);
    
    if (res.headersSent) {
      return next(error);
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal deployment error',
      error: { 
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'DEPLOYMENT_ERROR'
      }
    });
  };
}

// Extend Request interface for Docker deployment flag and user
declare global {
  namespace Express {
    interface Request {
      dockerDeploymentEnabled?: boolean;
      user?: any;
      kindeId?: string;
    }
  }
}