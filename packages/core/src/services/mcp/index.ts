/**
 * MCP Deployment Services
 * 
 * This module provides services for deploying and managing MCP server containers
 */

export { MCPDeployer } from './MCPDeployer';
export type { 
  DeploymentStatus, 
  DeploymentResult, 
  NetworkConfig 
} from './MCPDeployer';

export { DockerComposeDeployer } from './DockerComposeDeployer';

export { 
  DockerServiceTemplate,
  VolumeMapping,
  HealthCheck,
  ResourceLimits,
  getDockerServiceTemplate,
  getAllDockerServiceTemplates,
  hasDockerServiceTemplate,
  getFileAccessTemplates,
  getCredentialTemplates,
  buildVolumeMapping,
  getDefaultResourceLimits,
  validateTemplate,
  getTemplateStats,
  DOCKER_SERVICE_TEMPLATES 
} from './DockerServiceTemplate';

export { 
  DeploymentWorkflowService,
  DeploymentWorkflowOptions,
  WorkflowResult,
  DeploymentNotification
} from './DeploymentWorkflowService';

export {
  DeploymentRouteHandler,
  DeploymentRequest,
  DeploymentResponse
} from './DeploymentRouteHandler';

// Re-export for convenience
export * from './MCPDeployer';