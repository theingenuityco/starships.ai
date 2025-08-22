import { z } from 'zod';
import { Agent } from '@starships/protocol';
import {
  Repository,
  BaseEntity,
  TemporalFields,
  UuidSchema,
  DateTimeSchema,
  RatingSchema
} from './shared';

/**
 * Re-export Agent interface from protocol to avoid circular dependency
 */
export { Agent } from '@starships/protocol';

/**
 * Agent Category Enumeration
 */
export const AgentCategorySchema = z.enum(['general', 'coding', 'creative', 'analysis', 'support']);
export type AgentCategory = z.infer<typeof AgentCategorySchema>;

/**
 * Starship Class Enumeration (for agent deployment restrictions)
 */
export const AgentStarshipClassSchema = z.enum(['scout', 'cruiser']);
export type AgentStarshipClass = z.infer<typeof AgentStarshipClassSchema>;

/**
 * Agent Validation Schema
 * 
 * Comprehensive Zod validation schema for Agent entity with marketplace
 * and deployment validation rules.
 */
export const AgentSchema = z.object({
  id: UuidSchema,
  name: z.string()
    .min(1, 'Agent name cannot be empty')
    .max(100, 'Agent name must be at most 100 characters'),
  model: z.string()
    .min(1, 'Model cannot be empty'),
  systemPrompt: z.string().optional(),
  createdAt: DateTimeSchema,
  
  // Marketplace fields
  description: z.string()
    .max(500, 'Description must be at most 500 characters')
    .optional(),
  tags: z.array(z.string().min(1, 'Tag cannot be empty'))
    .max(10, 'Maximum 10 tags allowed'),
  category: AgentCategorySchema,
  authorId: UuidSchema,
  isPublic: z.boolean(),
  version: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (e.g., 1.0.0)'),
  updatedAt: DateTimeSchema,
  usageCount: z.number()
    .int('Usage count must be an integer')
    .min(0, 'Usage count cannot be negative'),
  rating: RatingSchema.optional(),
  
  // Configuration fields
  temperature: z.number()
    .min(0, 'Temperature must be at least 0')
    .max(2, 'Temperature must be at most 2')
    .optional(),
  maxTokens: z.number()
    .int('Max tokens must be an integer')
    .min(1, 'Max tokens must be at least 1')
    .max(32000, 'Max tokens must be at most 32000')
    .optional(),
  customInstructions: z.string()
    .max(1000, 'Custom instructions must be at most 1000 characters')
    .optional(),
  
  // Deployment fields
  /**
   * @deprecated Use (:Agent)-[:DEPLOYED_ON]->(:Starship) relationship instead
   * Foreign key to Starship - will be removed in favor of graph relationships
   */
  starshipId: UuidSchema,
  allowedStarshipClasses: z.array(AgentStarshipClassSchema)
    .max(3, 'Maximum 3 starship classes allowed')
    .optional(),
  requiredPermissions: z.array(z.string())
    .max(10, 'Maximum 10 permissions allowed')
    .optional()
}).strict();

/**
 * Agent Template Entity (Agent Marketplace Context)
 * 
 * Represents a reusable agent template that can be instantiated into agents.
 * Templates are used in the marketplace for sharing and discovering agent configurations.
 */
export interface AgentTemplate extends BaseEntity, TemporalFields {
  /** Unique identifier for the template */
  id: string;
  
  /** Template name */
  name: string;
  
  /** Template description */
  description: string;
  
  /** Template category */
  category: AgentCategory;
  
  /** Tags for discovery and filtering */
  tags: string[];
  
  // Template configuration
  /** System prompt for the template */
  systemPrompt: string;
  
  /** Default model for agents created from this template */
  model: string;
  
  /** Default temperature setting */
  temperature?: number;
  
  /** Default max tokens setting */
  maxTokens?: number;
  
  // Template metadata
  /** 
   * @deprecated Use (:User)-[:AUTHORED]->(:AgentTemplate) relationship instead
   * Foreign key to User - will be removed in favor of graph relationships
   */
  authorId: string;
  
  /** Whether this template is publicly available */
  isPublic: boolean;
  
  /** Number of times this template has been used */
  usageCount: number;
  
  /** Average rating from users */
  rating?: number;
  
  // Template preview
  /** Icon or image URL for the template */
  icon?: string;
  
