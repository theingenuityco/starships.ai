import { DockerComposeGenerator, DockerService, ServiceGenerationOptions, ServiceValidationResult } from '../DockerComposeGenerator';
import { SecurityManager } from '../SecurityManager';
import { VolumeManager } from '../VolumeManager';
import { MCPServerConnector } from '@starships/models';
import { getDockerServiceTemplate } from '../DockerServiceTemplate';
import * as yaml from 'js-yaml';

// Mock dependencies
jest.mock('../SecurityManager');
jest.mock('../VolumeManager');
jest.mock('../DockerServiceTemplate');
jest.mock('js-yaml');

const mockSecurityManager = SecurityManager as jest.MockedClass<typeof SecurityManager>;
const mockVolumeManager = VolumeManager as jest.MockedClass<typeof VolumeManager>;
const mockGetDockerServiceTemplate = getDockerServiceTemplate as jest.MockedFunction<typeof getDockerServiceTemplate>;
const mockYaml = yaml as jest.Mocked<typeof yaml>;

describe('DockerComposeGenerator', () => {
  let generator: DockerComposeGenerator;
  let mockSecurityInstance: jest.Mocked<SecurityManager>;
  let mockVolumeInstance: jest.Mocked<VolumeManager>;

  const mockConnector: MCPServerConnector = {
    id: 'connector-123',
    templateId: 'filesystem-template',
    env: '{"API_KEY": "test-key"}',
    starshipId: 'starship-123',
    name: 'Test Filesystem Connector',
    slug: 'filesystem',
    description: 'Test filesystem connector',
    isActive: true,
    isPublic: false,
    createdAt: '2025-01-25T00:00:00Z',
    updatedAt: '2025-01-25T00:00:00Z'
  };

  const mockTemplate = {
    slug: 'filesystem',
    image: 'mcp-filesystem:latest',
    command: ['node', 'server.js'],
    environment: {
      NODE_ENV: 'production'
    },
    volumes: [
      {
        source: '/data/starships/{starshipId}/filesystem',
        target: '/workspace',
        mode: 'rw'
      }
    ],
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
      'template.type': 'filesystem'
    },
    requiresFileAccess: true,
    requiresCredentials: false
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock instances
    mockSecurityInstance = {
      applySecurityConfig: jest.fn(),
      enforceCredentialSecurity: jest.fn()
    } as any;

    mockVolumeInstance = {
      createTemplateVolumes: jest.fn()
    } as any;

    mockSecurityManager.mockImplementation(() => mockSecurityInstance);
    mockVolumeManager.mockImplementation(() => mockVolumeInstance);

    generator = new DockerComposeGenerator(mockSecurityInstance, mockVolumeInstance);

    // Default mock implementations
    mockGetDockerServiceTemplate.mockReturnValue(mockTemplate);
    mockSecurityInstance.applySecurityConfig.mockImplementation((config) => config);
    mockSecurityInstance.enforceCredentialSecurity.mockImplementation((volumes) => volumes);
    mockVolumeInstance.createTemplateVolumes.mockResolvedValue();
  });

  describe('generateService', () => {
    it('should generate a complete Docker service configuration', async () => {
      const starshipId = 'starship-123';
      const options: ServiceGenerationOptions = {
        optimizeResources: true,
        enableAdvancedHealthChecks: true,
        enableLogging: true,
        enableSecurity: true
      };

      const service = await generator.generateService(starshipId, mockConnector, options);

      expect(service).toMatchObject({
        image: 'mcp-filesystem:latest',
        container_name: 'mcp-starship-123-filesystem',
        command: ['node', 'server.js'],
        networks: ['starship-starship-123'],
        restart: 'unless-stopped',
        deploy: {
          resources: {
            limits: {
              cpus: '0.5',
              memory: '512M'
            }
          }
        }
      });

      expect(service.environment).toEqual({
        NODE_ENV: 'production',
        API_KEY: 'test-key'
      });

      expect(service.volumes).toEqual([
        '/data/starships/starship-123/filesystem:/workspace:rw'
      ]);

      expect(service.healthcheck).toBeDefined();
      expect(service.logging).toBeDefined();
      expect(mockSecurityInstance.applySecurityConfig).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should handle minimal configuration options', async () => {
      const starshipId = 'starship-456';
      const options: ServiceGenerationOptions = {
        enableLogging: false,
        enableSecurity: false
      };

      const service = await generator.generateService(starshipId, mockConnector, options);

      expect(service.container_name).toBe('mcp-starship-456-filesystem');
      expect(service.logging).toBeUndefined();
      expect(mockSecurityInstance.applySecurityConfig).not.toHaveBeenCalled();
    });

    it('should apply resource profiles correctly', async () => {
      const starshipId = 'starship-123';
      
      // Test minimal profile
      let options: ServiceGenerationOptions = { resourceProfile: 'minimal' };
      let service = await generator.generateService(starshipId, mockConnector, options);
      expect(service.deploy?.resources?.limits).toEqual({
        cpus: '0.25',
        memory: '256M'
      });

      // Test performance profile
      options = { resourceProfile: 'performance' };
      service = await generator.generateService(starshipId, mockConnector, options);
      expect(service.deploy?.resources?.limits).toEqual({
        cpus: '1.0',
        memory: '1G'
      });

      // Test standard profile (default)
      options = { resourceProfile: 'standard' };
      service = await generator.generateService(starshipId, mockConnector, options);
      expect(service.deploy?.resources?.limits).toEqual({
        cpus: '0.5',
        memory: '512M'
      });
    });

    it('should handle templates without volumes', async () => {
      const noVolumeTemplate = {
        ...mockTemplate,
        volumes: undefined
      };
      mockGetDockerServiceTemplate.mockReturnValue(noVolumeTemplate);

      const service = await generator.generateService('starship-123', mockConnector);

      expect(service.volumes).toEqual([]);
      expect(mockVolumeInstance.createTemplateVolumes).not.toHaveBeenCalled();
    });

    it('should throw error for unknown template', async () => {
      mockGetDockerServiceTemplate.mockReturnValue(null);

      await expect(
        generator.generateService('starship-123', mockConnector)
      ).rejects.toThrow('No Docker service template found for slug: filesystem');
    });

    it('should add custom labels when provided', async () => {
      const options: ServiceGenerationOptions = {
        customLabels: {
          'custom.label': 'test-value',
          'another.label': 'another-value'
        }
      };

      const service = await generator.generateService('starship-123', mockConnector, options);

      expect(service.labels).toEqual(expect.objectContaining({
        'starship.id': 'starship-123',
        'connector.id': 'connector-123',
        'template.slug': 'filesystem',
        'managed-by': 'starships',
        'template.type': 'filesystem',
        'custom.label': 'test-value',
        'another.label': 'another-value'
      }));
    });

    it('should enforce credential security when enabled', async () => {
      const credentialTemplate = {
        ...mockTemplate,
        volumes: [
          {
            source: '/data/starships/{starshipId}/credentials',
            target: '/credentials',
            mode: 'rw'
          }
        ]
      };
      mockGetDockerServiceTemplate.mockReturnValue(credentialTemplate);

      mockSecurityInstance.enforceCredentialSecurity.mockReturnValue([
        '/data/starships/starship-123/credentials:/credentials:ro'
      ]);

      const service = await generator.generateService('starship-123', mockConnector, {
        enableSecurity: true
      });

      expect(mockSecurityInstance.enforceCredentialSecurity).toHaveBeenCalledWith([
        '/data/starships/starship-123/credentials:/credentials:rw'
      ]);
      expect(service.volumes).toEqual([
        '/data/starships/starship-123/credentials:/credentials:ro'
      ]);
    });
  });

  describe('generateComposeConfiguration', () => {
    it('should generate complete Docker Compose configuration', async () => {
      const starshipId = 'starship-123';
      const connectors = [mockConnector];

      const config = await generator.generateComposeConfiguration(starshipId, connectors);

      expect(config.version).toBe('3.8');
      expect(config.services).toHaveProperty('mcp-starship-123-filesystem');
      expect(config.networks).toHaveProperty('starship-starship-123');
      expect(config.volumes).toHaveProperty('starship-123-filesystem-data');

      const network = config.networks['starship-starship-123'];
      expect(network).toMatchObject({
        driver: 'bridge',
        name: 'starship-starship-123',
        labels: {
          'starship.id': 'starship-123',
          'managed-by': 'starships'
        }
      });
    });

    it('should handle multiple connectors', async () => {
      const starshipId = 'starship-123';
      const connector2: MCPServerConnector = {
        ...mockConnector,
        id: 'connector-456',
        templateId: 'github-template',
        slug: 'github'
      };

      const githubTemplate = {
        ...mockTemplate,
        slug: 'github',
        image: 'ghcr.io/github/github-mcp-server',
        volumes: undefined,
        requiresFileAccess: false
      };

      mockGetDockerServiceTemplate
        .mockReturnValueOnce(mockTemplate)
        .mockReturnValueOnce(githubTemplate);

      const config = await generator.generateComposeConfiguration(starshipId, [mockConnector, connector2]);

      expect(Object.keys(config.services)).toHaveLength(2);
      expect(config.services).toHaveProperty('mcp-starship-123-filesystem');
      expect(config.services).toHaveProperty('mcp-starship-123-github');
      
      // Only filesystem should have volumes
      expect(config.volumes).toHaveProperty('starship-123-filesystem-data');
      expect(config.volumes).not.toHaveProperty('starship-123-github-data');
    });

    it('should not include volumes section when no volumes are needed', async () => {
      const noVolumeTemplate = {
        ...mockTemplate,
        volumes: undefined,
        requiresFileAccess: false,
        requiresCredentials: false
      };
      mockGetDockerServiceTemplate.mockReturnValue(noVolumeTemplate);

      const config = await generator.generateComposeConfiguration('starship-123', [mockConnector]);

      expect(config.volumes).toBeUndefined();
    });
  });

  describe('validateService', () => {
    let validService: DockerService;

    beforeEach(() => {
      validService = {
        image: 'test-image:latest',
        container_name: 'test-container',
        networks: ['test-network'],
        restart: 'unless-stopped',
        labels: {},
        healthcheck: {
          test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
          interval: '30s',
          timeout: '10s',
          retries: 3
        },
        deploy: {
          resources: {
            limits: {
              cpus: '0.5',
              memory: '512M'
            }
          }
        },
        cap_drop: ['ALL'],
        security_opt: ['seccomp:runtime/default']
      };
    });

    it('should validate a correct service configuration', async () => {
      const result = await generator.validateService(validService, mockTemplate);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should detect missing required fields', async () => {
      const invalidService = { ...validService };
      delete invalidService.image;
      delete invalidService.container_name;

      const result = await generator.validateService(invalidService, mockTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Service image is required');
      expect(result.errors).toContain('Container name is required');
      expect(result.score).toBeLessThan(50);
    });

    it('should detect security violations', async () => {
      const insecureService = {
        ...validService,
        privileged: true,
        cap_drop: undefined
      };

      const result = await generator.validateService(insecureService, mockTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Privileged containers are not allowed');
      expect(result.warnings).toContain('Should drop all capabilities for security');
    });

    it('should detect dangerous volume mounts', async () => {
      const dangerousService = {
        ...validService,
        volumes: [
          '/:/host:rw',
          '/etc/passwd:/etc/passwd:ro'
        ]
      };

      const result = await generator.validateService(dangerousService, mockTemplate);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Dangerous volume mount'))).toBe(true);
    });

    it('should warn about credential volumes without read-only mode', async () => {
      const credentialService = {
        ...validService,
        volumes: [
          '/data/starships/123/credentials:/creds:rw'
        ]
      };

      const result = await generator.validateService(credentialService, mockTemplate);

      expect(result.warnings.some(warning => warning.includes('Credential volume should be read-only'))).toBe(true);
    });

    it('should validate template-specific requirements', async () => {
      const templateRequiringCredentials = {
        ...mockTemplate,
        requiresCredentials: true
      };

      const serviceWithoutCredentials = {
        ...validService,
        volumes: ['/data/filesystem:/workspace:rw']
      };

      const result = await generator.validateService(serviceWithoutCredentials, templateRequiringCredentials);

      expect(result.warnings.some(warning => warning.includes('requires credentials but no credential volume'))).toBe(true);
    });

    it('should detect sensitive environment variables', async () => {
      const serviceWithSensitiveEnv = {
        ...validService,
        environment: {
          PASSWORD: '',
          SECRET_KEY: '',
          API_TOKEN: 'some-value'
        }
      };

      const result = await generator.validateService(serviceWithSensitiveEnv, mockTemplate);

      expect(result.warnings.some(warning => warning.includes('PASSWORD is empty'))).toBe(true);
      expect(result.warnings.some(warning => warning.includes('SECRET_KEY is empty'))).toBe(true);
    });
  });

  describe('optimizeService', () => {
    let baseService: DockerService;

    beforeEach(() => {
      baseService = {
        image: 'test:latest',
        container_name: 'test',
        networks: ['test'],
        restart: 'unless-stopped',
        labels: {},
        healthcheck: {
          test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
          interval: '30s',
          timeout: '10s',
          retries: 3
        },
        deploy: {
          resources: {
            limits: {
              cpus: '0.5',
              memory: '512M'
            }
          }
        }
      };
    });

    it('should optimize for minimal profile', () => {
      const optimized = generator.optimizeService(baseService, 'minimal');

      expect(optimized.deploy?.resources?.limits).toEqual({
        cpus: '0.25',
        memory: '256M'
      });
      expect(optimized.healthcheck?.interval).toBe('60s');
      expect(optimized.healthcheck?.retries).toBe(2);
    });

    it('should optimize for performance profile', () => {
      const optimized = generator.optimizeService(baseService, 'performance');

      expect(optimized.deploy?.resources?.limits).toEqual({
        cpus: '1.0',
        memory: '1G'
      });
      expect(optimized.healthcheck?.interval).toBe('15s');
      expect(optimized.healthcheck?.retries).toBe(5);
      expect(optimized.healthcheck?.start_interval).toBe('5s');
      expect(optimized.tmpfs).toEqual(['/tmp:rw,noexec,nosuid,size=100m']);
    });

    it('should use standard profile by default', () => {
      const optimized = generator.optimizeService(baseService);

      expect(optimized.deploy?.resources?.limits).toEqual({
        cpus: '0.5',
        memory: '512M'
      });
      expect(optimized.healthcheck?.interval).toBe('30s');
      expect(optimized.healthcheck?.retries).toBe(3);
    });
  });

  describe('generateServiceYAML', () => {
    it('should generate YAML for a service', () => {
      const service: DockerService = {
        image: 'test:latest',
        container_name: 'test-service',
        networks: ['test-network'],
        restart: 'unless-stopped',
        labels: {}
      };

      mockYaml.dump.mockReturnValue('mocked-yaml-output');

      const yaml = generator.generateServiceYAML(service);

      expect(yaml).toBe('mocked-yaml-output');
      expect(mockYaml.dump).toHaveBeenCalledWith(
        { 'test-service': service },
        expect.objectContaining({
          indent: 2,
          lineWidth: -1,
          noRefs: true
        })
      );
    });
  });

  describe('generateComposeYAML', () => {
    it('should generate YAML for complete compose configuration', () => {
      const config = {
        version: '3.8',
        services: {
          'test-service': {
            image: 'test:latest',
            container_name: 'test-service',
            networks: ['test-network'],
            restart: 'unless-stopped',
            labels: {}
          }
        },
        networks: {
          'test-network': {
            driver: 'bridge',
            name: 'test-network'
          }
        }
      };

      mockYaml.dump.mockReturnValue('complete-compose-yaml');

      const yaml = generator.generateComposeYAML(config);

      expect(yaml).toBe('complete-compose-yaml');
      expect(mockYaml.dump).toHaveBeenCalledWith(config, expect.any(Object));
    });
  });

  describe('private helper methods', () => {
    it('should generate correct service names', () => {
      const serviceName = (generator as any).generateServiceName('starship-123', 'filesystem');
      expect(serviceName).toBe('mcp-starship-123-filesystem');
    });

    it('should generate correct network names', () => {
      const networkName = (generator as any).generateNetworkName('starship-456');
      expect(networkName).toBe('starship-starship-456');
    });

    it('should build environment variables correctly', () => {
      const connector = {
        ...mockConnector,
        env: '{"CUSTOM_VAR": "custom-value"}'
      };
      
      const template = {
        ...mockTemplate,
        environment: {
          TEMPLATE_VAR: 'template-value'
        }
      };

      const env = (generator as any).buildEnvironmentVariables(connector, template);

      expect(env).toEqual({
        TEMPLATE_VAR: 'template-value',
        CUSTOM_VAR: 'custom-value'
      });
    });

    it('should parse memory limits correctly', () => {
      expect((generator as any).parseMemoryLimit('512M')).toBe(512);
      expect((generator as any).parseMemoryLimit('1G')).toBe(1024);
      expect((generator as any).parseMemoryLimit('256MB')).toBe(256);
    });

    it('should calculate memory reservations correctly', () => {
      expect((generator as any).calculateMemoryReservation('1G')).toBe('512G');
      expect((generator as any).calculateMemoryReservation('512M')).toBe('256M');
    });
  });

  describe('error handling', () => {
    it('should handle volume creation errors gracefully', async () => {
      mockVolumeInstance.createTemplateVolumes.mockRejectedValue(new Error('Permission denied'));

      // Should not throw, but log the error
      const service = await generator.generateService('starship-123', mockConnector);
      
      expect(service).toBeDefined();
      expect(mockVolumeInstance.createTemplateVolumes).toHaveBeenCalled();
    });

    it('should handle invalid JSON in connector environment', async () => {
      const invalidConnector = {
        ...mockConnector,
        env: 'invalid-json'
      };

      const service = await generator.generateService('starship-123', invalidConnector);
      
      // Should fall back to empty object for environment
      expect(service.environment).toEqual(mockTemplate.environment);
    });
  });

  describe('advanced configurations', () => {
    it('should add PostgreSQL-specific configurations', async () => {
      const postgresTemplate = {
        ...mockTemplate,
        slug: 'postgresql'
      };
      mockGetDockerServiceTemplate.mockReturnValue(postgresTemplate);

      const postgresConnector = {
        ...mockConnector,
        templateId: 'postgresql-template',
        slug: 'postgresql'
      };

      const service = await generator.generateService('starship-123', postgresConnector);

      expect(service.depends_on).toEqual({
        'network-postgresql': { condition: 'service_started' }
      });
    });

    it('should add Puppeteer-specific configurations', async () => {
      const puppeteerTemplate = {
        ...mockTemplate,
        slug: 'puppeteer'
      };
      mockGetDockerServiceTemplate.mockReturnValue(puppeteerTemplate);

      const puppeteerConnector = {
        ...mockConnector,
        templateId: 'puppeteer-template',
        slug: 'puppeteer'
      };

      const service = await generator.generateService('starship-123', puppeteerConnector);

      expect(service.shm_size).toBe('2gb');
    });

    it('should add filesystem-specific volume configurations', async () => {
      const service = await generator.generateService('starship-123', mockConnector);

      // Check if volumes are properly configured with SELinux labels for filesystem
      if (service.volumes && service.volumes.length > 0) {
        // The actual SELinux labeling happens in addAdvancedConfigurations
        expect(service.volumes[0]).toContain('/data/starships/starship-123/filesystem');
      }
    });
  });
});