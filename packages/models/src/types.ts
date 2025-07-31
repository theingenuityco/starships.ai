// Import from protocol to avoid circular dependency
import { Agent, Expedition } from '@starships/protocol';

// Re-export for backward compatibility
export { Agent, Expedition };

export interface LLM {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic';
  maxTokens?: number;
  temperature?: number;
  embeddingModel?: string;
  supportsStreaming?: boolean;
  supportsTools?: boolean;
  costPer1kTokens?: number;
  createdAt: string;
}

export interface User {
  id: string;
  kindeId?: string;
  username: string;
  email?: string;
  displayName?: string;
  avatar?: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  guildId?: string;
  type: 'text' | 'voice' | 'dm';
  createdAt: string;
}

// NEW: Aether Core Entities
export interface Starship {
  id: string;
  slug: string;
  ownerId: string; // Foreign key to User
  class: 'scout' | 'cruiser';
  name: string;
  maxAgents: number; // Based on class: Scout=3, Cruiser=6
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface Vision {
  id: string;
  starshipId: string; // Direct FK to Starship
  statement: string;
  confidence: number;
  refinementCount: number;
  lastRefined: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Neo4j Relationship Types (keeping only essential ones)
export interface ActiveInRelationship {
  type: 'ACTIVE_IN';
  properties?: {
    joinedAt?: string;
    role?: string;
  };
}

// NEW: Aether Core Relationships
export interface OwnsRelationship {
  type: 'OWNS';
  properties?: {
    ownedSince?: string;
  };
}

export interface DeployedOnRelationship {
  type: 'DEPLOYED_ON';
  properties?: {
    deployedAt?: string;
    isActive?: boolean;
  };
}



// Repository interfaces
export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository extends Repository<Agent> {
  findByChannel(channelId: string): Promise<Agent[]>;
  findByUser(userId: string): Promise<Agent[]>;
  findByStarship(starshipId: string): Promise<Agent[]>;

  // NEW: starshipId FK-based query methods
  findByStarshipId(starshipId: string): Promise<Agent[]>;
  updateStarshipId(agentId: string, starshipId: string): Promise<void>;
  findUndeployedAgents(): Promise<Agent[]>;

  // ADD: Enhanced query methods
  findByAuthor(authorId: string): Promise<Agent[]>;
  findByCategory(category: string): Promise<Agent[]>;
  findByTags(tags: string[]): Promise<Agent[]>;
  findPublic(limit?: number, offset?: number): Promise<Agent[]>;
  searchAgents(query: string): Promise<Agent[]>;

  // ADD: Marketplace features
  incrementUsageCount(id: string): Promise<void>;
  updateRating(id: string, rating: number): Promise<void>;

  // ADD: Advanced filtering
  findWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: 'scout' | 'cruiser';
  }): Promise<Agent[]>;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByKindeId(kindeId: string): Promise<User | null>;
}

export interface ChannelRepository extends Repository<Channel> {
  findByGuild(guildId: string): Promise<Channel[]>;
  findByType(type: string): Promise<Channel[]>;
}

export interface LLMRepository extends Repository<LLM> {
  findByProvider(provider: string): Promise<LLM[]>;
}

// NEW: MCP Server Option Entity
export interface MCPServerOption {
  id: string; // Unique identifier (e.g., "github", "puppeteer")
  name: string; // Display name (e.g., "Github", "Puppeteer")
  command: string; // Execution command (e.g., "docker", "npx", "uvx")
  args: string[]; // Command arguments array
  env?: string; // Environment variables as JSON string (optional)
}

/**
 * Configuration Schema for Connector Instances
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
 * Configuration Template for Connector Types
 *
 * Defines reusable configuration templates that can be applied to connector instances.
 * Templates provide sensible defaults and can be customized per use case.
 */
export interface ConnectorConfigTemplate {
  /** Unique identifier for the template */
  id: string;
  /** Display name for the template */
  name: string;
  /** Description of what this template is for */
  description: string;
  /** Category for organizing templates */
  category: 'development' | 'production' | 'testing' | 'monitoring' | 'custom';
  /** Tags for filtering and searching */
  tags: string[];

  /** The configuration values defined by this template */
  config: ConnectorInstanceConfig;

