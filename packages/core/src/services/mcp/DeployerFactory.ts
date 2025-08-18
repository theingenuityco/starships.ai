/**
 * DeployerFactory - Singleton factory for MCP deployer selection
 * 
 * This factory provides the single point of access to get the appropriate
 * MCP deployer implementation. Currently only supports Kubernetes deployment
 * as Docker Compose is being phased out.
 */

import { MCPDeployer } from './MCPDeployer';
import { KubernetesDeployer } from './KubernetesDeployer';
import { MockDeployer } from './MockDeployer';

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
      // Check if we should skip K8s/Docker operations (dev mode)
      const skipK8s = process.env.SKIP_K8S_CHECK === 'true';
      console.log(`[DeployerFactory] SKIP_K8S_CHECK=${process.env.SKIP_K8S_CHECK}`);
      
      if (skipK8s) {
        console.log('[DeployerFactory] Creating MockDeployer instance (SKIP_K8S_CHECK=true)');
        this.instance = new MockDeployer();
      } else {
        // Use Kubernetes for production/staging
        console.log('[DeployerFactory] Creating KubernetesDeployer instance');
        this.instance = new KubernetesDeployer();
      }
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
    if (process.env.SKIP_K8S_CHECK === 'true') {
      return 'mock';
    }
    return 'kubernetes';
  }
}