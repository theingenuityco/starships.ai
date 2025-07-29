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
      INIT_TIMEOUT: '120000',
      NPX_DOWNLOAD_TIMEOUT: '60000',
      IGNORE_STARTUP_MESSAGES: 'true'
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

  // Memory MCP Server (HTTP Bridge)
  'memory': {
    slug: 'memory',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    volumes: [
      {
        source: '/Users/dsolanski/Documents/DevEx/starships.ai/packages/server/data/memory/{starshipId}',
        target: '/data',
        mode: 'rw'
      }
    ],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-memory --data-dir /data',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '15000',
      MAX_CONCURRENT_REQUESTS: '20',
      INIT_TIMEOUT: '60000'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 5,
      start_period: '60s'
    },
    resourceLimits: {
      cpus: '0.3',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'memory',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: false,
      requiresFileAccess: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-memory', '--data-dir', '/data']
    },
    requiresFileAccess: true,
    requiresCredentials: false
  },

  // Playwright MCP Server (HTTP Bridge)
  'playwright': {
    slug: 'playwright',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '@playwright/mcp@latest',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '30000',
      MAX_CONCURRENT_REQUESTS: '10',
      INIT_TIMEOUT: '180000'  // Playwright might take longer to initialize
    },
    volumes: [],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 5,
      start_period: '90s'  // Give more time for Playwright to start
    },
    resourceLimits: {
      cpus: '1.0',  // Playwright needs more CPU
      memory: '1024m'  // Playwright needs more memory
    },
    labels: {
      'mcp.type': 'playwright',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: false,
      requiresFileAccess: false,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['@playwright/mcp@latest']
    },
    requiresFileAccess: false,
    requiresCredentials: false
  },

  // Time MCP Server (HTTP Bridge)
  'time': {
    slug: 'time',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-time',
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '30000',
      MAX_CONCURRENT_REQUESTS: '10',
      INIT_TIMEOUT: '120000'
    },
    volumes: [],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 5,
      start_period: '60s'
    },
    resourceLimits: {
      cpus: '0.5',
      memory: '512m'
    },
    labels: {
      'mcp.type': 'time',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: false,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-time']
    },
    requiresFileAccess: false,
    requiresCredentials: false
  },

  // Filesystem MCP Server (HTTP Bridge)
  'filesystem': {
    slug: 'filesystem',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    volumes: [
      {
        source: '/data/starships/{starshipId}/filesystem',
        target: '/workspace',
        mode: 'rw'
      }
    ],
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
      start_period: '30s'
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
      apiKeyRequired: false,
      requiresFileAccess: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace']
    },
    requiresFileAccess: true
  }
};

/**
 * Default resource limits if not specified in template
 */
export function getDefaultResourceLimits(): ResourceLimits {
  return {
    cpus: '0.5',
    memory: '512M'
  };
}

/**
 * Default health check if not specified in template
 */
export function getDefaultHealthCheck(): HealthCheck {
  return {
    test: ['CMD', 'echo', 'ok'],
    interval: '30s',
    timeout: '10s',
    retries: 3
  };
}

/**
 * HTTP Bridge template for MCP servers
 * Used when no specific template exists but HTTP bridge is desired
 */
export function getHttpBridgeTemplate(slug: string, command?: string, args?: string[]): DockerServiceTemplate {
  return {
    slug,
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: command || 'npx',
      MCP_SERVER_ARGS: args?.join(' ') || `-y @modelcontextprotocol/server-${slug}`,
      HTTP_PORT: '8080',
      LOG_LEVEL: 'info',
      HEALTH_CHECK_TIMEOUT: '30000',
      MAX_CONCURRENT_REQUESTS: '10',
      INIT_TIMEOUT: '120000'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
      interval: '30s',
      timeout: '10s',
      retries: 5,
      start_period: '60s'
    },
    resourceLimits: getDefaultResourceLimits(),
    labels: {
      'mcp.type': slug,
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: false,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: command || 'npx',
      mcpServerArgs: args || ['-y', `@modelcontextprotocol/server-${slug}`]
    }
  };
}

/**
 * Legacy stdio template for MCP servers
 * Used when HTTP bridge is not available or desired
 */
export function getLegacyTemplate(slug: string, command?: string, args?: string[]): DockerServiceTemplate {
  const fullCommand = command || 'npx';
  const fullArgs = args || ['-y', `@modelcontextprotocol/server-${slug}`];
  
  return {
    slug,
    image: 'starships/mcp-node:latest',
    command: ['sh', '-c', `(echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"capabilities": {}, "clientInfo": {"name": "starship", "version": "1.0.0"}}}'; sleep infinity) | ${fullCommand} ${fullArgs.join(' ')}`],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'pgrep', '-f', slug],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: getDefaultResourceLimits(),
    labels: {
      'mcp.type': slug,
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node'
    },
    bridgeConfig: {
      useHttpBridge: false,
      healthCheckMethod: 'none'
    }
  };
}

/**
 * Get Docker service template for a given slug
 */
