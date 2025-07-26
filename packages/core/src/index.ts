/**
 * @starships/core - Core services for MCP dockerization
 */

// Main MCP services
export { MCPDeployer } from './services/mcp/MCPDeployer';
export { DockerComposeDeployer } from './services/mcp/DockerComposeDeployer';
export { DockerComposeGenerator } from './services/mcp/DockerComposeGenerator';
export { ComposeFileManager } from './services/mcp/ComposeFileManager';
export { DeploymentWorkflowService } from './services/mcp/DeploymentWorkflowService';
export { MCPProtocolHandler } from './services/mcp/MCPProtocolHandler';
export { HealthMonitorService } from './services/mcp/HealthMonitorService';
export { LogAggregator } from './services/mcp/LogAggregator';
export { ResourceManager } from './services/mcp/ResourceManager';
export { BackupRecoveryService } from './services/mcp/BackupRecoveryService';
export { NetworkBandwidthManager } from './services/mcp/NetworkBandwidthManager';
export { VolumeManager } from './services/mcp/VolumeManager';
export { SecurityManager } from './services/mcp/SecurityManager';
export { NetworkCleanupService } from './services/mcp/NetworkCleanupService';
export { ConnectorMigrationService, connectorMigrationService } from './services/mcp/ConnectorMigrationService';

// API Routes
export { createDeploymentApiRoutes } from './services/mcp/DeploymentApiRoutes';

// Export core types that actually exist
export type {
  DeploymentResult
} from './services/mcp/MCPDeployer';

export type {
  DockerService,
  HealthCheck
} from './services/mcp/DockerComposeGenerator';

export type {
  ResourceLimits
} from './services/mcp/DockerServiceTemplate';

export type {
  WorkflowResult
} from './services/mcp/DeploymentWorkflowService';

export type {
  LogEntry
} from './services/mcp/LogAggregator';

export type {
  ResourceConfig
} from './services/mcp/ResourceManager';

export type {
  BackupConfig,
  RecoveryPlan
} from './services/mcp/BackupRecoveryService';

export type {
  BandwidthConfig
} from './services/mcp/NetworkBandwidthManager';

export type {
  DockerServiceTemplate
} from './services/mcp/DockerServiceTemplate';

export type {
  MigrationOptions,
  MigrationResult,
  MigrationStatus
} from './services/mcp/ConnectorMigrationService';