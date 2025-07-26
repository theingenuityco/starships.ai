/**
 * DockerServiceTemplate - Template mappings for MCP servers to Docker configurations
 * 
 * This module provides the mapping between MCP server templates and their
 * corresponding Docker deployment configurations.
 */

export interface VolumeMapping {
  source: string;     // Host path (supports {starshipId} placeholder)
  target: string;     // Container path
  mode: 'ro' | 'rw';  // Read-only or read-write
}

export interface HealthCheck {
  test: string[];
  interval: string;
  timeout: string;
  retries: number;
  start_period?: string;
}

export interface ResourceLimits {
  cpus: string;
  memory: string;
}

export interface BridgeConfig {
  requiresFileAccess?: boolean;        // Bridge needs file access
  apiKeyRequired?: boolean;            // Bridge requires API keys
  healthCheckMethod?: 'tools_list' | 'ping' | 'none'; // Health check method
  mcpServerCmd?: string;               // Override MCP server command
  mcpServerArgs?: string[];            // Override MCP server arguments
  useHttpBridge?: boolean;             // Use HTTP bridge (default: true)
}

export interface DockerServiceTemplate {
  slug: string;
  image: string;
  command?: string[];
  volumes?: VolumeMapping[];
  ports?: string[];                    // Internal ports (for health checks)
  envPrefix?: string;                  // Environment variable prefix
  requiresFileAccess?: boolean;        // Needs volume mounts
  requiresCredentials?: boolean;       // Needs credential files
  healthcheck?: HealthCheck;
  resourceLimits?: ResourceLimits;
  environment?: Record<string, string>; // Static environment variables
  labels?: Record<string, string>;     // Additional Docker labels
  bridgeConfig?: BridgeConfig;         // HTTP bridge configuration
}

/**
 * Legacy stdio-based Docker service template mappings for MCP servers
 * These templates use the original stdio protocol with workarounds
 */
export const LEGACY_DOCKER_SERVICE_TEMPLATES: Record<string, DockerServiceTemplate> = {
  // Brave Search MCP Server (NPX-based, stdio)
  'brave': {
    slug: 'brave',
    image: 'starships/mcp-node:latest',
    command: ['sh', '-c', '(echo \'{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"capabilities": {}, "clientInfo": {"name": "starship", "version": "1.0.0"}}}\'; sleep infinity) | npx -y @modelcontextprotocol/server-brave-search'],
    envPrefix: 'BRAVE_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'pgrep', '-f', 'server-brave-search'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: {
      cpus: '0.3',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'brave',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node'
    },
    bridgeConfig: {
      useHttpBridge: false,
      apiKeyRequired: true,
      healthCheckMethod: 'none'
    }
  },

  // GitHub MCP Server (stdio)
  'github': {
    slug: 'github',
    image: 'starships/mcp-node:latest',
    command: ['sh', '-c', '(echo \'{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"capabilities": {}, "clientInfo": {"name": "starship", "version": "1.0.0"}}}\'; sleep infinity) | npx -y @modelcontextprotocol/server-github'],
    envPrefix: 'GITHUB_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'pgrep', '-f', 'server-github'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '40s'
    },
    resourceLimits: {
      cpus: '0.5',
      memory: '512M'
    },
    labels: {
      'mcp.type': 'github',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node'
    },
    bridgeConfig: {
      useHttpBridge: false,
      apiKeyRequired: true,
      healthCheckMethod: 'none'
    }
  },

  // Puppeteer MCP Server (stdio)
  'puppeteer': {
    slug: 'puppeteer',
    image: 'starships/mcp-puppeteer:latest',
    command: ['sh', '-c', '(echo \'{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"capabilities": {}, "clientInfo": {"name": "starship", "version": "1.0.0"}}}\'; sleep infinity) | npx -y @modelcontextprotocol/server-puppeteer'],
    ports: ['3000'],
    environment: {
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
      DISPLAY: ':99'
    },
    healthcheck: {
      test: ['CMD', 'pgrep', '-f', 'server-puppeteer'],
      interval: '60s',
      timeout: '15s',
      retries: 3,
      start_period: '60s'
    },
    resourceLimits: {
      cpus: '1.0',
      memory: '1G'
    },
    labels: {
      'mcp.type': 'puppeteer',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node'
    },
    bridgeConfig: {
      useHttpBridge: false,
      healthCheckMethod: 'none'
    }
  },

  // Filesystem MCP Server (stdio with file access)
  'filesystem': {
    slug: 'filesystem',
    image: 'starships/mcp-node:latest',
    command: ['sh', '-c', '(echo \'{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"capabilities": {}, "clientInfo": {"name": "starship", "version": "1.0.0"}}}\'; sleep infinity) | npx -y @modelcontextprotocol/server-filesystem /workspace'],
    requiresFileAccess: true,
    volumes: [
      { 
        source: '/data/starships/{starshipId}/filesystem', 
        target: '/workspace', 
        mode: 'rw' 
      }
    ],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'pgrep', '-f', 'server-filesystem'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: {
      cpus: '0.3',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'filesystem',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.capabilities': 'file-access'
    },
    bridgeConfig: {
      useHttpBridge: false,
      requiresFileAccess: true,
      healthCheckMethod: 'none'
    }
  }
};

