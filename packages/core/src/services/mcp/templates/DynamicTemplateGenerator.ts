/**
 * DynamicTemplateGenerator - Generates deployment templates from Neo4j graph data
 * 
 * This generator queries MCPServerOption nodes from Neo4j and generates
 * deployment templates with intelligent defaults based on the command type.
 * Replaces the hardcoded DockerServiceTemplate approach.
 */

import { MCPServerOption, MCPServerOptionRepository } from '@starships/models';
import { RepositoryFactory } from '@starships/models';

export interface DeploymentTemplate {
  slug: string;
  image: string;
  runtime: {
    command: string;
    args: string[];
    slowStart: boolean;
  };
  resources: {
    requests: {
      cpu: string;
      memory: string;
    };
    limits: {
      cpu: string;
      memory: string;
    };
  };
  healthCheck: {
    path: string;
    interval: number;
    timeout: number;
    retries: number;
    startupTimeout: number;
  };
  environment: Record<string, string>;
  volumes?: Array<{
    source: string;
    target: string;
    mode: 'ro' | 'rw';
  }>;
  networking?: {
    httpPort: number;
    requiresPrivileged?: boolean;
  };
}

/**
 * Dynamic template generator that creates deployment configurations
 * from Neo4j graph data with intelligent defaults
 */
export class DynamicTemplateGenerator {
  private mcpServerOptionRepo: MCPServerOptionRepository;
  private templateCache: Map<string, DeploymentTemplate> = new Map();

  constructor() {
    this.mcpServerOptionRepo = RepositoryFactory.getMCPServerOptionRepository();
  }

  /**
   * Generate a deployment template from Neo4j node
   */
  async generateTemplate(slug: string): Promise<DeploymentTemplate> {
    // Check cache first
    if (this.templateCache.has(slug)) {
      return this.templateCache.get(slug)!;
    }

    // Query Neo4j for the MCPServerOption node
    const node = await this.queryMCPServerOption(slug);
    
    if (!node) {
      throw new Error(`MCPServerOption not found for slug: ${slug}`);
    }

    // Generate template with intelligent defaults
    const template = this.buildTemplate(node);
    
    // Cache for future use
    this.templateCache.set(slug, template);
    
    return template;
  }

  /**
   * Query MCPServerOption from Neo4j by slug
   */
  private async queryMCPServerOption(slug: string): Promise<MCPServerOption | null> {
    try {
      // Query by slug
      const node = await this.mcpServerOptionRepo.findBySlug(slug);
      
      if (!node) {
        // Fallback: try to find by normalized name
        const allNodes = await this.mcpServerOptionRepo.findAll();
        return allNodes.find(n => 
          n.slug === slug || 
          n.name.toLowerCase().replace(/\s+/g, '-') === slug
        ) || null;
      }
      
      return node;
    } catch (error) {
      console.error(`[DynamicTemplateGenerator] Failed to query MCPServerOption:`, error);
      return null;
    }
  }

  /**
   * Build deployment template from MCPServerOption node
   */
  private buildTemplate(node: MCPServerOption): DeploymentTemplate {
    // Parse any additional properties from the node
    const nodeData = node as any;
    
    // Parse environment variables
    let envVars: Record<string, string> = {};
    try {
      if (node.env) {
        const parsed = JSON.parse(node.env);
        if (typeof parsed === 'object' && parsed !== null) {
          envVars = parsed;
        }
      }
    } catch (error) {
      console.warn(`[DynamicTemplateGenerator] Failed to parse env for ${node.slug}:`, error);
    }

    return {
      slug: node.slug,
      image: nodeData.image || 'localhost:5001/starships/mcp-http-bridge:latest',
      
      runtime: {
        command: node.command || 'npx',
        args: node.args || [],
        slowStart: nodeData.startupTimeout > 60 || this.isSlowStartCommand(node.command)
      },
      
      resources: {
        requests: {
          cpu: nodeData.cpuRequest || this.getDefaultCpuRequest(node.command),
          memory: nodeData.memoryRequest || this.getDefaultMemoryRequest(node.command)
        },
        limits: {
          cpu: nodeData.cpuLimit || this.getDefaultCpuLimit(node.command),
          memory: nodeData.memoryLimit || this.getDefaultMemoryLimit(node.command)
        }
      },
      
      healthCheck: {
        path: nodeData.healthCheckPath || '/health',
        interval: nodeData.healthCheckInterval || 30,
        timeout: nodeData.healthCheckTimeout || 10,
        retries: nodeData.healthCheckRetries || 3,
        startupTimeout: nodeData.startupTimeout || this.getDefaultStartupTimeout(node.command)
      },
      
      environment: {
        ...envVars,
        MCP_SERVER_CMD: node.command || 'npx',
        MCP_SERVER_ARGS: (node.args || []).join(' '),
        HTTP_PORT: (nodeData.httpPort || 8080).toString(),
        LOG_LEVEL: 'info',
        HEALTH_CHECK_TIMEOUT: '30000',
        MAX_CONCURRENT_REQUESTS: '10',
        INIT_TIMEOUT: (this.getDefaultStartupTimeout(node.command) * 1000).toString()
      },
      
      volumes: nodeData.volumes ? this.parseVolumes(nodeData.volumes) : undefined,
      
      networking: {
        httpPort: nodeData.httpPort || 8080,
        requiresPrivileged: nodeData.requiresPrivileged || false
      }
    };
  }