  /** Whether this template is available to all users */
  isPublic: boolean;
  /** ID of the user who created this template */
  authorId: string;
  /** Usage count for popularity tracking */
  usageCount: number;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/**
 * Configuration History Entry
 *
 * Tracks changes to connector instance configurations for audit and rollback purposes.
 */
export interface ConnectorConfigHistory {
  /** Unique identifier for this history entry */
  id: string;
  /** ID of the connector instance this history belongs to */
  connectorId: string;
  /** Configuration state at this point in time */
  config: ConnectorInstanceConfig;
  /** ID of the user who made this change */
  changedBy: string;
  /** Summary of what was changed */
  changeSummary?: string;
  /** Reason for the change */
  changeReason?: string;
  /** Timestamp when this change was made */
  createdAt: string;
}

/**
 * MCPServerConnector Entity (Enhanced with Configuration Support)
 *
 * Represents an instance of an MCP server connector that is deployed on a specific starship.
 * This entity tracks the connection status, usage, lifecycle, and configuration of connector instances.
 */
export interface MCPServerConnector {
  /** Unique identifier for the connector instance */
  id: string;
  /** ID of the starship this connector is deployed on */
  starshipId: string;
  /** ID of the MCP server template this connector was created from */
  templateId: string;

  /** Current status of the connector instance */
  status: 'active' | 'inactive' | 'error' | 'connecting';
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
  /** NEW: ID of the configuration template used (if any) */
  configTemplateId?: string;
  /** NEW: Configuration version for tracking changes */
  configVersion?: number;

  /** Timestamp when the connector instance was created */
  createdAt: string;
  /** Timestamp when the connector instance was last updated */
  updatedAt: string;
}

/**
 * MCPServerConnectorRepository Interface (Enhanced with Configuration Support)
 *
 * Repository interface for managing MCP server connector instances with configuration capabilities.
 * Provides methods for CRUD operations and specialized queries for connector management.
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
    status: MCPServerConnector['status'],
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
}

/**
 * ConnectorConfigTemplateRepository Interface
 *
 * Repository interface for managing connector configuration templates.
 */
export interface ConnectorConfigTemplateRepository extends Repository<ConnectorConfigTemplate> {
  /**
   * Find templates by category
   * @param category - The category to filter by
   * @returns Promise resolving to array of templates
   */
  findByCategory(category: ConnectorConfigTemplate['category']): Promise<ConnectorConfigTemplate[]>;

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
}

/**
 * ConnectorConfigHistoryRepository Interface
 *
 * Repository interface for managing connector configuration history.
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
}

// NEW: Aether Core Repository Interfaces
export interface StarshipRepository {
  findAll(): Promise<Starship[]>;
  findById(id: string): Promise<Starship | null>;
  findBySlug(slug: string, ownerId: string): Promise<Starship | null>;
  create(
    entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt' | 'slug'> & {
      slug?: string;
    }
  ): Promise<Starship>;
  update(id: string, updates: Partial<Starship>): Promise<Starship | null>;
  delete(id: string): Promise<boolean>;
  findByOwner(ownerId: string): Promise<Starship[]>;
  getDeployedAgents(starshipId: string): Promise<Agent[]>;
  deployAgent(starshipId: string, agentId: string): Promise<boolean>;
  removeAgent(starshipId: string, agentId: string): Promise<boolean>;
  getAvailableSlots(starshipId: string): Promise<number>;
  generateUniqueSlug(name: string, ownerId: string): Promise<string>;
  isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean>;
  createSlugFromName(name: string): string;

  // NEW: Updated MCP Server Connector methods (replace existing ones)
  /**
   * Get all connector instances deployed on a starship
   * @param starshipId - The ID of the starship
   * @returns Promise resolving to array of connector instances
   */
  getConnectorInstances(starshipId: string): Promise<MCPServerConnector[]>;

  /**
   * Create a new connector instance from a template and deploy it on a starship
   * @param starshipId - The ID of the starship
   * @param templateId - The ID of the MCP server template
   * @returns Promise resolving to the created connector instance
   */
  createConnectorInstance(starshipId: string, templateId: string): Promise<MCPServerConnector>;

  /**
   * Remove a connector instance from a starship
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance to remove
   * @returns Promise resolving to true if successful, false otherwise
   */
  removeConnectorInstance(starshipId: string, connectorId: string): Promise<boolean>;

