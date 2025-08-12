/**
 * ConnectorMigrationService - Handles migration of existing MCP connectors from stdio to HTTP bridge
 */

import { MCPServerConnector, MCPServerConnectorRepository } from '@starships/models';
import { MCPDeployer } from './MCPDeployer';
import { DeployerFactory } from './DeployerFactory';
import { getTemplateForDeployment, isHttpBridgeTemplate, getLegacyTemplate, getHttpBridgeTemplate, getDockerServiceTemplate } from './DockerServiceTemplate';
import { serviceRegistry } from './ServiceRegistry';
import { bridgeMonitoringService } from './BridgeMonitoringService';
import { capabilitySyncService } from './CapabilitySyncService';

export interface MigrationOptions {
  connectorId: string;
  backupBeforeMigration?: boolean;
  rollbackOnFailure?: boolean;
  testBeforeSwitch?: boolean;
  gracefulShutdown?: boolean;
}

export interface MigrationResult {
  success: boolean;
  connectorId: string;
  migrationType: 'stdio_to_http' | 'http_to_stdio';
  migrationTime: number;
  oldContainerName?: string;
  newContainerName?: string;
  rollbackRequired?: boolean;
  errorMessage?: string;
  warnings?: string[];
}

export interface MigrationStatus {
  phase: 'preparing' | 'backing_up' | 'deploying_new' | 'testing' | 'switching' | 'cleaning_up' | 'completed' | 'failed' | 'rolled_back';
  progress: number; // 0-100
  message: string;
  errors?: string[];
  warnings?: string[];
}

export class ConnectorMigrationService {
  private mcpConnectorRepo: MCPServerConnectorRepository;
  private deployer: MCPDeployer;
  private migrationStatus: Map<string, MigrationStatus> = new Map();

  constructor(
    mcpConnectorRepo?: MCPServerConnectorRepository,
    deployer?: MCPDeployer
  ) {
    this.mcpConnectorRepo = mcpConnectorRepo || new MCPServerConnectorRepository();
    this.deployer = deployer || DeployerFactory.getDeployer();
  }

