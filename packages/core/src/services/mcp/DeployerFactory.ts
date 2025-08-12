/**
 * DeployerFactory - Singleton factory for MCP deployer selection
 * 
 * This factory provides the single point of access to get the appropriate
 * MCP deployer implementation. Currently only supports Kubernetes deployment
 * as Docker Compose is being phased out.
 */

import { MCPDeployer } from './MCPDeployer';
import { KubernetesDeployer } from './KubernetesDeployer';

/**
 * Factory class for creating and managing MCP deployer instances
 */
export class DeployerFactory {
  private static instance: MCPDeployer | null = null;
  
  /**
   * Get the MCP deployer instance
   * 
   * @returns The singleton MCP deployer instance
   */
  static getDeployer(): MCPDeployer {
    if (!this.instance) {
      // Always use Kubernetes now - no Docker Compose fallback
      console.log('[DeployerFactory] Creating KubernetesDeployer instance');
      this.instance = new KubernetesDeployer();
    }
    return this.instance;
  }
  
  /**
   * Reset the factory instance (mainly for testing)
   */
  static reset(): void {
    this.instance = null;
  }
  
  /**
   * Get the deployer type currently in use
   */
  static getDeployerType(): string {
    return 'kubernetes';
  }
}