  /**
   * Update a connector instance with partial updates
   * @param starshipId - The ID of the starship
   * @param connectorId - The ID of the connector instance
   * @param updates - Partial updates to apply to the connector instance
   * @returns Promise resolving to the updated connector instance or null if not found
   */
  updateConnectorInstance(
    starshipId: string,
    connectorId: string,
    updates: Partial<MCPServerConnector>
  ): Promise<MCPServerConnector | null>;

  // DEPRECATED: Remove these methods after migration
  // getConnectedMCPServers(starshipId: string): Promise<MCPServerOption[]>
  // connectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean>
  // disconnectMCPServer(starshipId: string, mcpServerId: string): Promise<boolean>
  // }

  // export interface CodexRepository extends Repository<Codex> {
  //   findActiveByStarship(starshipId: string): Promise<Codex | null>;
  //   getVersionHistory(starshipId: string): Promise<Codex[]>;
  //   createVersion(starshipId: string, author: string, changeSummary: string): Promise<Codex>;
  //   deactivateCurrentVersion(starshipId: string): Promise<void>;
}

export interface VisionRepository {
  findAll(): Promise<Vision[]>;
  findById(id: string): Promise<Vision | null>;
  create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision>;
  update(id: string, updates: Partial<Vision>): Promise<Vision | null>;
  delete(id: string): Promise<boolean>;
  findByStarship(starshipId: string): Promise<Vision | null>;
  updateStatement(starshipId: string, statement: string): Promise<Vision | null>;
}

export interface AgentChannelRelationship {
  agentId: string;
  channelId: string;
  deployedAt: string;
  isActive: boolean;
}

export interface UserInteractionRelationship {
  userId: string;
  agentId: string;
  lastInteraction: string;
  messageCount: number;
}

// NEW: Agent Templates System
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
  tags: string[];

  // Template configuration
  systemPrompt: string;
  model: string; // References LLM.id
  temperature?: number;
  maxTokens?: number;

  // Template metadata
  authorId: string;
  isPublic: boolean;
  usageCount: number;
  rating?: number;

  // Template preview
  icon?: string;
  previewPrompts?: string[]; // Example prompts to show what the template can do

  createdAt: string;
  updatedAt: string;
}

export interface AgentTemplateRepository extends Repository<AgentTemplate> {
  findByAuthor(authorId: string): Promise<AgentTemplate[]>;
  findByCategory(category: string): Promise<AgentTemplate[]>;
  findByTags(tags: string[]): Promise<AgentTemplate[]>;
  findPublic(limit?: number, offset?: number): Promise<AgentTemplate[]>;
  searchTemplates(query: string): Promise<AgentTemplate[]>;
  incrementUsageCount(id: string): Promise<void>;
  updateRating(id: string, rating: number): Promise<void>;

  // Create agent from template
  createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<Agent>;

  // Create template from public agent
  createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null>;
}

// NEW: MCP Server Option Repository Interface
export interface MCPServerOptionRepository extends Repository<MCPServerOption> {
  findByCommand(command: string): Promise<MCPServerOption[]>;
  findActive(): Promise<MCPServerOption[]>;
  searchByName(nameQuery: string): Promise<MCPServerOption[]>;
}

// NEW: Starship-Connector Relationship
export interface HasConnectorRelationship {
  type: 'HAS_CONNECTOR';
  properties?: {
    connectedAt?: string;
    isActive?: boolean;
  };
}

/**
 * HasConnectorInstanceRelationship
 *
 * Represents the relationship between a Starship and a MCPServerConnector instance.
 * This relationship indicates that a starship has deployed a specific connector instance.
 */
export interface HasConnectorInstanceRelationship {
  type: 'HAS_CONNECTOR_INSTANCE';
  properties?: {
    /** Timestamp when the connector instance was created on the starship */
    createdAt?: string;
  };
}

/**
 * CreatedFromRelationship
 *
 * Represents the relationship between a MCPServerConnector instance and a MCPServerOption template.
 * This relationship indicates that a connector instance was created from a specific template.
 */
export interface CreatedFromRelationship {
  type: 'CREATED_FROM';
  properties?: {
    /** Timestamp when the connector instance was created from the template */
    createdAt?: string;
  };
}

