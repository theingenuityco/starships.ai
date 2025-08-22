import { z } from 'zod';
import {
  Repository,
  BaseEntity,
  TemporalFields,
  UuidSchema,
  DateTimeSchema,
  JsonStringSchema,
  PortSchema,
  TimeoutConfigSchema,
  RetryConfigSchema,
  LoggingConfigSchema,
  ResourceConfigSchema,
  HealthCheckConfigSchema
} from './shared';

/**
 * Docker Status Enumeration
 */
export const DockerStatusSchema = z.enum(['pending', 'building', 'running', 'stopped', 'error']);
export type DockerStatus = z.infer<typeof DockerStatusSchema>;

/**
 * Docker Health Status Enumeration
 */
export const DockerHealthStatusSchema = z.enum(['healthy', 'unhealthy', 'starting']);
export type DockerHealthStatus = z.infer<typeof DockerHealthStatusSchema>;

/**
 * Connector Status Enumeration
 */
export const ConnectorStatusSchema = z.enum(['active', 'inactive', 'error', 'connecting']);
export type ConnectorStatus = z.infer<typeof ConnectorStatusSchema>;

/**
 * Configuration Template Category Enumeration
 */
export const ConfigTemplateCategorySchema = z.enum(['development', 'production', 'testing', 'monitoring', 'custom']);
export type ConfigTemplateCategory = z.infer<typeof ConfigTemplateCategorySchema>;

/**
 * MCP Server Option Entity (Connector Management Context)
 * 
 * Represents a template/blueprint for MCP server connectors that can be
 * instantiated and deployed on starships. These are the available connector
 * types in the marketplace.
 */
export interface MCPServerOption extends BaseEntity {
  /** Unique identifier for the MCP server option */
  id: string;
  
  /** Display name for the connector (e.g., "Github", "Puppeteer") */
  name: string;
  
  /** Docker-compatible identifier (e.g., "github", "puppeteer") */
  slug: string;
  
  /** Execution command (e.g., "docker", "npx", "uvx") */
  command: string;
  
  /** Command arguments array */
  args: string[];
  
  /** Environment variables as JSON string (optional) */
  env?: string;
  
  /** Timestamp when the option was created */
  createdAt: string;
}

/**
 * Connector Instance Configuration Schema
 * 
 * Defines the structure for connector-specific configuration that can be
 * customized per instance while maintaining validation and type safety.
 */
export interface ConnectorInstanceConfig {
  /** Custom display name for this connector instance */
  customName?: string;
  
  /** Custom description for this connector instance */
  customDescription?: string;
  
  /** Environment variable overrides (JSON string) */
  environmentVariables?: string;
  
  /** Timeout settings */
  timeouts?: {
    /** Connection timeout in milliseconds (default: 30000) */
    connection?: number;
    /** Request timeout in milliseconds (default: 60000) */
    request?: number;
    /** Idle timeout in milliseconds (default: 300000) */
    idle?: number;
  };
  
  /** Retry configuration */
  retry?: {
    /** Maximum number of retry attempts (default: 3) */
    maxAttempts?: number;
    /** Base delay between retries in milliseconds (default: 1000) */
    baseDelay?: number;
    /** Maximum delay between retries in milliseconds (default: 10000) */
    maxDelay?: number;
    /** Whether to use exponential backoff (default: true) */
    exponentialBackoff?: boolean;
  };
  
  /** Logging configuration */
  logging?: {
    /** Log level: 'error' | 'warn' | 'info' | 'debug' (default: 'info') */
    level?: 'error' | 'warn' | 'info' | 'debug';
    /** Whether to enable debug mode (default: false) */
    enableDebug?: boolean;
    /** Whether to log requests/responses (default: false) */
    logRequests?: boolean;
    /** Whether to log performance metrics (default: true) */
    logMetrics?: boolean;
  };
  
  /** Resource limits */
  resources?: {
    /** Maximum memory usage in MB */
    maxMemoryMB?: number;
    /** Maximum CPU usage percentage */
    maxCpuPercent?: number;
    /** Maximum concurrent connections */
    maxConnections?: number;
  };
  