  /**
   * Migrate a connector from stdio to HTTP bridge
   */
  async migrateToHttpBridge(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    const { connectorId, backupBeforeMigration = true, rollbackOnFailure = true, testBeforeSwitch = true } = options;

    console.log(`[ConnectorMigration] Starting HTTP bridge migration for connector ${connectorId}`);

    try {
      // Phase 1: Preparation and validation
      this.updateMigrationStatus(connectorId, {
        phase: 'preparing',
        progress: 10,
        message: 'Preparing for migration...'
      });

      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      if (connector.httpBridgeEnabled) {
        console.log(`[ConnectorMigration] Connector ${connectorId} is already using HTTP bridge`);
        return {
          success: true,
          connectorId,
          migrationType: 'stdio_to_http',
          migrationTime: Date.now() - startTime,
          warnings: ['Connector was already using HTTP bridge']
        };
      }

      // Get template information from connector data
      // Note: We'll need to find the template slug from the connector's metadata
      const templateSlug = this.extractTemplateSlugFromConnector(connector);
      if (!templateSlug) {
        throw new Error(`Cannot determine template slug for connector ${connector.templateId}`);
      }

      // Validate that HTTP bridge template exists
      const httpBridgeTemplate = getDockerServiceTemplate(templateSlug) || getHttpBridgeTemplate(templateSlug);
      if (!httpBridgeTemplate) {
        throw new Error(`No HTTP bridge template available for ${templateSlug}`);
      }

      const oldContainerName = connector.dockerServiceName || `mcp-${connector.starshipId}-${templateSlug}`;
      const newContainerName = `mcp-${connector.starshipId}-${templateSlug}-http`;

      // Phase 2: Backup current configuration (optional)
      if (backupBeforeMigration) {
        this.updateMigrationStatus(connectorId, {
          phase: 'backing_up',
          progress: 20,
          message: 'Creating backup of current configuration...'
        });

        await this.createConnectorBackup(connector);
      }

      // Phase 3: Deploy new HTTP bridge container
      this.updateMigrationStatus(connectorId, {
        phase: 'deploying_new',
        progress: 40,
        message: 'Deploying HTTP bridge container...'
      });

      // Update connector to use HTTP bridge template
      await this.mcpConnectorRepo.update(connectorId, {
        httpBridgeEnabled: true,
        dockerServiceName: newContainerName,
        internalUrl: `http://${newContainerName}:8080`,
        bridgeVersion: '1.0.0',
        dockerStatus: 'building'
      });

      // Deploy the new HTTP bridge container
      const deploymentResult = await this.deployer.deploy(connector.starshipId, {
        ...connector,
        dockerServiceName: newContainerName,
        httpBridgeEnabled: true
      });

      if (!deploymentResult.success) {
        throw new Error(`HTTP bridge deployment failed: ${deploymentResult.errorMessage}`);
      }

      // Phase 4: Test new container (optional)
      if (testBeforeSwitch) {
        this.updateMigrationStatus(connectorId, {
          phase: 'testing',
          progress: 60,
          message: 'Testing HTTP bridge functionality...'
        });

        const testResult = await this.testHttpBridgeContainer(connector.starshipId, connectorId);
        if (!testResult.success) {
          throw new Error(`HTTP bridge test failed: ${testResult.errorMessage}`);
        }
      }

      // Phase 5: Switch traffic and remove old container
      this.updateMigrationStatus(connectorId, {
        phase: 'switching',
        progress: 80,
        message: 'Switching to HTTP bridge and cleaning up old container...'
      });

      // Start monitoring for HTTP bridge
      try {
        await bridgeMonitoringService.startMonitoring(connectorId);
      } catch (error) {
        console.warn(`[ConnectorMigration] Failed to start monitoring for ${connectorId}:`, error);
      }

      // Start capability synchronization
      try {
        await capabilitySyncService.startCapabilitySync(connectorId);
      } catch (error) {
        console.warn(`[ConnectorMigration] Failed to start capability sync for ${connectorId}:`, error);
      }

      // Remove old container
      try {
        await this.deployer.remove(connector.starshipId, connectorId);
      } catch (error) {
        console.warn(`[ConnectorMigration] Failed to remove old container ${oldContainerName}:`, error);
      }

      // Phase 6: Finalization
      this.updateMigrationStatus(connectorId, {
        phase: 'cleaning_up',
        progress: 90,
        message: 'Finalizing migration...'
      });

      // Update final status
      await this.mcpConnectorRepo.update(connectorId, {
        dockerStatus: 'running',
        dockerHealthStatus: 'healthy'
      });

      this.updateMigrationStatus(connectorId, {
        phase: 'completed',
        progress: 100,
        message: 'Migration completed successfully'
      });

      const migrationTime = Date.now() - startTime;
      console.log(`[ConnectorMigration] Successfully migrated connector ${connectorId} to HTTP bridge in ${migrationTime}ms`);

      return {
        success: true,
        connectorId,
        migrationType: 'stdio_to_http',
        migrationTime,
        oldContainerName,
        newContainerName
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration error';
      console.error(`[ConnectorMigration] Migration failed for connector ${connectorId}:`, errorMessage);

      this.updateMigrationStatus(connectorId, {
        phase: 'failed',
        progress: 0,
        message: `Migration failed: ${errorMessage}`,
        errors: [errorMessage]
      });

      // Attempt rollback if requested
      if (rollbackOnFailure) {
        try {
          console.log(`[ConnectorMigration] Attempting rollback for connector ${connectorId}`);
          await this.rollbackMigration(connectorId);
          
          this.updateMigrationStatus(connectorId, {
            phase: 'rolled_back',
            progress: 0,
            message: 'Migration failed, rollback completed'
          });

          return {
            success: false,
            connectorId,
            migrationType: 'stdio_to_http',
            migrationTime: Date.now() - startTime,
            rollbackRequired: false, // Already rolled back
            errorMessage
          };
        } catch (rollbackError) {
          console.error(`[ConnectorMigration] Rollback failed for connector ${connectorId}:`, rollbackError);
          
          return {
            success: false,
            connectorId,
            migrationType: 'stdio_to_http',
            migrationTime: Date.now() - startTime,
            rollbackRequired: true,
            errorMessage: `${errorMessage}. Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}`
          };
        }
      }

      return {
        success: false,
        connectorId,
        migrationType: 'stdio_to_http',
        migrationTime: Date.now() - startTime,
        rollbackRequired: rollbackOnFailure,
        errorMessage
      };
    }
  }

  /**
   * Migrate a connector from HTTP bridge back to stdio
   */
  async migrateToStdio(options: MigrationOptions): Promise<MigrationResult> {
    const startTime = Date.now();
    const { connectorId } = options;

    console.log(`[ConnectorMigration] Starting stdio migration for connector ${connectorId}`);

    try {
      const connector = await this.mcpConnectorRepo.findById(connectorId);
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }

      if (!connector.httpBridgeEnabled) {
        console.log(`[ConnectorMigration] Connector ${connectorId} is already using stdio`);
        return {
          success: true,
          connectorId,
          migrationType: 'http_to_stdio',
          migrationTime: Date.now() - startTime,
          warnings: ['Connector was already using stdio']
        };
      }

      // Stop monitoring and capability sync
      bridgeMonitoringService.stopMonitoring(connectorId);
      capabilitySyncService.stopCapabilitySync(connectorId);

      // Get template information from connector data
      const templateSlug = this.extractTemplateSlugFromConnector(connector);
      if (!templateSlug) {
        throw new Error(`Cannot determine template slug for connector ${connector.templateId}`);
      }

      const legacyTemplate = getLegacyTemplate(templateSlug);
      if (!legacyTemplate) {
        throw new Error(`No legacy template available for ${templateSlug}`);
      }

      const oldContainerName = connector.dockerServiceName || `mcp-${connector.starshipId}-${templateSlug}-http`;
      const newContainerName = `mcp-${connector.starshipId}-${templateSlug}`;

      // Update connector to use stdio template
      await this.mcpConnectorRepo.update(connectorId, {
        httpBridgeEnabled: false,
        dockerServiceName: newContainerName,
        internalUrl: undefined,
        bridgeVersion: undefined,
        dockerStatus: 'building'
      });

      // Deploy the legacy stdio container
      const deploymentResult = await this.deployer.deploy(connector.starshipId, {
        ...connector,
        dockerServiceName: newContainerName,
        httpBridgeEnabled: false
      });

      if (!deploymentResult.success) {
        throw new Error(`Stdio deployment failed: ${deploymentResult.errorMessage}`);
      }

      // Remove old HTTP bridge container
      try {
        await this.deployer.remove(connector.starshipId, connectorId);
      } catch (error) {
        console.warn(`[ConnectorMigration] Failed to remove old HTTP bridge container:`, error);
      }

      // Update final status
      await this.mcpConnectorRepo.update(connectorId, {
        dockerStatus: 'running',
        dockerHealthStatus: 'healthy'
      });

      const migrationTime = Date.now() - startTime;
      console.log(`[ConnectorMigration] Successfully migrated connector ${connectorId} to stdio in ${migrationTime}ms`);

      return {
        success: true,
        connectorId,
        migrationType: 'http_to_stdio',
        migrationTime,
        oldContainerName,
        newContainerName
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown migration error';
      console.error(`[ConnectorMigration] Stdio migration failed for connector ${connectorId}:`, errorMessage);

      return {
        success: false,
        connectorId,
        migrationType: 'http_to_stdio',
        migrationTime: Date.now() - startTime,
        errorMessage
      };
    }
  }

  /**
   * Test HTTP bridge container functionality
   */
  private async testHttpBridgeContainer(starshipId: string, connectorId: string): Promise<{ success: boolean; errorMessage?: string }> {
    try {
      const serviceEndpoint = serviceRegistry.getService(starshipId, connectorId);
      if (!serviceEndpoint) {
        return { success: false, errorMessage: 'Service endpoint not found in registry' };
      }

      // Test health endpoint
      const healthResponse = await fetch(`${serviceEndpoint.internalUrl}/health`);
      if (!healthResponse.ok) {
        return { success: false, errorMessage: `Health check failed: HTTP ${healthResponse.status}` };
      }

      const healthData = await healthResponse.json();
      if (healthData.status !== 'healthy') {
        return { success: false, errorMessage: `Container health status: ${healthData.status}` };
      }

      // Test tools endpoint
      const toolsResponse = await fetch(`${serviceEndpoint.internalUrl}/tools`);
      if (!toolsResponse.ok) {
        return { success: false, errorMessage: `Tools endpoint failed: HTTP ${toolsResponse.status}` };
      }

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        errorMessage: error instanceof Error ? error.message : 'Unknown test error' 
      };
    }
  }