/**
 * Custom error classes for better error handling and validation
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConstraintViolationError extends Error {
  constructor(
    message: string,
    public constraintType: 'unique' | 'foreign_key' | 'check'
  ) {
    super(message);
    this.name = 'ConstraintViolationError';
  }
}

export class NotFoundError extends Error {
  constructor(
    message: string,
    public entityType: string,
    public entityId: string
  ) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Configuration Validation Utilities
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value?: any
  ) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Default Configuration Values
 */
export const DEFAULT_CONNECTOR_CONFIG: Required<ConnectorInstanceConfig> = {
  customName: '',
  customDescription: '',
  environmentVariables: '{}',
  timeouts: {
    connection: 30000,
    request: 60000,
    idle: 300000,
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    exponentialBackoff: true,
  },
  logging: {
    level: 'info',
    enableDebug: false,
    logRequests: false,
    logMetrics: true,
  },
  resources: {
    maxMemoryMB: 512,
    maxCpuPercent: 80,
    maxConnections: 100,
  },
  healthCheck: {
    enabled: true,
    interval: 30000,
    timeout: 5000,
    failureThreshold: 3,
  },
  customConfig: {},
};

// Expedition Repository Interface
export interface ExpeditionRepository {
  findAll(): Promise<Expedition[]>;
  findById(id: string): Promise<Expedition | null>;
  findByStarship(starshipId: string): Promise<Expedition[]>;
  create(entity: Omit<Expedition, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expedition>;
  update(id: string, updates: Partial<Expedition>): Promise<Expedition | null>;
  delete(id: string): Promise<boolean>;
  assignAgents(expeditionId: string, agentIds: string[]): Promise<void>;
  getAssignedAgents(expeditionId: string): Promise<Agent[]>;
}

/**
 * Configuration Validation Schema
 */
export interface ConfigValidationSchema {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  validator?: (value: any) => boolean | string;
}

/**
 * Predefined Configuration Templates
 */
export const BUILTIN_CONFIG_TEMPLATES: Omit<
  ConnectorConfigTemplate,
  'id' | 'authorId' | 'usageCount' | 'createdAt' | 'updatedAt'
>[] = [
  {
    name: 'Development',
    description: 'Optimized for development with debug logging and relaxed timeouts',
    category: 'development',
    tags: ['development', 'debug', 'local'],
    isPublic: true,
    config: {
      timeouts: {
        connection: 60000,
        request: 120000,
        idle: 600000,
      },
      retry: {
        maxAttempts: 1,
        baseDelay: 500,
        maxDelay: 2000,
        exponentialBackoff: false,
      },
      logging: {
        level: 'debug',
        enableDebug: true,
        logRequests: true,
        logMetrics: true,
      },
      healthCheck: {
        enabled: true,
        interval: 60000,
        timeout: 10000,
        failureThreshold: 5,
      },
    },
  },
  {
    name: 'Production',
    description: 'Optimized for production with conservative settings and monitoring',
    category: 'production',
    tags: ['production', 'stable', 'monitoring'],
    isPublic: true,
    config: {
      timeouts: {
        connection: 15000,
        request: 30000,
        idle: 180000,
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 8000,
        exponentialBackoff: true,
      },
      logging: {
        level: 'warn',
        enableDebug: false,
        logRequests: false,
        logMetrics: true,
      },
      resources: {
        maxMemoryMB: 256,
        maxCpuPercent: 70,
        maxConnections: 50,
      },
      healthCheck: {
        enabled: true,
        interval: 15000,
        timeout: 3000,
        failureThreshold: 2,
      },
    },
  },
  {
    name: 'Testing',
    description: 'Optimized for testing with fast timeouts and detailed logging',
    category: 'testing',
    tags: ['testing', 'ci', 'fast'],
    isPublic: true,
    config: {
      timeouts: {
        connection: 5000,
        request: 10000,
        idle: 30000,
      },
      retry: {
        maxAttempts: 1,
        baseDelay: 100,
        maxDelay: 500,
        exponentialBackoff: false,
      },
      logging: {
        level: 'info',
        enableDebug: false,
        logRequests: true,
        logMetrics: false,
      },
      healthCheck: {
        enabled: false,
        interval: 5000,
        timeout: 1000,
        failureThreshold: 1,
      },
    },
  },
];
