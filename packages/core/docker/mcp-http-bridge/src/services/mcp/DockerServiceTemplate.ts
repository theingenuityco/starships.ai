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
}

/**
 * Docker service template mappings for all MCP servers
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

  // Brave Search MCP Server (NPX-based)
  'brave': {
    slug: 'brave',
    image: 'node:18-alpine',
    command: ['sh', '-c', '(echo \'{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":true},"sampling":{}}},"id":1}\'; sleep infinity) | npx -y @modelcontextprotocol/server-brave-search'],
    envPrefix: 'BRAVE_',
    healthcheck: {
      test: ['CMD', 'sh', '-c', 'pgrep -f "server-brave-search" > /dev/null'],
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
      'mcp.type': 'brave-search',
      'mcp.protocol': 'stdio',
      'mcp.runtime': 'node',
      'mcp.api': 'brave'
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
    runtimes: {
      node: templates.filter(t => t.labels?.['mcp.runtime'] === 'node').length,
      python: templates.filter(t => t.labels?.['mcp.runtime'] === 'python').length,
      docker: templates.filter(t => !t.labels?.['mcp.runtime']).length
    }
  };
}