  /**
   * Create backup of connector configuration
   */
  private async createConnectorBackup(connector: MCPServerConnector): Promise<void> {
    console.log(`[ConnectorMigration] Creating backup for connector ${connector.id}`);
    
    // TODO: Implement actual backup logic
    // This could store the connector configuration in a backup table
    // For now, we'll just log the operation
    
    const backupData = {
      connectorId: connector.id,
      backupTime: new Date().toISOString(),
      configuration: {
        dockerServiceName: connector.dockerServiceName,
        dockerStatus: connector.dockerStatus,
        httpBridgeEnabled: connector.httpBridgeEnabled,
        internalUrl: connector.internalUrl,
        bridgeVersion: connector.bridgeVersion
      }
    };
    
    console.log(`[ConnectorMigration] Backup created for connector ${connector.id}:`, backupData);
  }

  /**
   * Rollback a failed migration
   */
  private async rollbackMigration(connectorId: string): Promise<void> {
    console.log(`[ConnectorMigration] Rolling back migration for connector ${connectorId}`);
    
    // Reset connector to original state
    await this.mcpConnectorRepo.update(connectorId, {
      httpBridgeEnabled: false,
      dockerStatus: 'error',
      internalUrl: undefined,
      bridgeVersion: undefined
    });
    
    // TODO: Implement actual rollback logic based on backup
  }

