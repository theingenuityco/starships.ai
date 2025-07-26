/**
 * NetworkManager - Docker network management for MCP servers
 * Handles network creation, isolation, and service discovery for starship containers
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface NetworkConfig {
  starshipId: string;
  networkName: string;
  subnet?: string;
  gateway?: string;
  driver?: 'bridge' | 'overlay' | 'macvlan';
  attachable?: boolean;
  enableIPv6?: boolean;
}

export interface ServiceInfo {
  serviceName: string;
  containerName: string;
  networkAliases: string[];
  ipAddress?: string;
}

/**
 * Docker network manager for MCP server service discovery
 */
export class NetworkManager {
  private static readonly NETWORK_PREFIX = 'starship';
  private static readonly DEFAULT_SUBNET_PREFIX = '172.20';
  
  /**
   * Create a dedicated network for a starship
   * Network naming: starship-{starshipId}
   */
  async createStarshipNetwork(config: NetworkConfig): Promise<boolean> {
    try {
      const networkName = this.getNetworkName(config.starshipId);
      
      // Check if network already exists
      const existsResult = await execAsync(
        `docker network ls --filter name=${networkName} --format "{{.Name}}"`
      );
      
      if (existsResult.stdout.trim() === networkName) {
        console.log(`[NetworkManager] Network ${networkName} already exists`);
        return true;
      }
      
      // Generate subnet for network isolation
      const subnet = config.subnet || this.generateSubnet(config.starshipId);
      const gateway = config.gateway || this.generateGateway(subnet);
      
      // Create network command
      const createCommand = [
        'docker network create',
        `--driver ${config.driver || 'bridge'}`,
        `--subnet ${subnet}`,
        `--gateway ${gateway}`,
        config.attachable ? '--attachable' : '',
        config.enableIPv6 ? '--ipv6' : '',
        `--label starship.id=${config.starshipId}`,
        `--label starship.created=${new Date().toISOString()}`,
        networkName
      ].filter(Boolean).join(' ');
      
      await execAsync(createCommand);
      
      console.log(`[NetworkManager] Created network: ${networkName} (${subnet})`);
      return true;
      
    } catch (error) {
      console.error(`[NetworkManager] Failed to create network for starship ${config.starshipId}:`, error);
      return false;
    }
  }
  
  /**
   * Remove starship network and cleanup
   */
  async removeStarshipNetwork(starshipId: string): Promise<boolean> {
    try {
      const networkName = this.getNetworkName(starshipId);
      
      // Stop and remove all containers on this network first
      await this.disconnectAllContainers(networkName);
      
      // Remove the network
      await execAsync(`docker network rm ${networkName}`);
      
      console.log(`[NetworkManager] Removed network: ${networkName}`);
      return true;
      
    } catch (error) {
      console.error(`[NetworkManager] Failed to remove network for starship ${starshipId}:`, error);
      return false;
    }
  }
  
  /**
   * Get service discovery information for a starship
   */
  async getServiceDiscovery(starshipId: string): Promise<ServiceInfo[]> {
    try {
      const networkName = this.getNetworkName(starshipId);
      
      // Get network details with connected containers
      const result = await execAsync(
        `docker network inspect ${networkName} --format "{{json .Containers}}"`
      );
      
      const containersData = JSON.parse(result.stdout.trim() || '{}');
      const services: ServiceInfo[] = [];
      
      for (const [containerId, containerInfo] of Object.entries(containersData as any)) {
        const containerDetails = await this.getContainerDetails(containerId);
        
        if (containerDetails && this.isMCPContainer(containerDetails.name)) {
          services.push({
            serviceName: this.extractServiceName(containerDetails.name),
            containerName: containerDetails.name,
            networkAliases: containerDetails.aliases || [],
            ipAddress: (containerInfo as any).IPv4Address?.split('/')[0]
          });
        }
      }
      
      return services;
      
    } catch (error) {
      console.error(`[NetworkManager] Failed to get service discovery for starship ${starshipId}:`, error);
      return [];
    }
  }
  
