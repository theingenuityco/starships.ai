/**
 * Resource Manager for Parallel Task Execution
 * 
 * Manages computational resources and agent availability for optimal task distribution
 */

import { AgentAssignment } from '../types';

interface ResourceAllocation {
  taskId: string;
  agentId: string;
  allocatedAt: Date;
  estimatedReleaseTime: Date;
  resourceUnits: number;
}

interface AgentResource {
  agentId: string;
  totalCapacity: number;
  availableCapacity: number;
  activeAllocations: ResourceAllocation[];
}

export class ResourceManager {
  private agentResources: Map<string, AgentResource> = new Map();
  private taskAllocations: Map<string, ResourceAllocation> = new Map();
  private defaultCapacityPerAgent = 100; // Resource units per agent

  /**
   * Initialize resource pool with agent assignments
   */
  async initializePool(assignments: AgentAssignment[]): Promise<void> {
    // Create resource pool for each unique agent
    const uniqueAgents = new Set(assignments.map(a => a.agentId));
    
    uniqueAgents.forEach(agentId => {
      this.agentResources.set(agentId, {
        agentId,
        totalCapacity: this.defaultCapacityPerAgent,
        availableCapacity: this.defaultCapacityPerAgent,
        activeAllocations: []
      });
    });
    
    console.log(`🏊 [RESOURCE-MANAGER] Initialized resource pool for ${uniqueAgents.size} agents`);
  }

  /**
   * Allocate resources for a task
   */
  async allocateResources(
    taskId: string,
    agentId: string,
    estimatedDuration: number = 30
  ): Promise<ResourceAllocation> {
    const agentResource = this.agentResources.get(agentId);
    
    if (!agentResource) {
      throw new Error(`Agent ${agentId} not found in resource pool`);
    }
    
    // Calculate required resources based on task complexity
    const requiredUnits = this.calculateRequiredUnits(estimatedDuration);
    
    if (agentResource.availableCapacity < requiredUnits) {
      throw new Error(`Insufficient resources for agent ${agentId}`);
    }
    
    // Create allocation
    const allocation: ResourceAllocation = {
      taskId,
      agentId,
      allocatedAt: new Date(),
      estimatedReleaseTime: new Date(Date.now() + estimatedDuration * 60000),
      resourceUnits: requiredUnits
    };
    
    // Update agent resource state
    agentResource.availableCapacity -= requiredUnits;
    agentResource.activeAllocations.push(allocation);
    
    // Store allocation
    this.taskAllocations.set(taskId, allocation);
    
    console.log(`📦 [RESOURCE-MANAGER] Allocated ${requiredUnits} units to task ${taskId} on agent ${agentId}`);
    
    return allocation;
  }

  /**
   * Release resources after task completion
   */
  releaseResources(taskId: string): void {
    const allocation = this.taskAllocations.get(taskId);
    
    if (!allocation) {
      console.warn(`⚠️ [RESOURCE-MANAGER] No allocation found for task ${taskId}`);
      return;
    }
    
    const agentResource = this.agentResources.get(allocation.agentId);
    
    if (agentResource) {
      // Restore capacity
      agentResource.availableCapacity += allocation.resourceUnits;
      
      // Remove from active allocations
      agentResource.activeAllocations = agentResource.activeAllocations
        .filter(a => a.taskId !== taskId);
      
      console.log(`♻️ [RESOURCE-MANAGER] Released ${allocation.resourceUnits} units from task ${taskId}`);
    }
    
    // Remove allocation record
    this.taskAllocations.delete(taskId);
  }

  /**
   * Get current resource utilization
   */
  getUtilization(): Record<string, number> {
    const utilization: Record<string, number> = {};
    
    this.agentResources.forEach((resource, agentId) => {
      const used = resource.totalCapacity - resource.availableCapacity;
      utilization[agentId] = (used / resource.totalCapacity) * 100;
    });
    
    return utilization;
  }

  /**
   * Rebalance load across agents
   */
  rebalanceLoad(): void {
    console.log(`⚖️ [RESOURCE-MANAGER] Rebalancing load across agents`);
    
    // Calculate average utilization
    const utilization = this.getUtilization();
    const avgUtilization = Object.values(utilization).reduce((sum, u) => sum + u, 0) / Object.keys(utilization).length;
    
    // Identify overloaded and underutilized agents
    const overloaded = Object.entries(utilization)
      .filter(([_, u]) => u > avgUtilization + 20)
      .map(([agentId]) => agentId);
      
    const underutilized = Object.entries(utilization)
      .filter(([_, u]) => u < avgUtilization - 20)
      .map(([agentId]) => agentId);
    
    console.log(`📊 [RESOURCE-MANAGER] Overloaded agents: ${overloaded.length}, Underutilized: ${underutilized.length}`);
    
    // In a real implementation, this would trigger task redistribution
  }

  /**
   * Check if an agent has available capacity
   */
  hasAvailableCapacity(agentId: string, requiredUnits: number = 20): boolean {
    const resource = this.agentResources.get(agentId);
    return resource ? resource.availableCapacity >= requiredUnits : false;
  }

  /**
   * Get least loaded agent
   */
  getLeastLoadedAgent(): string | null {
    let leastLoadedAgent: string | null = null;
    let maxAvailable = 0;
    
    this.agentResources.forEach((resource, agentId) => {
      if (resource.availableCapacity > maxAvailable) {
        maxAvailable = resource.availableCapacity;
        leastLoadedAgent = agentId;
      }
    });
    
    return leastLoadedAgent;
  }

  /**
   * Calculate required resource units based on task duration
   */
  private calculateRequiredUnits(estimatedDuration: number): number {
    // Simple linear scaling: 1 minute = 1 unit, max 50 units
    return Math.min(50, Math.max(5, Math.round(estimatedDuration)));
  }

  /**
   * Get resource allocation summary
   */
  getResourceSummary() {
    const summary = {
      totalAgents: this.agentResources.size,
      activeAllocations: this.taskAllocations.size,
      utilization: this.getUtilization(),
      agentDetails: Array.from(this.agentResources.values()).map(r => ({
        agentId: r.agentId,
        capacity: `${r.availableCapacity}/${r.totalCapacity}`,
        activeTasks: r.activeAllocations.length
      }))
    };
    
    return summary;
  }
}