/**
 * HTTP Bridge Docker service template mappings for MCP servers  
 * These templates use the HTTP bridge architecture
 */
export const HTTP_BRIDGE_TEMPLATES: Record<string, DockerServiceTemplate> = {
  // Sequential Thinking MCP Server (HTTP Bridge)
  'sequentialthinking': {
    slug: 'sequentialthinking',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    envPrefix: 'SEQUENTIAL_',
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-sequential-thinking',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '30000',
      MAX_CONCURRENT_REQUESTS: '10',
      INIT_TIMEOUT: '90000',
      NPX_DOWNLOAD_TIMEOUT: '60000'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 5,
      start_period: '90s'
    },
    resourceLimits: {
      cpus: '0.3',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'sequentialthinking',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: false,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-sequential-thinking']
    },
    requiresFileAccess: false,
    requiresCredentials: false
  },

  // GitHub MCP Server (HTTP Bridge)  
  'github': {
    slug: 'github',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    envPrefix: 'GITHUB_',
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-github',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '10000',
      MAX_CONCURRENT_REQUESTS: '10'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '15s'
    },
    resourceLimits: {
      cpus: '0.5',
      memory: '512M'
    },
    labels: {
      'mcp.type': 'github',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-github']
    }
  },

  // Puppeteer MCP Server (HTTP Bridge)
  'puppeteer': {
    slug: 'puppeteer',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-puppeteer',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '10000',
      MAX_CONCURRENT_REQUESTS: '10',
      // Forward Puppeteer environment variables to MCP server
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
      DISPLAY: ':99'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '60s',
      timeout: '15s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: {
      cpus: '1.0',
      memory: '1G'
    },
    labels: {
      'mcp.type': 'puppeteer',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-puppeteer']
    }
  },

  // Filesystem MCP Server (HTTP Bridge with file access)
  'filesystem': {
    slug: 'filesystem',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    requiresFileAccess: true,
    volumes: [
      { 
        source: '/data/starships/{starshipId}/filesystem', 
        target: '/workspace', 
        mode: 'rw' 
      }
    ],
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-filesystem /workspace',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '10000',
      MAX_CONCURRENT_REQUESTS: '10'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '15s'
    },
    resourceLimits: {
      cpus: '0.3',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'filesystem',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0',
      'mcp.capabilities': 'file-access'
    },
    bridgeConfig: {
      useHttpBridge: true,
      requiresFileAccess: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
    }
  }
};

/**
 * Global feature flag for HTTP bridge (can be overridden via environment)
 * This controls whether new deployments use HTTP bridge or legacy stdio
 */