export function getDockerServiceTemplate(slug: string): DockerServiceTemplate | null {
  // Check if HTTP bridge is enabled globally
  const useHttpBridge = httpBridgeEnabled;
  
  if (useHttpBridge && HTTP_BRIDGE_TEMPLATES[slug]) {
    return HTTP_BRIDGE_TEMPLATES[slug];
  }
  
  if (!useHttpBridge && LEGACY_DOCKER_SERVICE_TEMPLATES[slug]) {
    return LEGACY_DOCKER_SERVICE_TEMPLATES[slug];
  }
  
  // If specific template not found, check if we have one in the other mode
  if (HTTP_BRIDGE_TEMPLATES[slug]) {
    return HTTP_BRIDGE_TEMPLATES[slug];
  }
  
  if (LEGACY_DOCKER_SERVICE_TEMPLATES[slug]) {
    return LEGACY_DOCKER_SERVICE_TEMPLATES[slug];
  }
  
  return null;
}

/**
 * Get all available Docker service templates
 */
export function getAllDockerServiceTemplates(): DockerServiceTemplate[] {
  const httpBridgeTemplates = Object.values(HTTP_BRIDGE_TEMPLATES);
  const legacyTemplates = Object.values(LEGACY_DOCKER_SERVICE_TEMPLATES);
  
  // Deduplicate by slug
  const seen = new Set<string>();
  const all: DockerServiceTemplate[] = [];
  
  // Prefer HTTP bridge templates
  for (const template of httpBridgeTemplates) {
    if (!seen.has(template.slug)) {
      seen.add(template.slug);
      all.push(template);
    }
  }
  
  // Add legacy templates not in HTTP bridge
  for (const template of legacyTemplates) {
    if (!seen.has(template.slug)) {
      seen.add(template.slug);
      all.push(template);
    }
  }
  
  return all;
}

/**
 * Build volume mapping with starshipId substitution
 */
export function buildVolumeMapping(volume: VolumeMapping, starshipId: string): string {
  const source = volume.source.replace('{starshipId}', starshipId);
  return `${source}:${volume.target}:${volume.mode}`;
}

/**
 * Get template for deployment (with HTTP bridge preference)
 */
export function getTemplateForDeployment(
  slug: string, 
  preferHttpBridge: boolean = true
): DockerServiceTemplate | null {
  if (preferHttpBridge && HTTP_BRIDGE_TEMPLATES[slug]) {
    return HTTP_BRIDGE_TEMPLATES[slug];
  }
  
  return getDockerServiceTemplate(slug);
}

/**
 * Check if a template uses HTTP bridge
 */
export function isHttpBridgeTemplate(template: DockerServiceTemplate): boolean {
  return template.bridgeConfig?.useHttpBridge === true;
}

// Global flag to control HTTP bridge usage
let httpBridgeEnabled = true;

/**
 * Enable or disable HTTP bridge globally
 */
export function setHttpBridgeEnabled(enabled: boolean): void {
  httpBridgeEnabled = enabled;
  console.log(`[DockerServiceTemplate] HTTP Bridge ${enabled ? 'enabled' : 'disabled'} globally`);
}

/**
 * Check if HTTP bridge is enabled
 */
export function isHttpBridgeEnabled(): boolean {
  return httpBridgeEnabled;
}

/**
 * Main exported templates collection with dynamic switching
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
        configurable: true
      };
    }
    return undefined;
  }
});

/**
 * Check if a template exists for the given slug
 */
export function hasDockerServiceTemplate(slug: string): boolean {
  return slug in HTTP_BRIDGE_TEMPLATES || slug in LEGACY_DOCKER_SERVICE_TEMPLATES;
}

/**
 * Get templates that require file access
 */
export function getFileAccessTemplates(): DockerServiceTemplate[] {
  const allTemplates = getAllDockerServiceTemplates();
  return allTemplates.filter(t => t.requiresFileAccess === true);
}

/**
 * Get templates that require credentials
 */
export function getCredentialTemplates(): DockerServiceTemplate[] {
  const allTemplates = getAllDockerServiceTemplates();
  return allTemplates.filter(t => t.requiresCredentials === true || t.envPrefix);
}

/**
 * Validate a template configuration
 */
export function validateTemplate(template: DockerServiceTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!template.slug) errors.push('Template must have a slug');
  if (!template.image) errors.push('Template must have an image');
  if (template.volumes) {
    template.volumes.forEach((v, i) => {
      if (!v.source) errors.push(`Volume ${i} must have a source`);
      if (!v.target) errors.push(`Volume ${i} must have a target`);
      if (!v.mode) errors.push(`Volume ${i} must have a mode`);
    });
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Get template statistics
 */
export function getTemplateStats(): {
  total: number;
  httpBridge: number;
  legacy: number;
  withFileAccess: number;
  withCredentials: number;
} {
  const httpBridgeCount = Object.keys(HTTP_BRIDGE_TEMPLATES).length;
  const legacyCount = Object.keys(LEGACY_DOCKER_SERVICE_TEMPLATES).length;
  const allTemplates = getAllDockerServiceTemplates();
  
  return {
    total: allTemplates.length,
    httpBridge: httpBridgeCount,
    legacy: legacyCount,
    withFileAccess: getFileAccessTemplates().length,
    withCredentials: getCredentialTemplates().length
  };
}