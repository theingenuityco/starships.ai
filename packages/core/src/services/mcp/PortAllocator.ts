/**
 * PortAllocator - Manages dynamic port allocation for MCP containers
 * 
 * This service ensures unique port assignments for development environments
 * and tracks port usage across the system.
 */

import * as net from 'net';
import { RepositoryFactory } from '@starships/models';

export interface PortAllocation {
  connectorId: string;
  port: number;
  allocatedAt: Date;
  inUse: boolean;
}

export class PortAllocator {
  private static instance: PortAllocator;
  private basePort: number = 8080;
  private maxPort: number = 9000;
  private allocations: Map<string, PortAllocation> = new Map();

  private constructor() {
    // Delay loading allocations until first use to avoid initialization issues
  }

  static getInstance(): PortAllocator {
    if (!PortAllocator.instance) {
      PortAllocator.instance = new PortAllocator();
    }
    return PortAllocator.instance;
  }

  /**
   * Load existing port allocations from database
   */
  private async loadAllocations(): Promise<void> {
    try {
      const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
      const connectors = await connectorRepo.findAll();
      
      for (const connector of connectors) {
        if (connector.dockerPort) {
          this.allocations.set(connector.id, {
            connectorId: connector.id,
            port: connector.dockerPort,
            allocatedAt: new Date(connector.createdAt),
            inUse: connector.dockerStatus === 'running'
          });
        }
      }
      
      console.log(`[PortAllocator] Loaded ${this.allocations.size} port allocations`);
    } catch (error) {
      console.error('[PortAllocator] Failed to load allocations:', error);
    }
  }

  /**
   * Ensure allocations are loaded (lazy initialization)
   */
  private async ensureAllocationsLoaded(): Promise<void> {
    if (this.allocations.size === 0) {
      await this.loadAllocations();
    }
  }

  /**
   * Allocate a unique port for a connector
   */
  async allocatePort(connectorId: string): Promise<number> {
    // Ensure allocations are loaded
    await this.ensureAllocationsLoaded();
    
    // Check if already allocated
    const existing = this.allocations.get(connectorId);
    if (existing && await this.isPortAvailable(existing.port)) {
      existing.inUse = true;
      return existing.port;
    }

    // Find next available port
    let port = this.basePort;
    const usedPorts = new Set(Array.from(this.allocations.values()).map(a => a.port));

    while (port <= this.maxPort) {
      if (!usedPorts.has(port) && await this.isPortAvailable(port)) {
        this.allocations.set(connectorId, {
          connectorId,
          port,
          allocatedAt: new Date(),
          inUse: true
        });
        
        // Persist to database
        await this.persistAllocation(connectorId, port);
        
        console.log(`[PortAllocator] Allocated port ${port} to connector ${connectorId}`);
        return port;
      }
      port++;
    }

    throw new Error('No available ports in range');
  }

  /**
   * Release a port allocation
   */
  async releasePort(connectorId: string): Promise<void> {
    const allocation = this.allocations.get(connectorId);
    if (allocation) {
      allocation.inUse = false;
      console.log(`[PortAllocator] Released port ${allocation.port} from connector ${connectorId}`);
    }
  }

  /**
   * Check if a port is available
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once('error', () => {
        resolve(false);
      });
      
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      
      server.listen(port, 'localhost');
    });
  }

  /**
   * Persist port allocation to database
   */
  private async persistAllocation(connectorId: string, port: number): Promise<void> {
    try {
      const connectorRepo = RepositoryFactory.getMCPServerConnectorRepository();
      await connectorRepo.update(connectorId, { dockerPort: port });
    } catch (error) {
      console.error('[PortAllocator] Failed to persist allocation:', error);
    }
  }

  /**
   * Get allocated port for a connector
   */
  getAllocatedPort(connectorId: string): number | null {
    const allocation = this.allocations.get(connectorId);
    return allocation?.port || null;
  }

  /**
   * Get all active allocations
   */
  getActiveAllocations(): PortAllocation[] {
    return Array.from(this.allocations.values()).filter(a => a.inUse);
  }
}

export const portAllocator = PortAllocator.getInstance();