  /** Example prompts showing template capabilities */
  previewPrompts?: string[];
  
  /** Timestamp when the template was created */
  createdAt: string;
  
  /** Timestamp when the template was last updated */
  updatedAt: string;
}

/**
 * Agent Template Validation Schema
 */
export const AgentTemplateSchema = z.object({
  id: UuidSchema,
  name: z.string()
    .min(1, 'Template name cannot be empty')
    .max(100, 'Template name must be at most 100 characters'),
  description: z.string()
    .min(1, 'Description cannot be empty')
    .max(500, 'Description must be at most 500 characters'),
  category: AgentCategorySchema,
  tags: z.array(z.string().min(1, 'Tag cannot be empty'))
    .max(10, 'Maximum 10 tags allowed'),
  systemPrompt: z.string()
    .min(1, 'System prompt cannot be empty')
    .max(2000, 'System prompt must be at most 2000 characters'),
  model: z.string()
    .min(1, 'Model cannot be empty'),
  temperature: z.number()
    .min(0, 'Temperature must be at least 0')
    .max(2, 'Temperature must be at most 2')
    .optional(),
  maxTokens: z.number()
    .int('Max tokens must be an integer')
    .min(1, 'Max tokens must be at least 1')
    .max(32000, 'Max tokens must be at most 32000')
    .optional(),
  authorId: UuidSchema,
  isPublic: z.boolean(),
  usageCount: z.number()
    .int('Usage count must be an integer')
    .min(0, 'Usage count cannot be negative'),
  rating: RatingSchema.optional(),
  icon: z.string().url('Icon must be a valid URL').optional(),
  previewPrompts: z.array(z.string())
    .max(5, 'Maximum 5 preview prompts allowed')
    .optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).strict();

/**
 * Agent Creation Schema
 */
export const CreateAgentSchema = AgentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
  version: true
}).extend({
  version: z.string().default('1.0.0')
});

/**
 * Agent Update Schema
 */
export const UpdateAgentSchema = AgentSchema.partial().omit({
  id: true,
  createdAt: true,
  authorId: true // Author cannot be changed
});

/**
 * Agent Template Creation Schema
 */
export const CreateAgentTemplateSchema = AgentTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true
});

/**
 * Agent Template Update Schema
 */
export const UpdateAgentTemplateSchema = AgentTemplateSchema.partial().omit({
  id: true,
  createdAt: true,
  authorId: true // Author cannot be changed
});

/**
 * Agent Repository Interface (Agent Marketplace Context)
 * 
 * Repository interface for managing Agent entities with marketplace
 * and deployment operations.
 */
export interface AgentRepository extends Repository<Agent> {
  /**
   * Find agents by channel (legacy)
   * @param channelId - The channel ID
   * @returns Promise resolving to array of agents
   */
  findByChannel(channelId: string): Promise<Agent[]>;

  /**
   * Find agents by user
   * @param userId - The user ID
   * @returns Promise resolving to array of agents
   */
  findByUser(userId: string): Promise<Agent[]>;

  /**
   * Find agents by starship
   * @param starshipId - The starship ID
   * @returns Promise resolving to array of agents
   */
  findByStarship(starshipId: string): Promise<Agent[]>;

  /**
   * Find agents by starship ID (FK-based query)
   * @deprecated Use graph relationship traversal instead
   * @param starshipId - The starship ID
   * @returns Promise resolving to array of agents
   */
  findByStarshipId(starshipId: string): Promise<Agent[]>;

  /**
   * Update the starship ID for an agent
   * @deprecated Use graph relationship management instead
   * @param agentId - The agent ID
   * @param starshipId - The new starship ID
   * @returns Promise resolving when complete
   */
  updateStarshipId(agentId: string, starshipId: string): Promise<void>;

  /**
   * Find agents that are not deployed to any starship
   * @returns Promise resolving to array of undeployed agents
   */
  findUndeployedAgents(): Promise<Agent[]>;

  /**
   * Find agents by author
   * @param authorId - The author's user ID
   * @returns Promise resolving to array of agents
   */
  findByAuthor(authorId: string): Promise<Agent[]>;

  /**
   * Find agents by category
   * @param category - The agent category
   * @returns Promise resolving to array of agents
   */
  findByCategory(category: string): Promise<Agent[]>;

