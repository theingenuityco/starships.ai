import { z } from 'zod';
import {
  Repository,
  BaseEntity,
  TemporalFields,
  AggregateRoot,
  UuidSchema,
  SlugSchema,
  DateTimeSchema,
  EntityStatusSchema
} from './shared';

/**
 * Starship Class Enumeration
 * 
 * Defines the available starship classes with their capacity limitations.
 */
export const StarshipClassSchema = z.enum(['scout', 'cruiser', 'draught']);
export type StarshipClass = z.infer<typeof StarshipClassSchema>;

/**
 * Starship Status Enumeration
 * 
 * Defines the operational status of a starship including billing states.
 */
export const StarshipStatusSchema = z.enum([
  'active',
  'inactive', 
  'restricted',
  'disabled',
  'pending_payment'
]);
export type StarshipStatus = z.infer<typeof StarshipStatusSchema>;

/**
 * Billing Period Enumeration
 */
export const BillingPeriodSchema = z.enum(['monthly', 'yearly']);
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;

/**
 * Starship Capacity Configuration
 * 
 * Defines the capacity limits for each starship class.
 */
export const STARSHIP_CAPACITY_LIMITS = {
  scout: { maxAgents: 3, maxActiveMissions: 3 },
  cruiser: { maxAgents: 5, maxActiveMissions: 6 },
  draught: { maxAgents: 10, maxActiveMissions: 10 }
} as const;

/**
 * Starship Entity (Starship Lifecycle Context - Aggregate Root)
 * 
 * Represents a starship deployment platform with class-based capacity limits,
 * billing integration, and lifecycle management. This is an aggregate root that
 * manages starship configuration, capacity, and billing state.
 */
export interface Starship extends BaseEntity, TemporalFields, AggregateRoot {
  /** Unique identifier for the starship */
  id: string;
  
  /** URL-friendly slug for the starship */
  slug: string;
  
  /** 
   * @deprecated Use (:User)-[:OWNS]->(:Starship) relationship instead
   * Foreign key to User - will be removed in favor of graph relationships
   */
  ownerId: string;
  
  /** Starship class determining capacity limits */
  class: StarshipClass;
  
  /** Display name for the starship */
  name: string;
  
  /** Maximum number of agents that can be deployed (based on class) */
  maxAgents: number;
  
  /** Maximum number of active missions (based on class) */
  maxActiveMissions: number;
  
  /** Current operational status */
  status: StarshipStatus;
  
  /** Timestamp when the starship was created */
  createdAt: string;
  
  /** Timestamp when the starship was last updated */
  updatedAt: string;
  
  // Stripe integration fields
  /** Stripe subscription ID for billing */
  subscriptionId?: string;
  
  /** Billing plan (separate from class for flexibility) */
  plan?: StarshipClass;
  
  /** Billing period for subscription */
  billingPeriod?: BillingPeriod;
  
  /** Stripe customer ID for portal access */
  stripeCustomerId?: string;
  
  // Aggregate root marker
  readonly _aggregateRoot: true;
}

/**
 * Starship Validation Schema
 * 
 * Comprehensive Zod validation schema for Starship entity with class-based
 * capacity validation and business rules.
 */
export const StarshipSchema = z.object({
  id: UuidSchema,
  slug: SlugSchema,
  ownerId: UuidSchema,
  class: StarshipClassSchema,
  name: z.string()
    .min(1, 'Starship name cannot be empty')
    .max(100, 'Starship name must be at most 100 characters'),
  maxAgents: z.number()
    .int('Max agents must be an integer')
    .min(1, 'Max agents must be at least 1')
    .max(10, 'Max agents must be at most 10'),
  maxActiveMissions: z.number()
    .int('Max active missions must be an integer')
    .min(1, 'Max active missions must be at least 1')
    .max(10, 'Max active missions must be at most 10'),
  status: StarshipStatusSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  subscriptionId: z.string()
    .min(1, 'Subscription ID cannot be empty')
    .startsWith('sub_', 'Subscription ID must start with "sub_"')
    .optional(),
  plan: StarshipClassSchema.optional(),
  billingPeriod: BillingPeriodSchema.optional(),
  stripeCustomerId: z.string()
    .min(1, 'Stripe customer ID cannot be empty')
    .startsWith('cus_', 'Stripe customer ID must start with "cus_"')
    .optional(),
  _aggregateRoot: z.literal(true),
}).strict().superRefine((data: any, ctx: any) => {
  // Validate that maxAgents matches the class capacity
  const expectedCapacity = STARSHIP_CAPACITY_LIMITS[data.class as keyof typeof STARSHIP_CAPACITY_LIMITS];
  if (data.maxAgents !== expectedCapacity.maxAgents) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxAgents'],
      message: `Max agents for ${data.class} class must be ${expectedCapacity.maxAgents}`,
    });
  }
  
  // Validate that maxActiveMissions matches the class capacity
  if (data.maxActiveMissions !== expectedCapacity.maxActiveMissions) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxActiveMissions'],
      message: `Max active missions for ${data.class} class must be ${expectedCapacity.maxActiveMissions}`,
    });
  }
  
  // Validate billing consistency
  if (data.subscriptionId && !data.plan) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plan'],
      message: 'Plan is required when subscription ID is provided',
    });
  }
  
  if (data.subscriptionId && !data.billingPeriod) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['billingPeriod'],
      message: 'Billing period is required when subscription ID is provided',
    });
  }
});