  /**
   * Test DNS resolution within a starship network
   */
  async testServiceDiscovery(starshipId: string, serviceName?: string): Promise<boolean> {
    try {
      const networkName = this.getNetworkName(starshipId);
      const services = await this.getServiceDiscovery(starshipId);
      
      if (services.length === 0) {
        console.log(`[NetworkManager] No services found for testing in ${networkName}`);
        return false;
      }
      
      // Test DNS resolution from the first available container
      const testContainer = services[0];
      const targetService = serviceName || services.find(s => s.serviceName !== testContainer.serviceName)?.serviceName;
      
      if (!targetService) {
        console.log(`[NetworkManager] No target service found for DNS testing`);
        return true; // Single service networks are considered healthy
      }
      
      // Test DNS resolution
      const testCommand = `docker exec ${testContainer.containerName} nslookup ${targetService}`;
      const result = await execAsync(testCommand);
      
      const dnsResolved = result.stdout.includes('Address:') || result.stdout.includes('answer:');
      
      console.log(`[NetworkManager] DNS test ${testContainer.serviceName} -> ${targetService}: ${dnsResolved ? 'PASS' : 'FAIL'}`);
      return dnsResolved;
      
    } catch (error) {
      console.error(`[NetworkManager] DNS test failed for starship ${starshipId}:`, error);
      return false;
    }
  }
  
  /**
   * List all starship networks
   */
  async listStarshipNetworks(): Promise<{ starshipId: string; networkName: string; status: string }[]> {
    try {
      const result = await execAsync(
        `docker network ls --filter label=starship.id --format "{{.Name}}\t{{.Driver}}\t{{.Scope}}"`
      );
      
      const networks = result.stdout.trim().split('\n').filter(Boolean).map(line => {
        const [networkName, driver, scope] = line.split('\t');
        const starshipId = networkName.replace(`${NetworkManager.NETWORK_PREFIX}-`, '');
        
        return {
          starshipId,
          networkName,
          status: `${driver}/${scope}`
        };
      });
      
      return networks;
      
    } catch (error) {
      console.error('[NetworkManager] Failed to list starship networks:', error);
      return [];
    }
  }
  
  /**
   * Generate network name for starship
   */
  private getNetworkName(starshipId: string): string {
    return `${NetworkManager.NETWORK_PREFIX}-${starshipId}`;
  }
  
  /**
   * Generate unique subnet for starship isolation
   */
  private generateSubnet(starshipId: string): string {
    // Generate a deterministic subnet based on starship ID
    const hash = this.simpleHash(starshipId);
    const thirdOctet = (hash % 240) + 10; // Range: 10-250
    return `${NetworkManager.DEFAULT_SUBNET_PREFIX}.${thirdOctet}.0/24`;
  }
  
  /**
   * Generate gateway IP for subnet
   */
  private generateGateway(subnet: string): string {
    return subnet.replace('.0/24', '.1');
  }
  
  /**
   * Simple hash function for consistent subnet generation
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  /**
   * Disconnect all containers from a network
   */
  private async disconnectAllContainers(networkName: string): Promise<void> {
    try {
      const result = await execAsync(
        `docker network inspect ${networkName} --format "{{range .Containers}}{{.Name}} {{end}}"`
      );
      
      const containerNames = result.stdout.trim().split(' ').filter(Boolean);
      
      for (const containerName of containerNames) {
        try {
          await execAsync(`docker network disconnect ${networkName} ${containerName}`);
          console.log(`[NetworkManager] Disconnected ${containerName} from ${networkName}`);
        } catch (error) {
          console.warn(`[NetworkManager] Failed to disconnect ${containerName}:`, error);
        }
      }
    } catch (error) {
      console.warn(`[NetworkManager] Failed to disconnect containers from ${networkName}:`, error);
    }
  }
  
  /**
   * Get detailed container information
   */
  private async getContainerDetails(containerId: string): Promise<{ name: string; aliases?: string[] } | null> {
    try {
      const result = await execAsync(
        `docker inspect ${containerId} --format "{{.Name}}"`
      );
      
      const name = result.stdout.trim().replace(/^\//, ''); // Remove leading slash
      
      return { name };
      
    } catch (error) {
      console.warn(`[NetworkManager] Failed to get container details for ${containerId}:`, error);
      return null;
    }
  }
  
  /**
   * Check if container is an MCP server
   */
  private isMCPContainer(containerName: string): boolean {
    return containerName.startsWith('mcp-');
  }
  
  /**
   * Extract service name from container name
   * Container name format: mcp-{starshipId}-{templateSlug}
   */
  private extractServiceName(containerName: string): string {
    const parts = containerName.split('-');
    return parts.length >= 3 ? parts.slice(2).join('-') : containerName;
  }
}