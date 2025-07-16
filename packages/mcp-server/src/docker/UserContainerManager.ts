import Docker from 'dockerode';
import { MCPConfiguration, MCPToolCall } from '@starships/protocol';
import { MCPContainer } from '@starships/models';

export interface ContainerInfo {
  id: string;
  dockerId: string;
  status: string;
  resourceUsage: {
    memory: string;
    cpu: string;
  };
  createdAt: string;
  lastActivity: string;
}

export class UserContainerManager {
  private docker: Docker;
  private userContainers: Map<string, string> = new Map(); // userId -> containerId
  private initialized: boolean = false;

  constructor() {
    // Initialize Docker connection
    const dockerSocket = process.env.MCP_DOCKER_SOCKET || '/var/run/docker.sock';
    this.docker = new Docker({ socketPath: dockerSocket });
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Test Docker connection
      await this.docker.ping();
      console.log('✅ Docker connection established');
      
      // Clean up any orphaned containers
      await this.cleanupOrphanedContainers();
      
      this.initialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize Docker connection:', error);
      throw new Error(`Docker initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async createUserContainer(userId: string, config: MCPConfiguration): Promise<string> {
    try {
      // Check if user already has a container
      const existingContainerId = this.userContainers.get(userId);
      if (existingContainerId) {
        // Check if container is still running
        const container = this.docker.getContainer(existingContainerId);
        try {
          const info = await container.inspect();
          if (info.State.Running) {
            console.log(`📦 User ${userId} already has running container: ${existingContainerId}`);
            return existingContainerId;
          }
        } catch (error) {
          // Container doesn't exist, remove from map
          this.userContainers.delete(userId);
        }
      }

      // Create new container for user
      const containerName = `starships-user-${userId}-mcp-tools`;
      const image = config.containerImage || 'starships-mcp-tools:latest';

      console.log(`🚀 Creating container for user ${userId}...`);

      const container = await this.docker.createContainer({
        Image: image,
        name: containerName,
        Env: [
          `USER_ID=${userId}`,
          `TOOLS=${config.tools.map(t => t.name).join(',')}`,
          ...Object.entries(config.environment).map(([key, value]) => `${key}=${value}`)
        ],
        HostConfig: {
          Memory: this.parseMemoryLimit(config.limits.memory),
          CpuShares: this.parseCpuLimit(config.limits.cpu),
          NetworkMode: process.env.MCP_NETWORK_MODE || 'none', // Default to no network access
          RestartPolicy: { Name: 'unless-stopped' },
          // Enhanced security settings
          ReadonlyRootfs: false,
          SecurityOpt: [
            'no-new-privileges:true',
            'seccomp=unconfined', // Allow syscalls but with restrictions
            'apparmor=unconfined'
          ],
          CapDrop: ['ALL'], // Drop all capabilities
          CapAdd: [], // Add only necessary capabilities
          // Resource limits
          CpuPeriod: 100000, // 100ms
          CpuQuota: Math.floor(this.parseCpuLimit(config.limits.cpu) * 1000), // CPU quota in microseconds
          PidsLimit: 100, // Limit number of processes
          // Ulimits for additional security
          Ulimits: [
            { Name: 'nofile', Soft: 1024, Hard: 1024 }, // File descriptor limit
            { Name: 'nproc', Soft: 50, Hard: 50 }, // Process limit
            { Name: 'fsize', Soft: 100 * 1024 * 1024, Hard: 100 * 1024 * 1024 } // File size limit (100MB)
          ],
          // Prevent container from accessing host devices
          DeviceRequests: [],
          Devices: [],
          // Tmpfs mounts for temporary storage
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=100m',
            '/var/tmp': 'rw,noexec,nosuid,size=50m'
          }
        },
        WorkingDir: '/app',
        ExposedPorts: {
          '8080/tcp': {}
        },
        Labels: {
          'starships.user_id': userId,
          'starships.type': 'mcp-tools',
          'starships.created_at': new Date().toISOString()
        }
      });

      await container.start();
      const containerId = container.id;

      // Store container mapping
      this.userContainers.set(userId, containerId);

      console.log(`✅ Container created for user ${userId}: ${containerId}`);
      return containerId;
    } catch (error) {
      console.error(`❌ Failed to create container for user ${userId}:`, error);
      throw new Error(`Container creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeToolInContainer(userId: string, toolCall: MCPToolCall): Promise<any> {
    try {
      const containerId = this.userContainers.get(userId);
      if (!containerId) {
        throw new Error(`No container found for user ${userId}`);
      }

      const container = this.docker.getContainer(containerId);

      // Check if container is running
      const info = await container.inspect();
      if (!info.State.Running) {
        throw new Error(`Container for user ${userId} is not running`);
      }

      // Execute tool command in container
      const command = this.buildToolCommand(toolCall);
      console.log(`🔧 Executing tool ${toolCall.toolName} for user ${userId}...`);

      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true,
        Env: Object.entries(toolCall.parameters).map(([key, value]) => `${key}=${value}`)
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      
      // Collect output
      let output = '';
      let error = '';

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Tool execution timeout after ${process.env.MCP_DEFAULT_TIMEOUT || 30000}ms`));
        }, parseInt(process.env.MCP_DEFAULT_TIMEOUT || '30000'));

        stream.on('data', (chunk: Buffer) => {
          const data = chunk.toString();
          if (data.includes('stderr')) {
            error += data;
          } else {
            output += data;
          }
        });

        stream.on('end', () => {
          clearTimeout(timeout);
          if (error) {
            reject(new Error(`Tool execution error: ${error}`));
          } else {
            try {
              // Try to parse JSON output, fallback to raw text
              const result = output.trim();
              resolve(result.startsWith('{') ? JSON.parse(result) : result);
            } catch (parseError) {
              resolve(output.trim());
            }
          }
        });

        stream.on('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      console.error(`❌ Tool execution failed for user ${userId}:`, error);
      throw error;
    }
  }

  async getUserContainerInfo(userId: string): Promise<ContainerInfo> {
    try {
      const containerId = this.userContainers.get(userId);
      if (!containerId) {
        throw new Error(`No container found for user ${userId}`);
      }

      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const stats = await container.stats({ stream: false });

      return {
        id: containerId,
        dockerId: info.Id,
        status: info.State.Status,
        resourceUsage: {
          memory: this.formatMemoryUsage(stats.memory_stats),
          cpu: this.formatCpuUsage(stats.cpu_stats, stats.precpu_stats)
        },
        createdAt: info.Created,
        lastActivity: info.State.FinishedAt || new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ Failed to get container info for user ${userId}:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up user containers...');
    
    for (const [userId, containerId] of this.userContainers.entries()) {
      try {
        const container = this.docker.getContainer(containerId);
        await container.stop({ t: 10 }); // 10 second grace period
        await container.remove();
        console.log(`✅ Cleaned up container for user ${userId}`);
      } catch (error) {
        console.error(`❌ Failed to cleanup container for user ${userId}:`, error);
      }
    }
    
    this.userContainers.clear();
  }

  private async cleanupOrphanedContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: {
          label: ['starships.type=mcp-tools']
        }
      });

      for (const containerInfo of containers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          await container.stop({ t: 5 });
          await container.remove();
          console.log(`🧹 Removed orphaned container: ${containerInfo.Id}`);
        } catch (error) {
          console.error(`❌ Failed to remove orphaned container ${containerInfo.Id}:`, error);
        }
      }
    } catch (error) {
      console.error('❌ Failed to cleanup orphaned containers:', error);
    }
  }

  private buildToolCommand(toolCall: MCPToolCall): string[] {
    // Build command to execute tool in container
    // This is a simplified implementation - in practice, you'd have tool-specific executors
    return [
      'python3',
      '/app/tools/executor.py',
      toolCall.toolName,
      JSON.stringify(toolCall.parameters)
    ];
  }

  private parseMemoryLimit(memoryStr: string): number {
    // Parse memory limit string (e.g., "512m", "1g") to bytes
    const match = memoryStr.match(/^(\d+)([kmg]?)$/i);
    if (!match) return 512 * 1024 * 1024; // Default 512MB

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  private parseCpuLimit(cpuStr: string): number {
    // Parse CPU limit string (e.g., "0.5", "1.0") to CPU shares
    const cpu = parseFloat(cpuStr);
    return Math.floor(cpu * 1024); // Docker CPU shares
  }

  private formatMemoryUsage(memStats: any): string {
    if (!memStats || !memStats.usage) return '0MB';
    const mb = Math.round(memStats.usage / (1024 * 1024));
    return `${mb}MB`;
  }

  private formatCpuUsage(cpuStats: any, preCpuStats: any): string {
    if (!cpuStats || !preCpuStats) return '0%';
    
    const cpuDelta = cpuStats.cpu_usage.total_usage - preCpuStats.cpu_usage.total_usage;
    const systemDelta = cpuStats.system_cpu_usage - preCpuStats.system_cpu_usage;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      const cpuPercent = (cpuDelta / systemDelta) * cpuStats.online_cpus * 100;
      return `${Math.round(cpuPercent)}%`;
    }
    
    return '0%';
  }
}