  /**
   * Find agents by tags
   * @param tags - Array of tags to filter by
   * @returns Promise resolving to array of agents
   */
  findByTags(tags: string[]): Promise<Agent[]>;

  /**
   * Find public agents for marketplace
   * @param limit - Optional limit for results
   * @param offset - Optional offset for pagination
   * @returns Promise resolving to array of public agents
   */
  findPublic(limit?: number, offset?: number): Promise<Agent[]>;

  /**
   * Search agents by name or description
   * @param query - Search query string
   * @returns Promise resolving to array of matching agents
   */
  searchAgents(query: string): Promise<Agent[]>;

  /**
   * Increment the usage count for an agent
   * @param id - The agent ID
   * @returns Promise resolving when complete
   */
  incrementUsageCount(id: string): Promise<void>;

  /**
   * Update the rating for an agent
   * @param id - The agent ID
   * @param rating - The new rating (1-5)
   * @returns Promise resolving when complete
   */
  updateRating(id: string, rating: number): Promise<void>;

  /**
   * Find agents with advanced filtering
   * @param filters - Filter criteria
   * @returns Promise resolving to array of filtered agents
   */
  findWithFilters(filters: {
    category?: string;
    tags?: string[];
    isPublic?: boolean;
    authorId?: string;
    starshipClass?: AgentStarshipClass;
  }): Promise<Agent[]>;

  /**
   * Find agents compatible with a specific starship class
   * @param starshipClass - The starship class
   * @returns Promise resolving to array of compatible agents
   */
  findCompatibleWithStarshipClass(starshipClass: AgentStarshipClass): Promise<Agent[]>;

  /**
   * Get trending agents based on recent usage
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of trending agents
   */
  findTrending(limit?: number): Promise<Agent[]>;

  /**
   * Get top-rated agents
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of top-rated agents
   */
  findTopRated(limit?: number): Promise<Agent[]>;
}

/**
 * Agent Template Repository Interface (Agent Marketplace Context)
 * 
 * Repository interface for managing Agent Template entities with marketplace operations.
 */
export interface AgentTemplateRepository extends Repository<AgentTemplate> {
  /**
   * Find templates by author
   * @param authorId - The author's user ID
   * @returns Promise resolving to array of templates
   */
  findByAuthor(authorId: string): Promise<AgentTemplate[]>;

  /**
   * Find templates by category
   * @param category - The template category
   * @returns Promise resolving to array of templates
   */
  findByCategory(category: string): Promise<AgentTemplate[]>;

  /**
   * Find templates by tags
   * @param tags - Array of tags to filter by
   * @returns Promise resolving to array of templates
   */
  findByTags(tags: string[]): Promise<AgentTemplate[]>;

  /**
   * Find public templates for marketplace
   * @param limit - Optional limit for results
   * @param offset - Optional offset for pagination
   * @returns Promise resolving to array of public templates
   */
  findPublic(limit?: number, offset?: number): Promise<AgentTemplate[]>;

  /**
   * Search templates by name or description
   * @param query - Search query string
   * @returns Promise resolving to array of matching templates
   */
  searchTemplates(query: string): Promise<AgentTemplate[]>;

  /**
   * Increment the usage count for a template
   * @param id - The template ID
   * @returns Promise resolving when complete
   */
  incrementUsageCount(id: string): Promise<void>;

  /**
   * Update the rating for a template
   * @param id - The template ID
   * @param rating - The new rating (1-5)
   * @returns Promise resolving when complete
   */
  updateRating(id: string, rating: number): Promise<void>;

  /**
   * Create an agent from a template
   * @param templateId - The template ID
   * @param agentName - Name for the new agent
   * @param authorId - The user creating the agent
   * @param starshipId - The starship to deploy the agent on
   * @returns Promise resolving to the created agent
   */
  createAgentFromTemplate(
    templateId: string,
    agentName: string,
    authorId: string,
    starshipId: string
  ): Promise<Agent>;

  /**
   * Create a template from a public agent
   * @param agentId - The agent ID to create template from
   * @returns Promise resolving to the created template or null if agent is not public
   */
  createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null>;

  /**
   * Get popular templates based on usage count
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of popular templates
   */
  findPopular(limit?: number): Promise<AgentTemplate[]>;

  /**
   * Get recently created templates
   * @param limit - Optional limit for results
   * @returns Promise resolving to array of recent templates
   */
  findRecent(limit?: number): Promise<AgentTemplate[]>;
}

