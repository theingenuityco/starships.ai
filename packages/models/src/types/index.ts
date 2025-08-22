/**
 * Domain Types - Barrel Export File
 * 
 * This file maintains backward compatibility for existing imports while enabling
 * incremental migration to domain-specific imports. All types are organized by
 * their domain context for better understanding and maintainability.
 * 
 * MIGRATION GUIDE:
 * - Existing imports will continue to work: import { User } from '@starships/models/types'
 * - New imports should use domain-specific files: import { User } from '@starships/models/types/user'
 * - This barrel export will be maintained during the transition period
 */

// =============================================================================
// SHARED TYPES AND UTILITIES
// =============================================================================

export * from './shared';

// =============================================================================
// USER IDENTITY CONTEXT
// Domain: User management, authentication, billing integration
// =============================================================================

export * from './user';

// Explicit re-exports for clarity
export type {
  User,
  UserRepository,
  CreateUserInput,
  UpdateUserInput,
  UserValidationResult,
  UserCreatedEvent,
  UserUpdatedEvent,
  UserStripeLinkedEvent,
  UserKindeLinkedEvent
} from './user';

// =============================================================================
// STARSHIP LIFECYCLE CONTEXT  
// Domain: Starship deployment, capacity management, billing
// =============================================================================

// Explicit re-exports for clarity to avoid export conflicts
export type {
  Starship,
  StarshipClass,
  StarshipStatus,
  BillingPeriod,
  StarshipRepository,
  CreateStarshipInput,
  UpdateStarshipInput,
  StarshipValidationResult,
  StarshipCreatedEvent,
  StarshipUpdatedEvent,
  StarshipClassUpgradedEvent,
  StarshipAgentDeployedEvent,
  StarshipAgentRemovedEvent
} from './starship';

export { 
  STARSHIP_CAPACITY_LIMITS,
  StarshipBusinessRules,
  StarshipUtils
} from './starship';

// =============================================================================
// AGENT MARKETPLACE CONTEXT
// Domain: Agent templates, marketplace, deployment management  
// =============================================================================

// Explicit re-exports for clarity (Agent is imported from protocol)
export type {
  Agent, // Re-exported from @starships/protocol
  AgentCategory,
  AgentTemplate,
  AgentRepository,
  AgentTemplateRepository,
  CreateAgentInput,
  UpdateAgentInput,
  CreateAgentTemplateInput,
  UpdateAgentTemplateInput,
  AgentValidationResult,
  AgentTemplateValidationResult,
  AgentCreatedEvent,
  AgentUpdatedEvent,
  AgentDeployedEvent,
  AgentPublishedEvent,
  AgentTemplateCreatedEvent
} from './agent';

export { Agent } from './agent';

export {
  AgentBusinessRules,
  AgentUtils
} from './agent';

// =============================================================================
// CONNECTOR MANAGEMENT CONTEXT
// Domain: MCP server connectors, configuration, Docker deployment
// =============================================================================

// Explicit re-exports for clarity

// Explicit re-exports for clarity
export type {
  MCPServerOption,
  MCPServerConnector,
  ConnectorInstanceConfig,
  ConnectorConfigTemplate,
  ConnectorConfigHistory,
  DockerStatus,
  DockerHealthStatus,
  ConnectorStatus,
  ConfigTemplateCategory,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
  ConnectorConfigTemplateRepository,
  ConnectorConfigHistoryRepository,
  CreateMCPServerOptionInput,
  CreateConnectorConfigTemplateInput,
  CreateConnectorConfigHistoryInput,
  CreateMCPServerConnectorInput
} from './connector';

export {
  ConnectorUtils
} from './connector';

// =============================================================================
// VISION STATEMENT CONTEXT
// Domain: Vision statements, quality metrics, refinement tracking
// =============================================================================

// Explicit re-exports for clarity