  /** Health check configuration */
  healthCheck?: {
    /** Whether health checks are enabled (default: true) */
    enabled?: boolean;
    /** Health check interval in milliseconds (default: 30000) */
    interval?: number;
    /** Health check timeout in milliseconds (default: 5000) */
    timeout?: number;
    /** Number of failed checks before marking unhealthy (default: 3) */
    failureThreshold?: number;
  };
  
  /** Custom configuration specific to the connector type */
  customConfig?: Record<string, any>;
}

/**
 * Configuration Template Entity (Connector Management Context)
 * 
 * Defines reusable configuration templates that can be applied to connector instances.
 * Templates provide sensible defaults and can be customized per use case.
 */
export interface ConnectorConfigTemplate extends BaseEntity, TemporalFields {
  /** Unique identifier for the template */
  id: string;
  
  /** Display name for the template */
  name: string;
  
  /** Description of what this template is for */
  description: string;
  
  /** Category for organizing templates */
  category: ConfigTemplateCategory;
  
  /** Tags for filtering and searching */
  tags: string[];
  
  /** The configuration values defined by this template */
  config: ConnectorInstanceConfig;
  
  /** Whether this template is available to all users */
  isPublic: boolean;
  
  /** 
   * @deprecated Use (:User)-[:AUTHORED]->(:ConnectorConfigTemplate) relationship instead
   * Foreign key to User - will be removed in favor of graph relationships
   */
  authorId: string;
  
  /** Usage count for popularity tracking */
  usageCount: number;
  
  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Configuration History Entry (Connector Management Context)
 * 
 * Tracks changes to connector instance configurations for audit and rollback purposes.
 */
export interface ConnectorConfigHistory extends BaseEntity {
  /** Unique identifier for this history entry */
  id: string;
  
  /** 
   * @deprecated Use (:ConnectorConfigHistory)-[:BELONGS_TO]->(:MCPServerConnector) relationship instead
   * Foreign key to MCPServerConnector - will be removed in favor of graph relationships
   */
  connectorId: string;
  
  /** Configuration state at this point in time */
  config: ConnectorInstanceConfig;
  
  /** 
   * @deprecated Use (:User)-[:CHANGED]->(:ConnectorConfigHistory) relationship instead
   * Foreign key to User - will be removed in favor of graph relationships
   */
  changedBy: string;
  
  /** Summary of what was changed */
  changeSummary?: string;
  
  /** Reason for the change */
  changeReason?: string;
  
  /** Timestamp when this change was made */
  createdAt: string;
}

/**
 * MCP Server Connector Entity (Connector Management Context - Aggregate Root)
 * 
 * Represents an instance of an MCP server connector that is deployed on a specific starship.
 * This entity tracks the connection status, usage, lifecycle, and Docker deployment information.
 */
export interface MCPServerConnector extends BaseEntity, TemporalFields {
  /** Unique identifier for the connector instance */
  id: string;
  
  /** 
   * @deprecated Use (:MCPServerConnector)-[:DEPLOYED_ON]->(:Starship) relationship instead
   * Foreign key to Starship - will be removed in favor of graph relationships
   */
  starshipId: string;
  
  /** 
   * @deprecated Use (:MCPServerConnector)-[:CREATED_FROM]->(:MCPServerOption) relationship instead
   * Foreign key to MCPServerOption - will be removed in favor of graph relationships
   */
  templateId: string;
  
  /** Current status of the connector instance */
  status: ConnectorStatus;
  
  /** Whether the connector is currently active and available for use */
  isActive: boolean;
  
  /** Timestamp when the connector was successfully connected */
  connectedAt: string;
  
  /** Timestamp of the last time this connector was used (optional) */
  lastUsed?: string;
  
  /** Error message if the connector is in error state (optional) */
  errorMessage?: string;
  
  /** Environment variables as JSON string (simplified from nested config) */
  env?: string;
  