/**
 * Agent Domain Events
 */

export interface AgentCreatedEvent {
  eventType: 'AgentCreated';
  aggregateId: string;
  agent: Agent;
  occurredAt: string;
  version: number;
}

export interface AgentUpdatedEvent {
  eventType: 'AgentUpdated';
  aggregateId: string;
  agentId: string;
  changes: Partial<Agent>;
  occurredAt: string;
  version: number;
}

export interface AgentDeployedEvent {
  eventType: 'AgentDeployed';
  aggregateId: string;
  agentId: string;
  starshipId: string;
  occurredAt: string;
  version: number;
}

export interface AgentPublishedEvent {
  eventType: 'AgentPublished';
  aggregateId: string;
  agentId: string;
  occurredAt: string;
  version: number;
}

export interface AgentTemplateCreatedEvent {
  eventType: 'AgentTemplateCreated';
  aggregateId: string;
  template: AgentTemplate;
  occurredAt: string;
  version: number;
}

/**
 * Agent Business Rules
 */

export const AgentBusinessRules = {
  /**
   * Validates that an agent can be deployed to a specific starship class
   */
  canDeployToStarshipClass: (agent: Agent, starshipClass: AgentStarshipClass): boolean => {
    if (!agent.allowedStarshipClasses) {
      return true; // No restrictions
    }
    // Cast agent.allowedStarshipClasses to our extended type for compatibility check
    return (agent.allowedStarshipClasses as AgentStarshipClass[]).includes(starshipClass);
  },

  /**
   * Validates that an agent configuration is complete for deployment
   */
  isDeploymentReady: (agent: Agent): boolean => {
    return !!(agent.name && agent.model && agent.systemPrompt);
  },

  /**
   * Validates that an agent can be made public
   */
  canMakePublic: (agent: Agent): boolean => {
    return !!(agent.description && agent.tags.length > 0 && agent.category);
  },

  /**
   * Validates that a template has sufficient information for marketplace
   */
  isMarketplaceReady: (template: AgentTemplate): boolean => {
    return !!(
      template.name &&
      template.description &&
      template.systemPrompt &&
      template.category &&
      template.tags.length > 0
    );
  }
};

/**
 * Type exports for external use
 */
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentInput = z.infer<typeof UpdateAgentSchema>;
export type CreateAgentTemplateInput = z.infer<typeof CreateAgentTemplateSchema>;
export type UpdateAgentTemplateInput = z.infer<typeof UpdateAgentTemplateSchema>;
export type AgentValidationResult = { success: true; data: Agent } | { success: false; error: z.ZodError };
export type AgentTemplateValidationResult = { success: true; data: AgentTemplate } | { success: false; error: z.ZodError };

/**
 * Agent Utility Functions
 */
export const AgentUtils = {
  /**
   * Validates an Agent entity against the schema
   */
  validate: (agent: any): AgentValidationResult => {
    const result = AgentSchema.safeParse(agent);
    return result as AgentValidationResult;
  },

  /**
   * Validates an AgentTemplate entity against the schema
   */
  validateTemplate: (template: any): AgentTemplateValidationResult => {
    return AgentTemplateSchema.safeParse(template);
  },

  /**
   * Increments the version number for an agent
   */
  incrementVersion: (currentVersion: string): string => {
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    return `${major}.${minor}.${patch + 1}`;
  },

  /**
   * Generates tags from agent name and description
   */
  generateTags: (name: string, description?: string): string[] => {
    const text = `${name} ${description || ''}`.toLowerCase();
    const words = text.match(/\b\w{3,}\b/g) || [];
    return [...new Set(words)].slice(0, 5);
  },

  /**
   * Calculates compatibility score between agent and starship class
   */
  calculateCompatibilityScore: (agent: Agent, starshipClass: AgentStarshipClass): number => {
    let score = 1.0;
    
    if (agent.allowedStarshipClasses) {
      if (!(agent.allowedStarshipClasses as AgentStarshipClass[]).includes(starshipClass)) {
        return 0; // Not compatible
      }
    }
    
    // Adjust score based on resource requirements
    if (agent.maxTokens && agent.maxTokens > 16000 && starshipClass === 'scout') {
      score *= 0.7; // High token usage may struggle on scout class
    }
    
    return score;
  }
};