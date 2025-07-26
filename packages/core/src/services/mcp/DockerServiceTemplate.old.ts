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
  // Brave Search MCP Server (HTTP Bridge)
  'brave': {
    slug: 'brave',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    envPrefix: 'BRAVE_',
    ports: ['8080'],
    environment: {
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-brave-search',
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
      'mcp.type': 'brave',
      'mcp.protocol': 'http',
      'mcp.runtime': 'bridge',
      'mcp.version': '1.0.0'
    },
    bridgeConfig: {
      useHttpBridge: true,
      apiKeyRequired: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-brave-search']
    }
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
 * Docker service template mappings for all MCP servers
 * This will be selected based on feature flag
 */
export const DOCKER_SERVICE_TEMPLATES: Record<string, DockerServiceTemplate> = {
  // GitHub MCP Server (Docker-based)
  'github': {
    slug: 'github',
    image: 'ghcr.io/github/github-mcp-server',
    envPrefix: 'GITHUB_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
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
      'mcp.image.source': 'ghcr.io'
    }
  },

  // Puppeteer MCP Server (NPX-based)
  'puppeteer': {
    slug: 'puppeteer',
    image: 'node:18-alpine',
    command: ['npx', '-y', '@modelcontextprotocol/server-puppeteer'],
    ports: ['3000'],
    environment: {
      // Puppeteer needs special Chrome settings in container
      PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
      DISPLAY: ':99'
    },
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '60s',
      timeout: '15s',
      retries: 3,
      start_period: '60s'
    },
    resourceLimits: {
      cpus: '1.0',  // Puppeteer needs more CPU for browser automation
      memory: '1G'  // Chrome needs more memory
    },
    labels: {
      'mcp.type': 'puppeteer',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node'
    }
  },

  // Filesystem MCP Server (NPX-based with file access)
  'filesystem': {
    slug: 'filesystem',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
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
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
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
    }
  },

  // Notion MCP Server (NPX-based)
  'notion': {
    slug: 'notion',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@notionhq/notion-mcp-server'],
    envPrefix: 'NOTION_',
    requiresCredentials: true,
    volumes: [
      { 
        source: '/data/starships/{starshipId}/credentials', 
        target: '/credentials', 
        mode: 'ro' 
      }
    ],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '45s',
      timeout: '10s',
      retries: 3,
      start_period: '45s'
    },
    resourceLimits: {
      cpus: '0.4',
      memory: '512M'
    },
    labels: {
      'mcp.type': 'notion',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.api': 'notion'
    }
  },

  // PostgreSQL MCP Server (NPX-based)
  'postgresql': {
    slug: 'postgresql',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-postgres'],
    envPrefix: 'POSTGRES_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '45s',
      timeout: '15s',
      retries: 5,
      start_period: '60s'
    },
    resourceLimits: {
      cpus: '0.5',
      memory: '512M'
    },
    labels: {
      'mcp.type': 'postgresql',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.database': 'postgresql'
    }
  },

  // Brave Search MCP Server (HTTP Bridge)
  'brave': {
    slug: 'brave',
    image: 'starships/mcp-http-bridge:latest',
    command: ['node', '/app/server.js'],
    ports: ['8080'],
    envPrefix: 'BRAVE_',
    environment: {
      // Bridge configuration
      MCP_SERVER_CMD: 'npx',
      MCP_SERVER_ARGS: '-y @modelcontextprotocol/server-brave-search',
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
      'mcp.type': 'brave-search',
      'mcp.protocol': 'http',
      'mcp.runtime': 'node',
      'mcp.api': 'brave',
      'mcp.bridge': 'http',
      'mcp.bridge.version': '1.0.0'
    },
    bridgeConfig: {
      requiresFileAccess: false,
      apiKeyRequired: true,
      healthCheckMethod: 'tools_list',
      mcpServerCmd: 'npx',
      mcpServerArgs: ['-y', '@modelcontextprotocol/server-brave-search'],
      useHttpBridge: true
    }
  },

  // Google Drive MCP Server (NPX-based with credentials)
  'gdrive': {
    slug: 'gdrive',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-gdrive'],
    envPrefix: 'GDRIVE_',
    requiresCredentials: true,
    volumes: [
      { 
        source: '/data/starships/{starshipId}/credentials', 
        target: '/credentials', 
        mode: 'ro' 
      }
    ],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '45s',
      timeout: '10s',
      retries: 3,
      start_period: '45s'
    },
    resourceLimits: {
      cpus: '0.4',
      memory: '512M'
    },
    labels: {
      'mcp.type': 'gdrive',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.api': 'google-drive'
    }
  },

  // Slack MCP Server (NPX-based)
  'slack': {
    slug: 'slack',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-slack'],
    envPrefix: 'SLACK_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
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
      'mcp.type': 'slack',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.api': 'slack'
    }
  },

  // Memory MCP Server (NPX-based)
  'memory': {
    slug: 'memory',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@modelcontextprotocol/server-memory'],
    requiresFileAccess: true,
    volumes: [
      { 
        source: '/data/starships/{starshipId}/memory', 
        target: '/data', 
        mode: 'rw' 
      }
    ],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: {
      cpus: '0.2',
      memory: '256M'
    },
    labels: {
      'mcp.type': 'memory',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.capabilities': 'persistence'
    }
  },

  // Time MCP Server (UVX/Python-based)
  'time': {
    slug: 'time',
    image: 'starships/mcp-python:latest',
    command: ['uvx', 'mcp-server-time', '--local-timezone=America/New_York'],
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
      interval: '30s',
      timeout: '10s',
      retries: 3,
      start_period: '30s'
    },
    resourceLimits: {
      cpus: '0.1',
      memory: '128M'
    },
    labels: {
      'mcp.type': 'time',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'python',
      'mcp.capabilities': 'time-utils'
    }
  },

  // Stripe MCP Server (NPX-based)
  'stripe': {
    slug: 'stripe',
    image: 'starships/mcp-node:latest',
    command: ['npx', '-y', '@stripe/mcp', '--tools=all'],
    envPrefix: 'STRIPE_',
    ports: ['3000'],
    healthcheck: {
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
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
      'mcp.type': 'stripe',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.api': 'stripe'
    }
  }
};