  /** 
   * @deprecated Use (:MCPServerConnector)-[:USES_CONFIG]->(:ConnectorConfigTemplate) relationship instead
   * Foreign key to ConnectorConfigTemplate - will be removed in favor of graph relationships
   */
  configTemplateId?: string;
  
  /** Configuration version for tracking changes */
  configVersion?: number;
  
  // Docker-specific fields
  /** Docker service name (e.g., mcp-ship456-github) */
  dockerServiceName?: string;
  
  /** Docker deployment status */
  dockerStatus?: DockerStatus;
  
  /** Docker container ID from Docker daemon */
  dockerContainerId?: string;
  
  /** Docker health status from health checks */
  dockerHealthStatus?: DockerHealthStatus;
  
  /** Timestamp of last health check */
  dockerLastHealthCheck?: string;
  
  /** Docker network name (e.g., starship-ship456) */
  dockerNetworkName?: string;
  
  /** Docker image used for deployment */
  dockerImageName?: string;
  
  /** Docker deployment error message (if dockerStatus is 'error') */
  dockerErrorMessage?: string;
  
  /** Allocated port for development environments */
  dockerPort?: number;
  
  // HTTP Bridge-specific fields
  /** Whether this connector uses HTTP bridge */
  httpBridgeEnabled?: boolean;
  
  /** Internal URL for HTTP bridge communication (e.g., http://mcp-ship456-github-http:8080) */
  internalUrl?: string;
  
  /** HTTP bridge version */
  bridgeVersion?: string;
  
  /** Timestamp of last tools/capabilities synchronization */
  lastToolsSync?: string;
  
  /** Available tools from the MCP server (cached from bridge) */
  availableTools?: string;
  
  /** Available resources from the MCP server (cached from bridge) */
  availableResources?: string;
  
  /** Bridge capabilities metadata (cached from bridge) */
  bridgeCapabilities?: string;
  
  /** Timestamp when the connector instance was created */
  createdAt: string;
  