  /**
   * Parse volume configuration
   */
  private parseVolumes(volumes: string[] | any[]): DeploymentTemplate['volumes'] {
    return volumes.map(v => {
      if (typeof v === 'string') {
        // Parse string format: "/source:/target:mode"
        const parts = v.split(':');
        return {
          source: parts[0] || '/data',
          target: parts[1] || '/data',
          mode: (parts[2] as 'ro' | 'rw') || 'rw'
        };
      }
      return v;
    });
  }

  /**
   * Get default CPU request based on command type
   */
  private getDefaultCpuRequest(command?: string): string {
    switch (command) {
      case 'docker':
        return '200m';  // Docker needs more CPU
      case 'python':
      case 'uvx':
        return '100m';  // Python moderate CPU
      case 'npx':
        return '100m';  // Node moderate CPU
      default:
        return '100m';  // Safe default
    }
  }

  /**
   * Get default CPU limit based on command type
   */
  private getDefaultCpuLimit(command?: string): string {
    switch (command) {
      case 'docker':
        return '1000m'; // Docker needs more CPU
      case 'python':
      case 'uvx':
        return '500m';  // Python moderate CPU
      case 'npx':
        return '500m';  // Node moderate CPU
      default:
        return '500m';  // Safe default
    }
  }

  /**
   * Get default memory request based on command type
   */
  private getDefaultMemoryRequest(command?: string): string {
    switch (command) {
      case 'python':
      case 'uvx':
        return '256Mi'; // Python needs more memory
      case 'docker':
        return '512Mi'; // Docker needs most
      case 'npx':
        return '128Mi'; // Node moderate memory
      default:
        return '128Mi'; // Safe default
    }
  }

  /**
   * Get default memory limit based on command type
   */
  private getDefaultMemoryLimit(command?: string): string {
    switch (command) {
      case 'python':
      case 'uvx':
        return '1Gi';   // Python needs more memory
      case 'docker':
        return '2Gi';   // Docker needs most
      case 'npx':
        return '512Mi'; // Node moderate memory
      default:
        return '512Mi'; // Safe default
    }
  }

  /**
   * Get default startup timeout based on command type
   */
  private getDefaultStartupTimeout(command?: string): number {
    // Commands that download packages need more time
    if (this.isSlowStartCommand(command)) {
      return 120; // 2 minutes for package downloads
    }
    return 60;    // 1 minute default
  }

  /**
   * Check if command typically has slow startup
   */
  private isSlowStartCommand(command?: string): boolean {
    return ['npx', 'uvx', 'pip', 'python', 'npm', 'yarn', 'pnpm'].includes(command || '');
  }

  /**
   * Generate template for a specific connector
   */
  async generateForConnector(connectorId: string, templateId: string): Promise<DeploymentTemplate> {
    // Get the base template
    const mcpOption = await this.mcpServerOptionRepo.findById(templateId);
    
    if (!mcpOption) {
      throw new Error(`MCPServerOption not found with ID: ${templateId}`);
    }
    
    return this.generateTemplate(mcpOption.slug);
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
    console.log('[DynamicTemplateGenerator] Template cache cleared');
  }

  /**
   * Get all available templates from Neo4j
   */
  async getAllTemplates(): Promise<DeploymentTemplate[]> {
    try {
      const allNodes = await this.mcpServerOptionRepo.findAll();
      const templates: DeploymentTemplate[] = [];
      
      for (const node of allNodes) {
        if (node.slug) {
          const template = await this.generateTemplate(node.slug);
          templates.push(template);
        }
      }
      
      return templates;
    } catch (error) {
      console.error('[DynamicTemplateGenerator] Failed to get all templates:', error);
      return [];
    }
  }

  /**
   * Validate if a template exists in Neo4j
   */
  async validateTemplate(slug: string): Promise<boolean> {
    const node = await this.queryMCPServerOption(slug);
    return node !== null;
  }

  /**
   * Get template metadata without full generation
   */
  async getTemplateMetadata(slug: string): Promise<{
    name: string;
    command: string;
    requiresApiKeys: boolean;
    estimatedStartupTime: number;
  } | null> {
    const node = await this.queryMCPServerOption(slug);
    
    if (!node) {
      return null;
    }
    
    // Check if env contains any required API keys
    let requiresApiKeys = false;
    try {
      if (node.env) {
        const envVars = JSON.parse(node.env);
        requiresApiKeys = Object.keys(envVars).some(key => 
          key.includes('API_KEY') || 
          key.includes('TOKEN') || 
          key.includes('SECRET')
        );
      }
    } catch (error) {
      // Ignore parse errors
    }
    
    return {
      name: node.name,
      command: node.command || 'npx',
      requiresApiKeys,
      estimatedStartupTime: this.getDefaultStartupTimeout(node.command)
    };
  }
}

// Export singleton instance
export const dynamicTemplateGenerator = new DynamicTemplateGenerator();