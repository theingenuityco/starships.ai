/**
 * DeploymentRouteHandler - Enhanced route handlers for MCP connector deployment
 * 
 * This module provides route handlers that integrate the deployment workflow
 * with the existing API endpoints for a seamless deployment experience.
 */

import type { Request, Response } from 'express';
import type { MCPServerConnectorRepository, StarshipRepository } from '@starships/models';
import { 
  EnhancedValidationError as ValidationError,
  EnhancedNotFoundError as NotFoundError 
} from '@starships/models';
import { DeploymentWorkflowService, WorkflowResult } from './DeploymentWorkflowService';

export interface DeploymentRequest {
  starshipId: string;
  templateId: string;
  env: Record<string, string>;
  userId: string;
  enableDocker?: boolean; // Feature flag for Docker deployment
}

export interface DeploymentResponse {
  success: boolean;
  message: string;
  data: {
    connectorId: string;
    starshipId: string;
    templateId: string;
    serviceName?: string;
    status: string;
    deploymentTime?: number;
    dockerInfo?: {
      containerName?: string;
      networkName?: string;
      healthStatus?: string;
    };
  };
  error?: {
    message: string;
    rollbackRequired?: boolean;
  };
}

/**
 * Enhanced deployment route handler
 */
export class DeploymentRouteHandler {
  private workflowService: DeploymentWorkflowService;
  private starshipRepo: StarshipRepository;
  private mcpConnectorRepo: MCPServerConnectorRepository;

  constructor(
    starshipRepo: StarshipRepository,
    mcpConnectorRepo: MCPServerConnectorRepository,
    workflowService?: DeploymentWorkflowService
  ) {
    this.starshipRepo = starshipRepo;
    this.mcpConnectorRepo = mcpConnectorRepo;
    this.workflowService = workflowService || new DeploymentWorkflowService(mcpConnectorRepo);
  }