/**
 * Get Docker service template by slug
 */
export function getDockerServiceTemplate(slug: string): DockerServiceTemplate | null {
  return DOCKER_SERVICE_TEMPLATES[slug] || null;
}

/**
 * Get all available Docker service templates
 */
export function getAllDockerServiceTemplates(): DockerServiceTemplate[] {
  return Object.values(DOCKER_SERVICE_TEMPLATES);
}

/**
 * Validate if a template exists
 */
export function hasDockerServiceTemplate(slug: string): boolean {
  return slug in DOCKER_SERVICE_TEMPLATES;
}

/**
 * Get templates that require file access
 */
export function getFileAccessTemplates(): DockerServiceTemplate[] {
  return getAllDockerServiceTemplates().filter(t => t.requiresFileAccess);
}

/**
 * Get templates that require credentials
 */
export function getCredentialTemplates(): DockerServiceTemplate[] {
  return getAllDockerServiceTemplates().filter(t => t.requiresCredentials);
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
  
  if (template.requiresFileAccess && (!template.volumes || template.volumes.length === 0)) {
    errors.push('Template requires file access but no volumes defined');
  }
  
  if (template.requiresCredentials && (!template.volumes || !template.volumes.some(v => v.target.includes('credentials')))) {
    errors.push('Template requires credentials but no credential volume defined');
  }
  
  if (template.healthcheck) {
    if (!template.healthcheck.test || template.healthcheck.test.length === 0) {
      errors.push('Health check test command is required');
    }
  }
  
  return errors;
}

/**
 * Template statistics
 */
export function getTemplateStats() {
  const templates = getAllDockerServiceTemplates();
  
  return {
    total: templates.length,
    requiresFileAccess: templates.filter(t => t.requiresFileAccess).length,
    requiresCredentials: templates.filter(t => t.requiresCredentials).length,
    nodeRuntime: templates.filter(t => t.image.includes('mcp-node')).length,
    pythonRuntime: templates.filter(t => t.image.includes('mcp-python')).length,
    dockerImages: templates.filter(t => !t.image.includes('starships/')).length,
    httpBridge: templates.filter(t => t.bridgeConfig?.useHttpBridge !== false).length,
    stdio: templates.filter(t => t.bridgeConfig?.useHttpBridge === false).length,
    runtimes: {
      node: templates.filter(t => t.labels?.['mcp.runtime'] === 'node').length,
      python: templates.filter(t => t.labels?.['mcp.runtime'] === 'python').length,
      docker: templates.filter(t => !t.labels?.['mcp.runtime']).length
    }
  };
}

/**
 * Convert a legacy stdio template to HTTP bridge template
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
      'mcp.bridge': 'http',
      'mcp.bridge.version': '1.0.0'
    },
    bridgeConfig: {
      requiresFileAccess: template.requiresFileAccess || false,
      apiKeyRequired: !!template.envPrefix,
      healthCheckMethod: 'tools_list',
      mcpServerCmd,
      mcpServerArgs,
      useHttpBridge: true
    }
  };

  return httpBridgeTemplate;
}

/**
 * Get HTTP bridge template version of a service
 */
export function getHttpBridgeTemplate(slug: string): DockerServiceTemplate | null {
  const template = getDockerServiceTemplate(slug);
  if (!template) return null;
  
  // If already an HTTP bridge template, return as-is
  if (template.bridgeConfig?.useHttpBridge !== false) {
    return template;
  }
  
  // Convert legacy template to HTTP bridge
  return convertToHttpBridgeTemplate(template);
}

/**
 * Check if template uses HTTP bridge
 */
export function isHttpBridgeTemplate(template: DockerServiceTemplate): boolean {
  return template.bridgeConfig?.useHttpBridge !== false;
}

/**
 * Get legacy stdio template version of a service
 */
export function getLegacyTemplate(slug: string): DockerServiceTemplate | null {
  const template = getDockerServiceTemplate(slug);
  if (!template) return null;
  
  // If already a legacy template, return as-is
  if (template.bridgeConfig?.useHttpBridge === false) {
    return template;
  }
  
  // This would convert HTTP bridge back to stdio (for rollback scenarios)
  // Implementation depends on storing original commands in bridgeConfig
  if (template.bridgeConfig?.mcpServerCmd) {
    return {
      ...template,
      image: template.bridgeConfig.mcpServerCmd.includes('python') ? 'starships/mcp-python:latest' : 'node:18-alpine',
      command: [template.bridgeConfig.mcpServerCmd, ...(template.bridgeConfig.mcpServerArgs || [])],
      ports: template.ports?.filter(p => p !== '8080'),
      environment: Object.fromEntries(
        Object.entries(template.environment || {}).filter(([key]) => 
          !key.startsWith('MCP_SERVER_') && !['HTTP_PORT', 'LOG_LEVEL', 'HEALTH_CHECK_TIMEOUT', 'MAX_CONCURRENT_REQUESTS'].includes(key)
        )
      ),
      bridgeConfig: {
        ...template.bridgeConfig,
        useHttpBridge: false
      }
    };
  }
  
  return template;
}