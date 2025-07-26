/**
 * NetworkBandwidthManager - Network bandwidth control for MCP containers
 * 
 * This utility manages network bandwidth limiting using Linux traffic control (tc).
 * It provides container-level bandwidth enforcement for MCP deployments.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';

const execAsync = promisify(exec);

export interface BandwidthConfig {
  enabled: boolean;
  defaultLimitMbps: number;
  maxLimitMbps: number;
  burstKb: number;              // Burst allowance in KB
  latencyMs: number;            // Target latency in ms
}

export interface BandwidthRule {
  containerId: string;
  connectorId: string;
  interfaceName: string;
  limitMbps: number;
  classId: string;              // TC class identifier
  active: boolean;
  createdAt: Date;
  lastModified: Date;
}

export interface BandwidthStats {
  containerId: string;
  interfaceName: string;
  rxBytesPerSec: number;
  txBytesPerSec: number;
  rxPacketsPerSec: number;
  txPacketsPerSec: number;
  droppedPackets: number;
  queueLength: number;
  timestamp: Date;
}

/**
 * Network bandwidth management service
 */
export class NetworkBandwidthManager extends EventEmitter {
  private config: BandwidthConfig;
  private activeRules: Map<string, BandwidthRule> = new Map();
  private classIdCounter = 1000;

  constructor(config?: Partial<BandwidthConfig>) {
    super();
    
    this.config = {
      enabled: false,
      defaultLimitMbps: 100,
      maxLimitMbps: 1000,
      burstKb: 32,                // 32KB burst
      latencyMs: 50,              // 50ms target latency
      ...config
    };
  }

  /**
   * Check if bandwidth limiting is supported on this system
   */
  async isSupported(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    try {
      // Check if tc command is available
      await execAsync('which tc');
      
      // Check if we have necessary kernel modules
      const { stdout } = await execAsync('lsmod | grep -E "(sch_htb|cls_u32|sch_fq)"');
      
      return stdout.trim().length > 0;
    } catch (error) {
      console.warn('[NetworkBandwidthManager] Bandwidth limiting not supported:', error);
      return false;
    }
  }