// Explicit re-exports for clarity
export type {
  Vision,
  VisionRepository,
  CreateVisionInput,
  UpdateVisionInput,
  VisionValidationResult,
  VisionCreatedEvent,
  VisionUpdatedEvent,
  VisionRefinedEvent,
  VisionQualityAssessedEvent,
  VisionActivatedEvent
} from './vision';

export {
  VisionBusinessRules,
  VisionUtils
} from './vision';

// =============================================================================
// RELATIONSHIP DEFINITIONS
// Domain: Cross-domain graph relationships
// =============================================================================

// Explicit re-exports for clarity

// Explicit re-exports for key relationship types
export type {
  BaseRelationship,
  OwnsRelationship,
  AuthorsRelationship,
  DeployedOnRelationship,
  HasVisionRelationship,
  HasConnectorInstanceRelationship,
  CreatedFromRelationship,
  CreatedFromTemplateRelationship,
  BelongsToStarshipRelationship,
  RefinedFromRelationship,
  AllRelationships,
  RelationshipTypeMap
} from './relationships';

export {
  RelationshipUtils
} from './relationships';

// =============================================================================
// LEGACY COMPATIBILITY EXPORTS
// These exports maintain compatibility with the old monolithic types.ts
// They should be gradually migrated to use domain-specific imports
// =============================================================================

// Legacy interfaces that were in the original types.ts but not domain-specific
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

export interface Channel {
  id: string;
  name: string;
  guildId?: string;
  type: 'text' | 'voice' | 'dm';
  createdAt: string;
}

export interface LLMRepository {
  findAll(): Promise<LLM[]>;
  findById(id: string): Promise<LLM | null>;
  create(entity: Omit<LLM, 'id' | 'createdAt'>): Promise<LLM>;
  update(id: string, updates: Partial<LLM>): Promise<LLM | null>;
  delete(id: string): Promise<boolean>;
  findByProvider(provider: string): Promise<LLM[]>;
}

export interface ChannelRepository {
  findAll(): Promise<Channel[]>;
  findById(id: string): Promise<Channel | null>;
  create(entity: Omit<Channel, 'id' | 'createdAt'>): Promise<Channel>;
  update(id: string, updates: Partial<Channel>): Promise<Channel | null>;
  delete(id: string): Promise<boolean>;
  findByGuild(guildId: string): Promise<Channel[]>;
  findByType(type: string): Promise<Channel[]>;
}

// Legacy relationship interfaces for backward compatibility
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

// Legacy error classes - now re-exported from shared
export {
  ValidationError,
  ConstraintViolationError,
  NotFoundError,
  DomainError
} from './shared';

// Configuration validation utilities for connector management
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

// Default configuration values for connectors
export const DEFAULT_CONNECTOR_CONFIG = {
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

// Configuration validation schema interface
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

// Predefined configuration templates
export const BUILTIN_CONFIG_TEMPLATES = [
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

// =============================================================================
// MIGRATION NOTES AND DEPRECATION WARNINGS
// =============================================================================

/**
 * @deprecated This barrel export is maintained for backward compatibility.
 * 
 * PREFERRED IMPORT PATTERNS:
 * 
 * Instead of:
 *   import { User, Starship, Agent } from '@starships/models/types'
 * 
 * Prefer domain-specific imports:
 *   import { User } from '@starships/models/types/user'
 *   import { Starship } from '@starships/models/types/starship' 
 *   import { Agent } from '@starships/models/types/agent'
 * 
 * This provides better:
 * - Code organization by domain
 * - Tree-shaking and bundle optimization
 * - Type safety and IntelliSense
 * - Understanding of domain boundaries
 * 
 * DOMAIN BOUNDARIES:
 * - user.ts: User Identity Context
 * - starship.ts: Starship Lifecycle Context
 * - agent.ts: Agent Marketplace Context
 * - connector.ts: Connector Management Context
 * - vision.ts: Vision Statement Context
 * - relationships.ts: Cross-domain relationships
 * - shared.ts: Common utilities and base types
 */