  /** Timestamp when the connector instance was last updated */
  updatedAt: string;
}

/**
 * Validation Schemas
 */

export const MCPServerOptionSchema = z.object({
  id: UuidSchema,
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be at most 100 characters'),
  slug: z.string()
    .min(1, 'Slug cannot be empty')
    .max(50, 'Slug must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  command: z.string()
    .min(1, 'Command cannot be empty'),
  args: z.array(z.string()),
  env: JsonStringSchema.optional(),
  createdAt: DateTimeSchema
}).strict();

export const ConnectorInstanceConfigSchema = z.object({
  customName: z.string().max(100).optional(),
  customDescription: z.string().max(500).optional(),
  environmentVariables: JsonStringSchema.optional(),
  timeouts: TimeoutConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
  logging: LoggingConfigSchema.optional(),
  resources: ResourceConfigSchema.optional(),
  healthCheck: HealthCheckConfigSchema.optional(),
  customConfig: z.record(z.string(), z.any()).optional()
}).strict();

export const ConnectorConfigTemplateSchema = z.object({
  id: UuidSchema,
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name must be at most 100 characters'),
  description: z.string()
    .min(1, 'Description cannot be empty')
    .max(500, 'Description must be at most 500 characters'),
  category: ConfigTemplateCategorySchema,
  tags: z.array(z.string().min(1, 'Tag cannot be empty'))
    .max(10, 'Maximum 10 tags allowed'),
  config: ConnectorInstanceConfigSchema,
  isPublic: z.boolean(),
  authorId: UuidSchema,
  usageCount: z.number()
    .int('Usage count must be an integer')
    .min(0, 'Usage count cannot be negative'),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).strict();

export const ConnectorConfigHistorySchema = z.object({
  id: UuidSchema,
  connectorId: UuidSchema,
  config: ConnectorInstanceConfigSchema,
  changedBy: UuidSchema,
  changeSummary: z.string().max(200).optional(),
  changeReason: z.string().max(500).optional(),
  createdAt: DateTimeSchema
}).strict();

export const MCPServerConnectorSchema = z.object({
  id: UuidSchema,
  starshipId: UuidSchema,
  templateId: UuidSchema,
  status: ConnectorStatusSchema,
  isActive: z.boolean(),
  connectedAt: DateTimeSchema,
  lastUsed: DateTimeSchema.optional(),
  errorMessage: z.string().max(1000).optional(),
  env: JsonStringSchema.optional(),
  configTemplateId: UuidSchema.optional(),
  configVersion: z.number().int().min(1).optional(),
  dockerServiceName: z.string().max(100).optional(),
  dockerStatus: DockerStatusSchema.optional(),
  dockerContainerId: z.string().max(100).optional(),
  dockerHealthStatus: DockerHealthStatusSchema.optional(),
  dockerLastHealthCheck: DateTimeSchema.optional(),
  dockerNetworkName: z.string().max(100).optional(),
  dockerImageName: z.string().max(200).optional(),
  dockerErrorMessage: z.string().max(1000).optional(),
  dockerPort: PortSchema.optional(),
  httpBridgeEnabled: z.boolean().optional(),
  internalUrl: z.string().url().optional(),
  bridgeVersion: z.string().max(20).optional(),
  lastToolsSync: DateTimeSchema.optional(),
  availableTools: JsonStringSchema.optional(),
  availableResources: JsonStringSchema.optional(),
  bridgeCapabilities: JsonStringSchema.optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).strict();

/**
 * Repository Interfaces
 */

/**
 * MCP Server Option Repository Interface (Connector Management Context)
 */
export interface MCPServerOptionRepository extends Repository<MCPServerOption> {
  /**
   * Find MCP server options by command
   * @param command - The command to filter by
   * @returns Promise resolving to array of options
   */
  findByCommand(command: string): Promise<MCPServerOption[]>;

  /**
   * Find active MCP server options
   * @returns Promise resolving to array of active options
   */
  findActive(): Promise<MCPServerOption[]>;

  /**
   * Search MCP server options by name
   * @param nameQuery - The search query for names
   * @returns Promise resolving to array of matching options
   */
  searchByName(nameQuery: string): Promise<MCPServerOption[]>;

  /**
   * Find MCP server option by slug
   * @param slug - The slug to search for
   * @returns Promise resolving to the option or null if not found
   */
  findBySlug(slug: string): Promise<MCPServerOption | null>;

  /**
   * Get popular MCP server options based on usage
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of popular options
   */
  findPopular(limit?: number): Promise<MCPServerOption[]>;
}

/**
 * MCP Server Connector Repository Interface (Connector Management Context)
 * 
 * Repository interface for managing MCP server connector instances with configuration capabilities.
 */
export interface MCPServerConnectorRepository extends Repository<MCPServerConnector> {
  /**
   * Find all connector instances deployed on a specific starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances
   */
  findByStarship(starshipId: string): Promise<MCPServerConnector[]>;

  /**
   * Find all connector instances created from a specific template
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to array of connector instances
   */
  findByTemplate(templateId: string): Promise<MCPServerConnector[]>;

  /**
   * Create a new connector instance from an MCP server template
   * @param starshipId - The ID of the starship to deploy the connector on
   * @param templateId - The ID of the MCP server template to instantiate
   * @param env - Optional environment variables as JSON string
   * @returns Promise resolving to the created connector instance
   */
  createFromTemplate(
    starshipId: string,
    templateId: string,
    env?: string
  ): Promise<MCPServerConnector>;

  /**
   * Update the status of a connector instance
   * @param id - The ID of the connector instance
   * @param status - The new status to set
   * @param errorMessage - Optional error message if status is 'error'
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateStatus(
    id: string,
    status: ConnectorStatus,
    errorMessage?: string
  ): Promise<MCPServerConnector | null>;

  /**
   * Update the environment variables of a connector instance
   * @param id - The ID of the connector instance
   * @param env - The new environment variables as JSON string
   * @param changedBy - ID of the user making the change
   * @param changeSummary - Optional summary of what was changed
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateEnv(
    id: string,
    env: string,
    changedBy: string,
    changeSummary?: string
  ): Promise<MCPServerConnector | null>;

  /**
   * Deactivate a connector instance (sets isActive to false)
   * @param id - The ID of the connector instance
   * @returns Promise resolving to true if successful, false otherwise
   */
  deactivate(id: string): Promise<boolean>;

  /**
   * Activate a connector instance (sets isActive to true)
   * @param id - The ID of the connector instance
   * @returns Promise resolving to true if successful, false otherwise
   */
  activate(id: string): Promise<boolean>;

  /**
   * Find a specific connector instance by starship and template
   * @param starshipId - The ID of the starship
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to the connector instance or null if not found
   */
  findByStarshipAndTemplate(
    starshipId: string,
    templateId: string
  ): Promise<MCPServerConnector | null>;

  /**
   * Update Docker deployment status and related fields
   * @param id - The ID of the connector instance
   * @param dockerStatus - The new Docker status
   * @param containerInfo - Optional container information
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateDockerStatus(
    id: string,
    dockerStatus: DockerStatus,
    containerInfo?: {
      containerId?: string;
      serviceName?: string;
      networkName?: string;
      imageName?: string;
      errorMessage?: string;
    }
  ): Promise<MCPServerConnector | null>;

  /**
   * Update Docker health status
   * @param id - The ID of the connector instance
   * @param healthStatus - The new health status
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateDockerHealth(
    id: string,
    healthStatus: DockerHealthStatus
  ): Promise<MCPServerConnector | null>;

  /**
   * Find connector instances by Docker status
   * @param dockerStatus - The Docker status to filter by
   * @returns Promise resolving to array of connector instances
   */
  findByDockerStatus(dockerStatus: DockerStatus): Promise<MCPServerConnector[]>;

  /**
   * Find connector instances by starship with Docker information
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances with Docker fields populated
   */
  findByStarshipWithDockerInfo(starshipId: string): Promise<MCPServerConnector[]>;

  /**
   * Update Docker container ID after deployment
   * @param id - The ID of the connector instance
   * @param containerId - The Docker container ID
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateDockerContainerId(
    id: string,
    containerId: string
  ): Promise<MCPServerConnector | null>;

  /**
   * Find connectors with unhealthy Docker status
   * @returns Promise resolving to array of unhealthy connectors
   */
  findUnhealthyConnectors(): Promise<MCPServerConnector[]>;

  /**
   * Update HTTP bridge information
   * @param id - The ID of the connector instance
   * @param bridgeInfo - Bridge information to update
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateBridgeInfo(
    id: string,
    bridgeInfo: {
      internalUrl?: string;
      bridgeVersion?: string;
      availableTools?: string;
      availableResources?: string;
      bridgeCapabilities?: string;
    }
  ): Promise<MCPServerConnector | null>;
}

/**
 * Connector Config Template Repository Interface (Connector Management Context)
 */
export interface ConnectorConfigTemplateRepository extends Repository<ConnectorConfigTemplate> {
  /**
   * Find templates by category
   * @param category - The category to filter by
   * @returns Promise resolving to array of templates
   */
  findByCategory(category: ConfigTemplateCategory): Promise<ConnectorConfigTemplate[]>;

  /**
   * Find templates by tags
   * @param tags - Array of tags to filter by
   * @returns Promise resolving to array of templates
   */
  findByTags(tags: string[]): Promise<ConnectorConfigTemplate[]>;

  /**
   * Find public templates
   * @param limit - Optional limit for results
   * @param offset - Optional offset for pagination
   * @returns Promise resolving to array of public templates
   */
  findPublic(limit?: number, offset?: number): Promise<ConnectorConfigTemplate[]>;

  /**
   * Find templates by author
   * @param authorId - The ID of the author
   * @returns Promise resolving to array of templates
   */
  findByAuthor(authorId: string): Promise<ConnectorConfigTemplate[]>;

  /**
   * Search templates by name or description
   * @param query - The search query
   * @returns Promise resolving to array of matching templates
   */
  search(query: string): Promise<ConnectorConfigTemplate[]>;

  /**
   * Increment usage count for a template
   * @param id - The ID of the template
   * @returns Promise resolving when complete
   */
  incrementUsageCount(id: string): Promise<void>;

  /**
   * Get popular templates based on usage count
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of popular templates
   */
  findPopular(limit?: number): Promise<ConnectorConfigTemplate[]>;
}

/**
 * Connector Config History Repository Interface (Connector Management Context)
 */
export interface ConnectorConfigHistoryRepository extends Repository<ConnectorConfigHistory> {
  /**
   * Find configuration history for a specific connector
   * @param connectorId - The ID of the connector instance
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of history entries
   */
  findByConnector(connectorId: string, limit?: number): Promise<ConnectorConfigHistory[]>;

  /**
   * Find configuration changes by user
   * @param userId - The ID of the user
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of history entries
   */
  findByUser(userId: string, limit?: number): Promise<ConnectorConfigHistory[]>;

  /**
   * Create a configuration history entry
   * @param connectorId - The ID of the connector instance
   * @param config - The configuration state to record
   * @param changedBy - The ID of the user who made the change
   * @param changeSummary - Optional summary of what was changed
   * @param changeReason - Optional reason for the change
   * @returns Promise resolving to the created history entry
   */
  createEntry(
    connectorId: string,
    config: ConnectorInstanceConfig,
    changedBy: string,
    changeSummary?: string,
    changeReason?: string
  ): Promise<ConnectorConfigHistory>;

  /**
   * Get recent configuration changes across all connectors
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of recent history entries
   */
  findRecentChanges(limit?: number): Promise<ConnectorConfigHistory[]>;
}

/**
 * Type exports for external use
 */
export type CreateMCPServerOptionInput = z.infer<typeof MCPServerOptionSchema>;
export type CreateConnectorConfigTemplateInput = Omit<ConnectorConfigTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>;
export type CreateConnectorConfigHistoryInput = Omit<ConnectorConfigHistory, 'id' | 'createdAt'>;
export type CreateMCPServerConnectorInput = Omit<MCPServerConnector, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Connector Utility Functions
 */
export const ConnectorUtils = {
  /**
   * Validates connector instance configuration
   */
  validateConfig: (config: any) => {
    return ConnectorInstanceConfigSchema.safeParse(config);
  },

  /**
   * Merges configuration templates with instance overrides
   */
  mergeConfigurations: (
    templateConfig: ConnectorInstanceConfig,
    instanceOverrides: Partial<ConnectorInstanceConfig>
  ): ConnectorInstanceConfig => {
    return {
      ...templateConfig,
      ...instanceOverrides,
      timeouts: { ...templateConfig.timeouts, ...instanceOverrides.timeouts },
      retry: { ...templateConfig.retry, ...instanceOverrides.retry },
      logging: { ...templateConfig.logging, ...instanceOverrides.logging },
      resources: { ...templateConfig.resources, ...instanceOverrides.resources },
      healthCheck: { ...templateConfig.healthCheck, ...instanceOverrides.healthCheck },
      customConfig: { ...templateConfig.customConfig, ...instanceOverrides.customConfig }
    };
  },

  /**
   * Generates a Docker service name for a connector
   */
  generateDockerServiceName: (starshipSlug: string, connectorSlug: string): string => {
    return `mcp-${starshipSlug}-${connectorSlug}`;
  },

  /**
   * Generates a Docker network name for a starship
   */
  generateDockerNetworkName: (starshipSlug: string): string => {
    return `starship-${starshipSlug}`;
  },

  /**
   * Validates environment variables JSON string
   */
  validateEnvironmentVariables: (envString: string): boolean => {
    try {
      const parsed = JSON.parse(envString);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }
};