  /**
   * Apply bandwidth limit to a container
   */
  async applyBandwidthLimit(
    containerId: string,
    connectorId: string,
    limitMbps: number
  ): Promise<BandwidthRule> {
    if (!this.config.enabled) {
      throw new Error('Bandwidth limiting is not enabled');
    }

    if (limitMbps > this.config.maxLimitMbps) {
      throw new Error(`Bandwidth limit ${limitMbps}Mbps exceeds maximum ${this.config.maxLimitMbps}Mbps`);
    }

    try {
      // Get container's network interface
      const interfaceName = await this.getContainerInterface(containerId);
      
      // Generate unique class ID
      const classId = (this.classIdCounter++).toString();
      
      // Setup traffic control rules
      await this.setupTrafficControl(interfaceName, limitMbps, classId);
      
      const rule: BandwidthRule = {
        containerId,
        connectorId,
        interfaceName,
        limitMbps,
        classId,
        active: true,
        createdAt: new Date(),
        lastModified: new Date()
      };

      this.activeRules.set(containerId, rule);
      
      console.log(`[NetworkBandwidthManager] Applied ${limitMbps}Mbps limit to container ${containerId} (${interfaceName})`);
      this.emit('bandwidthLimitApplied', rule);
      
      return rule;

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to apply bandwidth limit to ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Remove bandwidth limit from a container
   */
  async removeBandwidthLimit(containerId: string): Promise<void> {
    const rule = this.activeRules.get(containerId);
    if (!rule) {
      console.warn(`[NetworkBandwidthManager] No bandwidth rule found for container ${containerId}`);
      return;
    }

    try {
      // Remove traffic control rules
      await this.removeTrafficControl(rule.interfaceName, rule.classId);
      
      rule.active = false;
      this.activeRules.delete(containerId);
      
      console.log(`[NetworkBandwidthManager] Removed bandwidth limit from container ${containerId}`);
      this.emit('bandwidthLimitRemoved', containerId);

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to remove bandwidth limit from ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Update bandwidth limit for a container
   */
  async updateBandwidthLimit(
    containerId: string,
    newLimitMbps: number
  ): Promise<BandwidthRule> {
    const existingRule = this.activeRules.get(containerId);
    if (!existingRule) {
      throw new Error(`No existing bandwidth rule for container ${containerId}`);
    }

    if (newLimitMbps > this.config.maxLimitMbps) {
      throw new Error(`Bandwidth limit ${newLimitMbps}Mbps exceeds maximum ${this.config.maxLimitMbps}Mbps`);
    }

    try {
      // Update traffic control rules
      await this.updateTrafficControl(existingRule.interfaceName, existingRule.classId, newLimitMbps);
      
      existingRule.limitMbps = newLimitMbps;
      existingRule.lastModified = new Date();
      
      console.log(`[NetworkBandwidthManager] Updated bandwidth limit to ${newLimitMbps}Mbps for container ${containerId}`);
      this.emit('bandwidthLimitUpdated', existingRule);
      
      return existingRule;

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to update bandwidth limit for ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Get bandwidth statistics for a container
   */
  async getBandwidthStats(containerId: string): Promise<BandwidthStats | null> {
    const rule = this.activeRules.get(containerId);
    if (!rule) {
      return null;
    }

    try {
      // Get interface statistics
      const stats = await this.getInterfaceStats(rule.interfaceName);
      
      // Get traffic control statistics
      const tcStats = await this.getTrafficControlStats(rule.interfaceName, rule.classId);
      
      return {
        containerId,
        interfaceName: rule.interfaceName,
        rxBytesPerSec: stats.rxBytesPerSec,
        txBytesPerSec: stats.txBytesPerSec,
        rxPacketsPerSec: stats.rxPacketsPerSec,
        txPacketsPerSec: stats.txPacketsPerSec,
        droppedPackets: tcStats.droppedPackets,
        queueLength: tcStats.queueLength,
        timestamp: new Date()
      };

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to get bandwidth stats for ${containerId}:`, error);
      return null;
    }
  }

  /**
   * Get all active bandwidth rules
   */
  getActiveBandwidthRules(): BandwidthRule[] {
    return Array.from(this.activeRules.values())
      .filter(rule => rule.active);
  }

  /**
   * Get bandwidth rule for a specific container
   */
  getBandwidthRule(containerId: string): BandwidthRule | undefined {
    return this.activeRules.get(containerId);
  }

  /**
   * Cleanup all bandwidth rules
   */
  async cleanup(): Promise<void> {
    console.log('[NetworkBandwidthManager] Cleaning up all bandwidth rules');

    const containerIds = Array.from(this.activeRules.keys());
    
    for (const containerId of containerIds) {
      try {
        await this.removeBandwidthLimit(containerId);
      } catch (error) {
        console.error(`[NetworkBandwidthManager] Failed to cleanup bandwidth rule for ${containerId}:`, error);
      }
    }

    this.activeRules.clear();
    console.log('[NetworkBandwidthManager] Bandwidth rules cleanup complete');
  }

  /**
   * Private helper methods
   */

  /**
   * Get the network interface name for a container
   */
  private async getContainerInterface(containerId: string): Promise<string> {
    try {
      // Get container's network settings
      const { stdout } = await execAsync(
        `docker inspect ${containerId} --format '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'`
      );
      
      const networkId = stdout.trim().substring(0, 12); // Short network ID
      
      // Find the veth interface for this container
      const { stdout: vethOutput } = await execAsync(
        `docker exec ${containerId} cat /sys/class/net/eth0/iflink`
      );
      
      const iflink = vethOutput.trim();
      
      // Find the host-side veth interface
      const { stdout: hostVethOutput } = await execAsync(
        `grep -l ${iflink} /sys/class/net/veth*/ifindex | head -1 | cut -d'/' -f5`
      );
      
      const interfaceName = hostVethOutput.trim();
      
      if (!interfaceName || !interfaceName.startsWith('veth')) {
        throw new Error(`Could not find veth interface for container ${containerId}`);
      }
      
      return interfaceName;

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to get interface for container ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Setup traffic control rules for bandwidth limiting
   */
  private async setupTrafficControl(
    interfaceName: string,
    limitMbps: number,
    classId: string
  ): Promise<void> {
    const limitKbps = limitMbps * 1000;
    const ceilKbps = Math.min(limitKbps * 1.2, this.config.maxLimitMbps * 1000); // 20% burst allowance
    const burstBytes = this.config.burstKb * 1024;

    try {
      // Create root qdisc if it doesn't exist
      try {
        await execAsync(`tc qdisc add dev ${interfaceName} root handle 1: htb default 9999`);
      } catch (error) {
        // Might already exist, that's OK
        if (!(error instanceof Error) || !error.message.includes('File exists')) {
          throw error;
        }
      }

      // Create class for bandwidth limiting
      await execAsync(`tc class add dev ${interfaceName} parent 1: classid 1:${classId} htb rate ${limitKbps}kbit ceil ${ceilKbps}kbit burst ${burstBytes}`);

      // Add fair queuing to reduce latency
      await execAsync(`tc qdisc add dev ${interfaceName} parent 1:${classId} handle ${classId}: fq_codel target ${this.config.latencyMs}ms`);

      // Create filter to classify traffic (all traffic goes to our class for now)
      await execAsync(`tc filter add dev ${interfaceName} parent 1: protocol ip prio 1 u32 match ip src 0.0.0.0/0 flowid 1:${classId}`);

      console.log(`[NetworkBandwidthManager] Setup traffic control for ${interfaceName}: ${limitMbps}Mbps (class ${classId})`);

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to setup traffic control for ${interfaceName}:`, error);
      throw error;
    }
  }

  /**
   * Remove traffic control rules
   */
  private async removeTrafficControl(interfaceName: string, classId: string): Promise<void> {
    try {
      // Remove filter
      await execAsync(`tc filter del dev ${interfaceName} parent 1: protocol ip prio 1`).catch(() => {
        // Might not exist, that's OK
      });

      // Remove qdisc
      await execAsync(`tc qdisc del dev ${interfaceName} parent 1:${classId} handle ${classId}:`).catch(() => {
        // Might not exist, that's OK
      });

      // Remove class
      await execAsync(`tc class del dev ${interfaceName} parent 1: classid 1:${classId}`).catch(() => {
        // Might not exist, that's OK
      });

      console.log(`[NetworkBandwidthManager] Removed traffic control for ${interfaceName} (class ${classId})`);

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to remove traffic control for ${interfaceName}:`, error);
      throw error;
    }
  }

  /**
   * Update traffic control rules
   */
  private async updateTrafficControl(
    interfaceName: string,
    classId: string,
    newLimitMbps: number
  ): Promise<void> {
    const limitKbps = newLimitMbps * 1000;
    const ceilKbps = Math.min(limitKbps * 1.2, this.config.maxLimitMbps * 1000);
    const burstBytes = this.config.burstKb * 1024;

    try {
      // Update class parameters
      await execAsync(`tc class change dev ${interfaceName} parent 1: classid 1:${classId} htb rate ${limitKbps}kbit ceil ${ceilKbps}kbit burst ${burstBytes}`);

      console.log(`[NetworkBandwidthManager] Updated traffic control for ${interfaceName}: ${newLimitMbps}Mbps (class ${classId})`);

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to update traffic control for ${interfaceName}:`, error);
      throw error;
    }
  }

  /**
   * Get interface statistics
   */
  private async getInterfaceStats(interfaceName: string): Promise<{
    rxBytesPerSec: number;
    txBytesPerSec: number;
    rxPacketsPerSec: number;
    txPacketsPerSec: number;
  }> {
    try {
      // Read interface statistics from /proc/net/dev
      const { stdout } = await execAsync(`cat /proc/net/dev | grep ${interfaceName}`);
      
      if (!stdout.trim()) {
        throw new Error(`Interface ${interfaceName} not found in /proc/net/dev`);
      }

      // Parse statistics (format: interface: rx_bytes rx_packets ... tx_bytes tx_packets ...)
      const parts = stdout.trim().split(/\s+/);
      const rxBytes = parseInt(parts[1]);
      const rxPackets = parseInt(parts[2]);
      const txBytes = parseInt(parts[9]);
      const txPackets = parseInt(parts[10]);

      // For simplicity, return current values (in a real implementation, you'd calculate per-second rates)
      return {
        rxBytesPerSec: rxBytes,
        txBytesPerSec: txBytes,
        rxPacketsPerSec: rxPackets,
        txPacketsPerSec: txPackets
      };

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to get interface stats for ${interfaceName}:`, error);
      return {
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
        rxPacketsPerSec: 0,
        txPacketsPerSec: 0
      };
    }
  }

  /**
   * Get traffic control statistics
   */
  private async getTrafficControlStats(interfaceName: string, classId: string): Promise<{
    droppedPackets: number;
    queueLength: number;
  }> {
    try {
      // Get qdisc statistics
      const { stdout } = await execAsync(`tc -s qdisc show dev ${interfaceName}`);
      
      // Parse statistics (simplified - would need more robust parsing in production)
      const droppedMatch = stdout.match(/dropped (\d+)/);
      const qlenMatch = stdout.match(/qlen (\d+)/);
      
      return {
        droppedPackets: droppedMatch ? parseInt(droppedMatch[1]) : 0,
        queueLength: qlenMatch ? parseInt(qlenMatch[1]) : 0
      };

    } catch (error) {
      console.error(`[NetworkBandwidthManager] Failed to get TC stats for ${interfaceName}:`, error);
      return {
        droppedPackets: 0,
        queueLength: 0
      };
    }
  }
}