let httpBridgeEnabled = process.env.MCP_HTTP_BRIDGE_ENABLED !== 'false'; // Default to HTTP bridge unless explicitly disabled

/**
 * Set HTTP bridge feature flag
 */
export function setHttpBridgeEnabled(enabled: boolean): void {
  httpBridgeEnabled = enabled;
}

/**
 * Get current HTTP bridge feature flag status
 */
export function getHttpBridgeEnabled(): boolean {
  return httpBridgeEnabled;
}


/**
 * Docker service template mappings for all MCP servers
 * Returns the appropriate template based on HTTP bridge feature flag
 */
export const DOCKER_SERVICE_TEMPLATES: Record<string, DockerServiceTemplate> = new Proxy({}, {
  get(target: any, slug: string) {
    if (typeof slug !== 'string') return undefined;
    
    // Choose template collection based on feature flag
    const templates = httpBridgeEnabled ? HTTP_BRIDGE_TEMPLATES : LEGACY_DOCKER_SERVICE_TEMPLATES;
    return templates[slug] || null;
  },
  
  ownKeys(target: any) {
    // Return all available template slugs from both collections
    const httpBridgeKeys = Object.keys(HTTP_BRIDGE_TEMPLATES);
    const legacyKeys = Object.keys(LEGACY_DOCKER_SERVICE_TEMPLATES);
    
    // Combine and deduplicate keys
    return [...new Set([...httpBridgeKeys, ...legacyKeys])];
  },
  
  has(target: any, slug: string) {
    return slug in HTTP_BRIDGE_TEMPLATES || slug in LEGACY_DOCKER_SERVICE_TEMPLATES;
  },
  
  getOwnPropertyDescriptor(target: any, slug: string) {
    if (this.has!(target, slug)) {
      return {
        enumerable: true,
        configurable: true,
        value: this.get!(target, slug, target)
      };
    }
    return undefined;
  }
});

/**
 * Get Docker service template by slug
 */
export function getDockerServiceTemplate(slug: string): DockerServiceTemplate | null {
  return DOCKER_SERVICE_TEMPLATES[slug] || null;
}

/**
 * Get all available Docker service templates
 */
export function getAllDockerServiceTemplates(): Record<string, DockerServiceTemplate> {
  // Use the proxy to get templates based on current feature flag
  const templates: Record<string, DockerServiceTemplate> = {};
  const slugs = Object.keys(DOCKER_SERVICE_TEMPLATES);
  
  for (const slug of slugs) {
    const template = DOCKER_SERVICE_TEMPLATES[slug];
    if (template) {
      templates[slug] = template;
    }
  }
  
  return templates;
}

/**
 * Get HTTP bridge template version of a service
 */
export function getHttpBridgeTemplate(slug: string): DockerServiceTemplate | null {
  return HTTP_BRIDGE_TEMPLATES[slug] || null;
}

/**
 * Get legacy stdio template version of a service
 */
export function getLegacyTemplate(slug: string): DockerServiceTemplate | null {
  return LEGACY_DOCKER_SERVICE_TEMPLATES[slug] || null;
}

/**
 * Check if template uses HTTP bridge
 */
export function isHttpBridgeTemplate(template: DockerServiceTemplate): boolean {
  return template.bridgeConfig?.useHttpBridge !== false;
}

/**
 * Convert legacy template to HTTP bridge template
 */
export function convertToHttpBridgeTemplate(template: DockerServiceTemplate): DockerServiceTemplate {
  // Extract MCP server command from original template
  const mcpServerCmd = template.command?.[0] || 'npx';
  const mcpServerArgs = template.command?.slice(1) || [];
  
  // Create HTTP bridge template
  const httpBridgeTemplate: DockerServiceTemplate = {
    ...template,
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    environment: {
      ...template.environment,
      // Bridge configuration
      MCP_SERVER_CMD: mcpServerCmd,
      MCP_SERVER_ARGS: mcpServerArgs.join(' '),
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '10000',
      MAX_CONCURRENT_REQUESTS: '10'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '15s'
    },
    labels: {
      ...template.labels,
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      ...template.bridgeConfig,
      useHttpBridge: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd,
      mcpServerArgs
    }
  };
  
  return httpBridgeTemplate;
}