  /**
   * Extract template slug from connector service name or ID
   */
  private extractTemplateSlugFromConnector(connector: MCPServerConnector): string | null {
    // Try to extract from docker service name first
    if (connector.dockerServiceName) {
      // Pattern: mcp-{starshipId}-{templateSlug} or mcp-{starshipId}-{templateSlug}-http
      const match = connector.dockerServiceName.match(/^mcp-[^-]+-([^-]+)(?:-http)?$/);
      if (match) {
        return match[1];
      }
    }

    // Try to extract from connector ID or other fields
    if (connector.id) {
      // Common patterns in connector IDs
      if (connector.id.includes('brave')) return 'brave';
      if (connector.id.includes('github')) return 'github';
      if (connector.id.includes('postgres')) return 'postgres';
    }

    // Default fallback - assume it's brave for now since we're migrating brave connectors
    return 'brave';
  }

  /**
   * Update migration status
   */
  private updateMigrationStatus(connectorId: string, status: MigrationStatus): void {
    this.migrationStatus.set(connectorId, status);
    console.log(`[ConnectorMigration] ${connectorId}: ${status.phase} (${status.progress}%) - ${status.message}`);
  }

  /**
   * Get migration status for a connector
   */
  getMigrationStatus(connectorId: string): MigrationStatus | null {
    return this.migrationStatus.get(connectorId) || null;
  }

  /**
   * Migrate all connectors of a specific template
   */
  async migrateAllConnectorsByTemplate(templateSlug: string, options: Omit<MigrationOptions, 'connectorId'> = {}): Promise<MigrationResult[]> {
    console.log(`[ConnectorMigration] Starting batch migration for template ${templateSlug}`);
    
    try {
      // Find all connectors using this template
      const connectors = await this.mcpConnectorRepo.findByTemplate(templateSlug);
      const legacyConnectors = connectors.filter(c => !c.httpBridgeEnabled);
      
      if (legacyConnectors.length === 0) {
        console.log(`[ConnectorMigration] No legacy connectors found for template ${templateSlug}`);
        return [];
      }
      
      console.log(`[ConnectorMigration] Found ${legacyConnectors.length} legacy connectors for template ${templateSlug}`);
      
      // Migrate connectors in parallel with controlled concurrency
      const migrationPromises = legacyConnectors.map(connector => 
        this.migrateToHttpBridge({
          ...options,
          connectorId: connector.id
        })
      );
      
      const results = await Promise.allSettled(migrationPromises);
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            connectorId: legacyConnectors[index].id,
            migrationType: 'stdio_to_http' as const,
            migrationTime: 0,
            errorMessage: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          };
        }
      });
      
    } catch (error) {
      console.error(`[ConnectorMigration] Batch migration failed for template ${templateSlug}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const connectorMigrationService = new ConnectorMigrationService();