/**
 * Starship Creation Schema
 * 
 * Schema for creating new Starship entities, excluding auto-generated fields.
 */
export const CreateStarshipSchema = StarshipSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  maxAgents: true,
  maxActiveMissions: true,
  _aggregateRoot: true,
}).extend({
  slug: SlugSchema.optional(), // Can be auto-generated from name
});

/**
 * Starship Update Schema
 * 
 * Schema for updating existing Starship entities, all fields optional except restricted ones.
 */
export const UpdateStarshipSchema = StarshipSchema.partial().omit({
  id: true,
  createdAt: true,
  ownerId: true, // Owner cannot be changed after creation
  _aggregateRoot: true,
});

/**
 * Starship Repository Interface (Starship Lifecycle Context)
 * 
 * Repository interface for managing Starship entities with domain-specific
 * query methods for deployment, capacity management, and billing operations.
 */
export interface StarshipRepository {
  findAll(): Promise<Starship[]>;
  findById(id: string): Promise<Starship | null>;
  
  /**
   * Find a starship by slug and owner
   * @param slug - The starship slug
   * @param ownerId - The owner's user ID
   * @returns Promise resolving to the starship or null if not found
   */
  findBySlug(slug: string, ownerId: string): Promise<Starship | null>;
  
  /**
   * Create a new starship with auto-generated capacity limits
   * @param entity - Starship creation data
   * @returns Promise resolving to the created starship
   */
  create(
    entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & {
      slug?: string;
    }
  ): Promise<Starship>;
  
  update(id: string, updates: Partial<Starship>): Promise<Starship | null>;
  delete(id: string): Promise<boolean>;
  
  /**
   * Find all starships owned by a specific user
   * @param ownerId - The owner's user ID
   * @returns Promise resolving to array of starships
   */
  findByOwner(ownerId: string): Promise<Starship[]>;
  
  /**
   * Get all agents currently deployed on a starship
   * @param starshipId - The starship ID
   * @returns Promise resolving to array of deployed agents
   */
  getDeployedAgents(starshipId: string): Promise<any[]>; // Using any[] for Agent type from protocol
  
  /**
   * Deploy an agent to a starship
   * @param starshipId - The starship ID
   * @param agentId - The agent ID to deploy
   * @returns Promise resolving to true if successful
   */
  deployAgent(starshipId: string, agentId: string): Promise<boolean>;
  
  /**
   * Remove an agent from a starship
   * @param starshipId - The starship ID
   * @param agentId - The agent ID to remove
   * @returns Promise resolving to true if successful
   */
  removeAgent(starshipId: string, agentId: string): Promise<boolean>;
  
  /**
   * Get the number of available deployment slots on a starship
   * @param starshipId - The starship ID
   * @returns Promise resolving to the number of available slots
   */
  getAvailableSlots(starshipId: string): Promise<number>;
  
  /**
   * Generate a unique slug for a starship
   * @param name - The starship name
   * @param ownerId - The owner's user ID
   * @returns Promise resolving to a unique slug
   */
  generateUniqueSlug(name: string, ownerId: string): Promise<string>;
  
  /**
   * Check if a slug is available for a specific owner
   * @param slug - The slug to check
   * @param ownerId - The owner's user ID
   * @param excludeId - Optional starship ID to exclude from the check
   * @returns Promise resolving to true if available
   */
  isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean>;
  
  /**
   * Create a slug from a starship name
   * @param name - The starship name
   * @returns A URL-friendly slug
   */
  createSlugFromName(name: string): string;
  
  /**
   * Find starships by class
   * @param starshipClass - The starship class
   * @returns Promise resolving to array of starships
   */
  findByClass(starshipClass: StarshipClass): Promise<Starship[]>;
  
  /**
   * Find starships by status
   * @param status - The starship status
   * @returns Promise resolving to array of starships
   */
  findByStatus(status: StarshipStatus): Promise<Starship[]>;
  
  /**
   * Find starships with pending payments
   * @returns Promise resolving to array of starships with pending payments
   */
  findWithPendingPayments(): Promise<Starship[]>;
  
  /**
   * Update starship billing information
   * @param id - The starship ID
   * @param billingInfo - Billing information to update
   * @returns Promise resolving to the updated starship or null if not found
   */
  updateBillingInfo(
    id: string,
    billingInfo: {
      subscriptionId?: string;
      plan?: StarshipClass;
      billingPeriod?: BillingPeriod;
      stripeCustomerId?: string;
    }
  ): Promise<Starship | null>;
  