/**
 * Template selection based on feature flag
 */
export function getTemplateForDeployment(slug: string, forceHttpBridge?: boolean): DockerServiceTemplate | null {
  // Allow override of global feature flag
  const useHttpBridge = forceHttpBridge !== undefined ? forceHttpBridge : httpBridgeEnabled;
  
  if (useHttpBridge) {
    return HTTP_BRIDGE_TEMPLATES[slug] || null;
  } else {
    return LEGACY_DOCKER_SERVICE_TEMPLATES[slug] || null;
  }
}

/**
 * Check if template exists by slug
 */
export function hasDockerServiceTemplate(slug: string): boolean {
  return slug in HTTP_BRIDGE_TEMPLATES || slug in LEGACY_DOCKER_SERVICE_TEMPLATES;
}

/**
 * Get templates that require file access
 */
export function getFileAccessTemplates(): DockerServiceTemplate[] {
  const templates = getAllDockerServiceTemplates();
  return Object.values(templates).filter(t => t.requiresFileAccess);
}

/**
 * Get templates that require credentials
 */
export function getCredentialTemplates(): DockerServiceTemplate[] {
  const templates = getAllDockerServiceTemplates();
  return Object.values(templates).filter(t => t.requiresCredentials);
}

/**
 * Build volume mappings for a specific starship
 */
export function buildVolumeMapping(
  template: DockerServiceTemplate, 
  starshipId: string
): string[] {
  if (!template.volumes) return [];
  
  return template.volumes.map(vol => {
    const source = vol.source.replace('{starshipId}', starshipId);
    return `${source}:${vol.target}:${vol.mode}`;
  });
}

/**
 * Get default resource limits
 */
export function getDefaultResourceLimits(): ResourceLimits {
  return {
    cpus: '0.5',
    memory: '512M'
  };
}

/**
 * Validate template configuration
 */
export function validateTemplate(template: DockerServiceTemplate): string[] {
  const errors: string[] = [];
  
  if (!template.slug || template.slug.trim() === '') {
    errors.push('Template slug is required');
  }
  
  if (!template.image || template.image.trim() === '') {
    errors.push('Template image is required');
  }
  
  if (template.ports && template.ports.length === 0) {
    errors.push('Template must have at least one port');
  }
  
  if (template.healthcheck && (!template.healthcheck.test || template.healthcheck.test.length === 0)) {
    errors.push('Health check test is required when healthcheck is specified');
  }
  
  return errors;
}

/**
 * Template statistics
 */
export function getTemplateStats() {
  const templates = getAllDockerServiceTemplates();
  const templateList = Object.values(templates);
  
  return {
    total: templateList.length,
    requiresFileAccess: templateList.filter(t => t.requiresFileAccess).length,
    requiresCredentials: templateList.filter(t => t.requiresCredentials).length,
    nodeRuntime: templateList.filter(t => t.image.includes('mcp-node')).length,
    pythonRuntime: templateList.filter(t => t.image.includes('mcp-python')).length,
    dockerImages: templateList.filter(t => !t.image.includes('starships/')).length,
    httpBridge: templateList.filter(t => t.bridgeConfig?.useHttpBridge !== false).length,
    stdio: templateList.filter(t => t.bridgeConfig?.useHttpBridge === false).length,
    runtimes: {
      node: templateList.filter(t => t.labels?.['mcp.runtime'] === 'node').length,
      python: templateList.filter(t => t.labels?.['mcp.runtime'] === 'python').length,
      docker: templateList.filter(t => !t.labels?.['mcp.runtime']).length,
      bridge: templateList.filter(t => t.labels?.['mcp.runtime'] === 'bridge').length
    }
  };
}