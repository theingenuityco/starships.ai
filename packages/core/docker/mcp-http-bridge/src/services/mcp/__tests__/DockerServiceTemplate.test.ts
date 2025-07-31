import {
  DockerServiceTemplate,
  VolumeMapping,
  HealthCheck,
  ResourceLimits,
  getDockerServiceTemplate,
  getAllDockerServiceTemplates,
  hasDockerServiceTemplate,
  getFileAccessTemplates,
  getCredentialTemplates,
  buildVolumeMapping,
  getDefaultResourceLimits,
  validateTemplate,
  getTemplateStats,
  DOCKER_SERVICE_TEMPLATES
} from '../DockerServiceTemplate';

describe('DockerServiceTemplate', () => {
  describe('Template Registry', () => {
    it('should have templates for all 11 MCP servers', () => {
      const expectedSlugs = [
        'github', 'puppeteer', 'filesystem', 'notion', 'postgresql',
        'brave', 'gdrive', 'slack', 'memory', 'time', 'stripe'
      ];

      expectedSlugs.forEach(slug => {
        expect(hasDockerServiceTemplate(slug)).toBe(true);
        expect(getDockerServiceTemplate(slug)).toBeTruthy();
      });

      const allTemplates = getAllDockerServiceTemplates();
      expect(allTemplates).toHaveLength(11);
    });

    it('should return null for non-existent template', () => {
      expect(getDockerServiceTemplate('nonexistent')).toBeNull();
      expect(hasDockerServiceTemplate('nonexistent')).toBe(false);
    });

    it('should have correct template structure for GitHub', () => {
      const template = getDockerServiceTemplate('github');
      expect(template).toMatchObject({
        slug: 'github',
        image: 'ghcr.io/github/github-mcp-server',
        envPrefix: 'GITHUB_',
        ports: ['3000'],
        healthcheck: expect.objectContaining({
          test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
          interval: '30s',
          timeout: '10s',
          retries: 3
        }),
        resourceLimits: {
          cpus: '0.5',
          memory: '512M'
        },
        labels: expect.objectContaining({
          'mcp.type': 'github',
          'mcp.protocol': 'stdio'
        })
      });
    });

    it('should have correct template structure for Filesystem', () => {
      const template = getDockerServiceTemplate('filesystem');
      expect(template).toMatchObject({
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
        ]
      });
    });

    it('should have correct template structure for Puppeteer', () => {
      const template = getDockerServiceTemplate('puppeteer');
      expect(template).toMatchObject({
        slug: 'puppeteer',
        image: 'starships/mcp-node:latest',
        command: ['npx', '-y', '@modelcontextprotocol/server-puppeteer'],
        environment: {
          PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true',
          PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium-browser',
          DISPLAY: ':99'
        },
        resourceLimits: {
          cpus: '1.0',
          memory: '1G'
        }
      });
    });

    it('should have correct template structure for Time (Python)', () => {
      const template = getDockerServiceTemplate('time');
      expect(template).toMatchObject({
        slug: 'time',
        image: 'starships/mcp-python:latest',
        command: ['uvx', 'mcp-server-time', '--local-timezone=America/New_York'],
        resourceLimits: {
          cpus: '0.1',
          memory: '128M'
        },
        labels: expect.objectContaining({
          'mcp.runtime': 'python'
        })
      });
    });
  });

  describe('Template Filtering', () => {
    it('should identify templates that require file access', () => {
      const fileAccessTemplates = getFileAccessTemplates();
      const slugs = fileAccessTemplates.map(t => t.slug);
      
      expect(slugs).toContain('filesystem');
      expect(slugs).toContain('memory');
      expect(slugs).not.toContain('github');
      expect(slugs).not.toContain('brave');
    });

    it('should identify templates that require credentials', () => {
      const credentialTemplates = getCredentialTemplates();
      const slugs = credentialTemplates.map(t => t.slug);
      
      expect(slugs).toContain('notion');
      expect(slugs).toContain('gdrive');
      expect(slugs).not.toContain('filesystem');
      expect(slugs).not.toContain('memory');
    });

    it('should categorize all templates correctly', () => {
      const allTemplates = getAllDockerServiceTemplates();
      const fileAccessCount = allTemplates.filter(t => t.requiresFileAccess).length;
      const credentialCount = allTemplates.filter(t => t.requiresCredentials).length;
      
      expect(fileAccessCount).toBeGreaterThan(0);
      expect(credentialCount).toBeGreaterThan(0);
      expect(fileAccessCount + credentialCount).toBeLessThanOrEqual(allTemplates.length);
    });
  });

  describe('Volume Mapping', () => {
    it('should build correct volume mappings for filesystem template', () => {
      const template = getDockerServiceTemplate('filesystem')!;
      const volumes = buildVolumeMapping(template, 'ship-123');
      
      expect(volumes).toEqual([
        '/data/starships/ship-123/filesystem:/workspace:rw'
      ]);
    });

    it('should build correct volume mappings for gdrive template', () => {
      const template = getDockerServiceTemplate('gdrive')!;
      const volumes = buildVolumeMapping(template, 'ship-456');
      
      expect(volumes).toEqual([
        '/data/starships/ship-456/credentials:/credentials:ro'
      ]);
    });

    it('should return empty array for templates without volumes', () => {
      const template = getDockerServiceTemplate('github')!;
      const volumes = buildVolumeMapping(template, 'ship-789');
      
      expect(volumes).toEqual([]);
    });

    it('should handle multiple volumes correctly', () => {
      // Create a mock template with multiple volumes
      const mockTemplate: DockerServiceTemplate = {
        slug: 'test',
        image: 'test:latest',
        volumes: [
          { source: '/data/starships/{starshipId}/data', target: '/data', mode: 'rw' },
          { source: '/data/starships/{starshipId}/config', target: '/config', mode: 'ro' }
        ]
      };

      const volumes = buildVolumeMapping(mockTemplate, 'ship-multi');
      
      expect(volumes).toEqual([
        '/data/starships/ship-multi/data:/data:rw',
        '/data/starships/ship-multi/config:/config:ro'
      ]);
    });
  });

  describe('Resource Management', () => {
    it('should provide default resource limits', () => {
      const defaults = getDefaultResourceLimits();
      expect(defaults).toEqual({
        cpus: '0.5',
        memory: '512M'
      });
    });

    it('should have appropriate resource limits for different templates', () => {
      // Time server should be lightweight
      const timeTemplate = getDockerServiceTemplate('time')!;
      expect(timeTemplate.resourceLimits?.memory).toBe('128M');
      expect(timeTemplate.resourceLimits?.cpus).toBe('0.1');

      // Puppeteer should have more resources
      const puppeteerTemplate = getDockerServiceTemplate('puppeteer')!;
      expect(puppeteerTemplate.resourceLimits?.memory).toBe('1G');
      expect(puppeteerTemplate.resourceLimits?.cpus).toBe('1.0');
    });
  });

  describe('Health Checks', () => {
    it('should have health checks for all templates', () => {
      const allTemplates = getAllDockerServiceTemplates();
      
      allTemplates.forEach(template => {
        expect(template.healthcheck).toBeDefined();
        expect(template.healthcheck?.test).toContain('CMD');
        expect(template.healthcheck?.test).toContain('curl');
        expect(template.healthcheck?.interval).toBeDefined();
        expect(template.healthcheck?.timeout).toBeDefined();
        expect(template.healthcheck?.retries).toBeGreaterThan(0);
      });
    });

    it('should have different health check timings for different services', () => {
      const githubTemplate = getDockerServiceTemplate('github')!;
      const puppeteerTemplate = getDockerServiceTemplate('puppeteer')!;
      
      // Puppeteer should have longer intervals due to browser startup time
      expect(puppeteerTemplate.healthcheck?.interval).toBe('60s');
      expect(puppeteerTemplate.healthcheck?.start_period).toBe('60s');
      
      // GitHub should have standard intervals
      expect(githubTemplate.healthcheck?.interval).toBe('30s');
    });
  });

  describe('Template Validation', () => {
    it('should validate correct templates without errors', () => {
      const template = getDockerServiceTemplate('github')!;
      const errors = validateTemplate(template);
      expect(errors).toHaveLength(0);
    });

    it('should detect missing slug', () => {
      const invalidTemplate: DockerServiceTemplate = {
        slug: '',
        image: 'test:latest'
      };
      
      const errors = validateTemplate(invalidTemplate);
      expect(errors).toContain('Template slug is required');
    });

    it('should detect missing image', () => {
      const invalidTemplate: DockerServiceTemplate = {
        slug: 'test',
        image: ''
      };
      
      const errors = validateTemplate(invalidTemplate);
      expect(errors).toContain('Template image is required');
    });

    it('should detect file access requirements without volumes', () => {
      const invalidTemplate: DockerServiceTemplate = {
        slug: 'test',
        image: 'test:latest',
        requiresFileAccess: true
      };
      
      const errors = validateTemplate(invalidTemplate);
      expect(errors).toContain('Template requires file access but no volumes defined');
    });

    it('should detect credential requirements without credential volumes', () => {
      const invalidTemplate: DockerServiceTemplate = {
        slug: 'test',
        image: 'test:latest',
        requiresCredentials: true,
        volumes: [
          { source: '/data/test', target: '/data', mode: 'rw' }
        ]
      };
      
      const errors = validateTemplate(invalidTemplate);
      expect(errors).toContain('Template requires credentials but no credential volume defined');
    });

    it('should detect missing health check test', () => {
      const invalidTemplate: DockerServiceTemplate = {
        slug: 'test',
        image: 'test:latest',
        healthcheck: {
          test: [],
          interval: '30s',
          timeout: '10s',
          retries: 3
        }
      };
      
      const errors = validateTemplate(invalidTemplate);
      expect(errors).toContain('Health check test command is required');
    });

    it('should validate all built-in templates', () => {
      const allTemplates = getAllDockerServiceTemplates();
      
      allTemplates.forEach(template => {
        const errors = validateTemplate(template);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('Template Statistics', () => {
    it('should provide accurate template statistics', () => {
      const stats = getTemplateStats();
      
      expect(stats.total).toBe(11);
      expect(stats.requiresFileAccess).toBeGreaterThan(0);
      expect(stats.requiresCredentials).toBeGreaterThan(0);
      expect(stats.nodeRuntime).toBeGreaterThan(0);
      expect(stats.pythonRuntime).toBeGreaterThan(0);
      expect(stats.dockerImages).toBeGreaterThan(0);
      
      // Verify runtime counts add up correctly
      expect(stats.runtimes.node + stats.runtimes.python + stats.runtimes.docker).toBe(stats.total);
    });

    it('should count node runtime templates correctly', () => {
      const nodeTemplates = getAllDockerServiceTemplates()
        .filter(t => t.image.includes('mcp-node'));
      const stats = getTemplateStats();
      
      expect(stats.nodeRuntime).toBe(nodeTemplates.length);
    });

    it('should count Python runtime templates correctly', () => {
      const pythonTemplates = getAllDockerServiceTemplates()
        .filter(t => t.image.includes('mcp-python'));
      const stats = getTemplateStats();
      
      expect(stats.pythonRuntime).toBe(pythonTemplates.length);
    }); 

    it('should identify external Docker images correctly', () => {
      const externalImages = getAllDockerServiceTemplates()
        .filter(t => !t.image.includes('starships/'));
      const stats = getTemplateStats();
      
      expect(stats.dockerImages).toBe(externalImages.length);
      expect(stats.dockerImages).toBeGreaterThanOrEqual(1); // At least GitHub
    });
  });

  describe('Template Registry Consistency', () => {
    it('should have consistent naming between slugs and template keys', () => {
      Object.entries(DOCKER_SERVICE_TEMPLATES).forEach(([key, template]) => {
        expect(key).toBe(template.slug);
      });
    });

    it('should have consistent label patterns', () => {
      const allTemplates = getAllDockerServiceTemplates();
      
      allTemplates.forEach(template => {
        expect(template.labels?.['mcp.type']).toBe(template.slug);
        expect(template.labels?.['mcp.protocol']).toBe('stdio');
        
        if (template.image.includes('mcp-node')) {
          expect(template.labels?.['mcp.runtime']).toBe('node');
        } else if (template.image.includes('mcp-python')) {
          expect(template.labels?.['mcp.runtime']).toBe('python');
        }
      });
    });

    it('should have consistent port configurations', () => {
      const allTemplates = getAllDockerServiceTemplates();
      
      allTemplates.forEach(template => {
        if (template.ports) {
          expect(template.ports).toContain('3000');
        }
      });
    });

    it('should have appropriate resource limits for template types', () => {
      const allTemplates = getAllDockerServiceTemplates();
      
      allTemplates.forEach(template => {
        if (template.resourceLimits) {
          // CPU limits should be reasonable
          const cpuValue = parseFloat(template.resourceLimits.cpus);
          expect(cpuValue).toBeGreaterThan(0);
          expect(cpuValue).toBeLessThanOrEqual(2); // Max 2 CPUs
          
          // Memory limits should be reasonable
          const memValue = template.resourceLimits.memory.replace(/[GMK]/gi, '');
          const memNum = parseInt(memValue);
          expect(memNum).toBeGreaterThan(0);
          expect(memNum).toBeLessThanOrEqual(2048); // Max 2GB for any service
        }
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle starship IDs with special characters in volume mapping', () => {
      const template = getDockerServiceTemplate('filesystem')!;
      const volumes = buildVolumeMapping(template, 'ship-test_123.special');
      
      expect(volumes[0]).toContain('ship-test_123.special');
    });

    it('should handle templates with no environment variables', () => {
      const template = getDockerServiceTemplate('memory')!;
      expect(template.environment).toBeUndefined();
    });

    it('should handle templates with static environment variables', () => {
      const template = getDockerServiceTemplate('puppeteer')!;
      expect(template.environment).toBeDefined();
      expect(template.environment?.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD).toBe('true');
    });
  });
});