  /**
   * Upgrade starship class and adjust capacity limits
   * @param id - The starship ID
   * @param newClass - The new starship class
   * @returns Promise resolving to the updated starship or null if not found
   */
  upgradeClass(id: string, newClass: StarshipClass): Promise<Starship | null>;
  
  /**
   * Find starships that are over capacity (more deployed agents than max)
   * @returns Promise resolving to array of over-capacity starships
   */
  findOverCapacity(): Promise<Starship[]>;
}

/**
 * Starship Domain Events
 */

export interface StarshipCreatedEvent {
  eventType: 'StarshipCreated';
  aggregateId: string;
  starship: Starship;
  occurredAt: string;
  version: number;
}

export interface StarshipUpdatedEvent {
  eventType: 'StarshipUpdated';
  aggregateId: string;
  starshipId: string;
  changes: Partial<Starship>;
  occurredAt: string;
  version: number;
}

export interface StarshipClassUpgradedEvent {
  eventType: 'StarshipClassUpgraded';
  aggregateId: string;
  starshipId: string;
  oldClass: StarshipClass;
  newClass: StarshipClass;
  occurredAt: string;
  version: number;
}

export interface StarshipAgentDeployedEvent {
  eventType: 'AgentDeployed';
  aggregateId: string;
  starshipId: string;
  agentId: string;
  occurredAt: string;
  version: number;
}

export interface StarshipAgentRemovedEvent {
  eventType: 'AgentRemoved';
  aggregateId: string;
  starshipId: string;
  agentId: string;
  occurredAt: string;
  version: number;
}

/**
 * Starship Aggregate Business Rules
 */

export const StarshipBusinessRules = {
  /**
   * Validates that a starship can deploy additional agents
   */
  canDeployAgent: (starship: Starship, currentAgentCount: number): boolean => {
    return currentAgentCount < starship.maxAgents;
  },

  /**
   * Validates that a starship can handle additional active missions
   */
  canStartMission: (starship: Starship, currentMissionCount: number): boolean => {
    return currentMissionCount < starship.maxActiveMissions;
  },

  /**
   * Validates that a starship can be upgraded to a new class
   */
  canUpgradeClass: (currentClass: StarshipClass, targetClass: StarshipClass): boolean => {
    const classOrder = ['scout', 'cruiser', 'draught'];
    const currentIndex = classOrder.indexOf(currentClass);
    const targetIndex = classOrder.indexOf(targetClass);
    return targetIndex > currentIndex;
  },

  /**
   * Validates that a starship is in a valid state for operations
   */
  isOperational: (starship: Starship): boolean => {
    return starship.status === 'active';
  },

  /**
   * Validates billing requirements for a starship
   */
  validateBillingState: (starship: Starship): boolean => {
    if (starship.class === 'scout') {
      // Scout class might be free tier
      return true;
    }
    return !!(starship.subscriptionId && starship.plan && starship.billingPeriod);
  }
};

/**
 * Type exports for external use
 */
export type CreateStarshipInput = z.infer<typeof CreateStarshipSchema>;
export type UpdateStarshipInput = z.infer<typeof UpdateStarshipSchema>;
export type StarshipValidationResult = { success: true; data: Starship } | { success: false; error: z.ZodError };

/**
 * Starship Utility Functions
 */
export const StarshipUtils = {
  /**
   * Validates a Starship entity against the schema
   */
  validate: (starship: any): StarshipValidationResult => {
    return StarshipSchema.safeParse(starship);
  },

  /**
   * Creates a new Starship entity with validation and auto-generated fields
   */
  create: (input: CreateStarshipInput): Starship => {
    const capacity = STARSHIP_CAPACITY_LIMITS[input.class];
    const slug = input.slug || StarshipUtils.createSlugFromName(input.name);
    
    const starship: Starship = {
      ...input,
      id: crypto.randomUUID(),
      slug,
      maxAgents: capacity.maxAgents,
      maxActiveMissions: capacity.maxActiveMissions,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _aggregateRoot: true,
    };
    
    const validation = StarshipSchema.safeParse(starship);
    if (!validation.success) {
      throw new Error(`Invalid starship data: ${validation.error.message}`);
    }
    
    return validation.data;
  },

  /**
   * Creates a URL-friendly slug from a starship name
   */
  createSlugFromName: (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 100);
  },

  /**
   * Gets the capacity limits for a starship class
   */
  getCapacityLimits: (starshipClass: StarshipClass) => {
    return STARSHIP_CAPACITY_LIMITS[starshipClass as keyof typeof STARSHIP_CAPACITY_LIMITS];
  },

  /**
   * Calculates the cost difference for upgrading between classes
   */
  calculateUpgradeCost: (fromClass: StarshipClass, toClass: StarshipClass): number => {
    const costs: Record<StarshipClass, number> = { scout: 0, cruiser: 29, draught: 99 }; // Example monthly costs
    return costs[toClass] - costs[fromClass];
  }
};