  /**
   * Enhanced connector creation handler with Docker deployment
   */
  async createConnectorWithDeployment(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { id: starshipIdOrSlug, templateId } = req.params;
      const userId = req.user!.id;
      const { env, enableDocker = true } = req.body;

      console.log(`[DeploymentRouteHandler] Processing deployment request for ${templateId} on ${starshipIdOrSlug}`);
      console.log(`[DeploymentRouteHandler] Docker deployment: ${enableDocker ? 'enabled' : 'disabled'}`);

      // Validate input parameters
      const validationResult = this.validateDeploymentRequest({
        starshipId: starshipIdOrSlug,
        templateId,
        env: env || {},
        userId,
        enableDocker
      });

      if (!validationResult.isValid) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          error: { message: validationResult.error! }
        });
        return;
      }

      // Find starship by ID or slug
      const starship = await this.findStarship(starshipIdOrSlug, userId);
      if (!starship) {
        res.status(404).json({
          success: false,
          message: 'Starship not found',
          error: { message: `Starship ${starshipIdOrSlug} not found or access denied` }
        });
        return;
      }

      // Check if Docker deployment is enabled
      if (enableDocker) {
        // Use new Docker deployment workflow
        const workflowResult = await this.workflowService.handleMCPServerSelection({
          starshipId: starship.id,
          templateId,
          apiKeys: env || {},
          userId
        });

        const response = this.buildDeploymentResponse(workflowResult, {
          starshipId: starship.id,
          templateId,
          deploymentTime: Date.now() - startTime
        });

        const statusCode = workflowResult.success ? 201 : 500;
        res.status(statusCode).json(response);
      } else {
        // Fallback to legacy connector creation (without Docker)
        console.log(`[DeploymentRouteHandler] Using legacy connector creation for ${templateId}`);
        
        const connector = await this.mcpConnectorRepo.createFromTemplate(
          starship.id,
          templateId,
          JSON.stringify(env || {})
        );

        res.status(201).json({
          success: true,
          message: 'Connector created successfully (legacy mode)',
          data: {
            connectorId: connector.id,
            starshipId: starship.id,
            templateId,
            status: connector.status,
            deploymentTime: Date.now() - startTime
          }
        });
      }

    } catch (error) {
      console.error(`[DeploymentRouteHandler] Deployment failed:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown deployment error';
      
      res.status(500).json({
        success: false,
        message: 'Deployment failed',
        error: { 
          message: errorMessage,
          rollbackRequired: true 
        }
      });
    }
  }

  /**
   * Get deployment status for a connector
   */
  async getDeploymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { connectorId } = req.params;
      const userId = req.user!.id;

      if (!connectorId) {
        res.status(400).json({
          success: false,
          message: 'Connector ID is required'
        });
        return;
      }

      // Get deployment status from workflow service
      const status = await this.workflowService.getDeploymentStatus(connectorId);
      
      if (!status) {
        res.status(404).json({
          success: false,
          message: 'Deployment status not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Deployment status retrieved',
        data: {
          connectorId,
          status: status.status,
          healthStatus: status.healthStatus,
          serviceName: status.serviceName,
          containerId: status.containerId,
          networkName: status.networkName,
          lastHealthCheck: status.lastHealthCheck,
          lastUpdated: status.lastUpdated,
          errorMessage: status.errorMessage
        }
      });

    } catch (error) {
      console.error(`[DeploymentRouteHandler] Failed to get deployment status:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve deployment status',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  /**
   * Rollback a deployment
   */
  async rollbackDeployment(req: Request, res: Response): Promise<void> {
    try {
      const { connectorId } = req.params;
      const userId = req.user!.id;
      const { reason } = req.body;

      console.log(`[DeploymentRouteHandler] Rolling back deployment for connector ${connectorId}, reason: ${reason}`);

      if (!connectorId) {
        res.status(400).json({
          success: false,
          message: 'Connector ID is required'
        });
        return;
      }

      // Perform rollback using workflow service
      const rollbackResult = await this.workflowService.rollbackDeployment(connectorId);

      if (rollbackResult) {
        res.json({
          success: true,
          message: 'Deployment rolled back successfully',
          data: {
            connectorId,
            rolledBack: true,
            reason: reason || 'Manual rollback'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Rollback failed',
          error: { message: 'Failed to rollback deployment' }
        });
      }

    } catch (error) {
      console.error(`[DeploymentRouteHandler] Rollback failed:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Rollback failed',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  /**
   * Get deployment logs for a connector
   */
  async getDeploymentLogs(req: Request, res: Response): Promise<void> {
    try {
      const { connectorId } = req.params;
      const { tail = 100, follow = false } = req.query;

      if (!connectorId) {
        res.status(400).json({
          success: false,
          message: 'Connector ID is required'
        });
        return;
      }

      // Get connector to find starship
      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        res.status(404).json({
          success: false,
          message: 'Connector not found'
        });
        return;
      }

      // For now, return a placeholder response
      // In a real implementation, this would stream logs from the container
      res.json({
        success: true,
        message: 'Deployment logs retrieved',
        data: {
          connectorId,
          logs: [
            `[${new Date().toISOString()}] Deployment started for ${connector.templateId}`,
            `[${new Date().toISOString()}] Container created: ${connector.dockerServiceName}`,
            `[${new Date().toISOString()}] Network attached: ${connector.dockerNetworkName}`,
            `[${new Date().toISOString()}] Health check: ${connector.dockerHealthStatus}`,
            `[${new Date().toISOString()}] Deployment status: ${connector.dockerStatus}`
          ],
          tail: Number(tail),
          follow: Boolean(follow)
        }
      });

    } catch (error) {
      console.error(`[DeploymentRouteHandler] Failed to get deployment logs:`, error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve deployment logs',
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  /**
   * Validate deployment request parameters
   */
  private validateDeploymentRequest(request: DeploymentRequest): { isValid: boolean; error?: string } {
    if (!request.starshipId || request.starshipId.trim().length === 0) {
      return { isValid: false, error: 'Starship ID is required' };
    }

    if (!request.templateId || request.templateId.trim().length === 0) {
      return { isValid: false, error: 'Template ID is required' };
    }

    if (!request.userId || request.userId.trim().length === 0) {
      return { isValid: false, error: 'User ID is required' };
    }

    // Validate UUID format for templateId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(request.templateId)) {
      return { isValid: false, error: 'Template ID must be a valid UUID format' };
    }

    return { isValid: true };
  }

  /**
   * Find starship by ID or slug
   */
  private async findStarship(starshipIdOrSlug: string, userId: string) {
    // Try to find by ID first
    let starship = await this.starshipRepo.findById(starshipIdOrSlug);
    
    // If not found, try to find by slug
    if (!starship) {
      starship = await this.starshipRepo.findBySlug(starshipIdOrSlug, userId);
    }
    
    return starship;
  }

  /**
   * Build deployment response from workflow result
   */
  private buildDeploymentResponse(
    workflowResult: WorkflowResult, 
    context: { starshipId: string; templateId: string; deploymentTime: number }
  ): DeploymentResponse {
    if (workflowResult.success) {
      return {
        success: true,
        message: 'MCP server deployed successfully',
        data: {
          connectorId: workflowResult.connectorId!,
          starshipId: context.starshipId,
          templateId: context.templateId,
          serviceName: workflowResult.serviceName,
          status: 'running',
          deploymentTime: workflowResult.deploymentTime,
          dockerInfo: {
            containerName: workflowResult.serviceName,
            networkName: `starship-${context.starshipId}`,
            healthStatus: 'starting'
          }
        }
      };
    } else {
      return {
        success: false,
        message: 'Deployment failed',
        data: {
          connectorId: workflowResult.connectorId || 'unknown',
          starshipId: context.starshipId,
          templateId: context.templateId,
          status: 'error',
          deploymentTime: workflowResult.deploymentTime
        },
        error: {
          message: workflowResult.errorMessage || 'Unknown deployment error',
          rollbackRequired: workflowResult.rollbackRequired || false
        }
      };
    }
  }

  /**
   * Setup notification handling for real-time updates
   */
  setupNotifications(callback: (notification: any) => void): void {
    this.workflowService.addNotificationCallback((notification) => {
      // Transform notification for API response
      const apiNotification = {
        type: notification.type,
        connectorId: notification.connectorId,
        starshipId: notification.starshipId,
        serviceName: notification.serviceName,
        message: notification.message,
        timestamp: notification.timestamp,
        metadata: notification.metadata
      };
      
      callback(apiNotification);
    });
  }

  /**
   * Cleanup handler
   */
  async cleanup(): Promise<void> {
    await this.workflowService.cleanup();
  }
}