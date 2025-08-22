/**
 * Aggregate Root Definitions and Boundary Specifications
 * 
 * This module defines aggregate boundaries, consistency rules, and aggregate root
 * specifications for each domain context. It provides utilities for aggregate
 * lifecycle management and cross-aggregate interaction patterns.
 * 
 * Based on Domain-Driven Design principles and the documented domain context maps.
 */

import { 
  AggregateRoot, 
  AggregateBoundary, 
  ConsistencyRule,
  DomainEvent 
} from '../types/shared';

// Import domain-specific types for aggregate definitions
import type { User } from '../types/user';
import type { Starship } from '../types/starship';
import type { Vision } from '../types/vision';

/**
 * Domain Context Enumeration
 * 
 * Defines the five bounded contexts from the domain context map.
 */
export enum DomainContext {
  USER_IDENTITY = 'USER_IDENTITY',
  STARSHIP_LIFECYCLE = 'STARSHIP_LIFECYCLE',
  AGENT_MARKETPLACE = 'AGENT_MARKETPLACE',
  CONNECTOR_MANAGEMENT = 'CONNECTOR_MANAGEMENT',
  VISION_STATEMENT = 'VISION_STATEMENT'
}

/**
 * Aggregate Type Enumeration
 * 
 * Defines all aggregate root types across domains.
 */
export enum AggregateType {
  USER = 'User',
  STARSHIP = 'Starship',
  VISION = 'Vision'
}

/**
 * Aggregate Root Registry
 * 
 * Central registry for all aggregate roots with their domain context mapping.
 */
export interface AggregateRootDefinition {
  readonly type: AggregateType;
  readonly domainContext: DomainContext;
  readonly description: string;
  readonly consistencyBoundary: string[];
  readonly eventTypes: string[];
  readonly invariants: string[];
}

/**
 * Aggregate Root Registry
 */
export const AggregateRegistry: Record<AggregateType, AggregateRootDefinition> = {
  [AggregateType.USER]: {
    type: AggregateType.USER,
    domainContext: DomainContext.USER_IDENTITY,
    description: 'User Identity aggregate managing authentication, profile, and billing integration',
    consistencyBoundary: [
      'User profile information',
      'Authentication credentials (Kinde integration)',
      'Billing information (Stripe integration)',
      'Account status and preferences'
    ],
    eventTypes: [
      'UserCreated',
      'UserUpdated',
      'UserStripeLinked',
      'UserKindeLinked',
      'UserDeactivated'
    ],
    invariants: [
      'User must have a unique username',
      'User email must be unique if provided',
      'Kinde ID must be unique if provided',
      'Stripe customer ID must be unique if provided'
    ]
  },

  [AggregateType.STARSHIP]: {
    type: AggregateType.STARSHIP,
    domainContext: DomainContext.STARSHIP_LIFECYCLE,
    description: 'Starship deployment platform managing capacity, agents, and billing',
    consistencyBoundary: [
      'Starship configuration and metadata',
      'Capacity limits and current utilization',
      'Agent deployments and relationships',
      'Billing and subscription state',
      'MCP connector instances'
    ],
    eventTypes: [
      'StarshipCreated',
      'StarshipUpdated',
      'StarshipClassUpgraded',
      'AgentDeployed',
      'AgentRemoved',
      'ConnectorInstanceAdded',
      'ConnectorInstanceRemoved'
    ],
    invariants: [
      'Starship slug must be unique per owner',
      'Number of deployed agents cannot exceed maxAgents',
      'Starship class determines capacity limits',
      'Active starships require valid billing (except scout)',
      'Capacity limits are immutable per class'
    ]
  },

  [AggregateType.VISION]: {
    type: AggregateType.VISION,
    domainContext: DomainContext.VISION_STATEMENT,
    description: 'Vision statement managing quality metrics and refinement lifecycle',
    consistencyBoundary: [
      'Vision statement content',
      'Quality metrics and scores',
      'Refinement history and count',
      'Component flags and analysis',
      'Confidence and assessment data'
    ],
    eventTypes: [
      'VisionCreated',
      'VisionUpdated',
      'VisionRefined',
      'VisionQualityAssessed',
      'VisionActivated',
      'VisionArchived'
    ],
    invariants: [
      'Only one active vision per starship',
      'Vision statement cannot be empty',
      'Confidence level must be between 0 and 1',
      'Quality scores must be between 0 and 1',
      'Overall quality should reflect component scores'
    ]
  }
};

/**
 * Entity Classifications
 * 
 * Classifies entities as aggregate roots, entities, or value objects.
 */
export enum EntityClassification {
  AGGREGATE_ROOT = 'AGGREGATE_ROOT',
  ENTITY = 'ENTITY',
  VALUE_OBJECT = 'VALUE_OBJECT'
}

/**
 * Entity Classification Registry
 */
export const EntityClassificationRegistry = {
  // Aggregate Roots
  User: EntityClassification.AGGREGATE_ROOT,
  Starship: EntityClassification.AGGREGATE_ROOT,
  Vision: EntityClassification.AGGREGATE_ROOT,

  // Entities (not aggregate roots)
  Agent: EntityClassification.ENTITY,
  AgentTemplate: EntityClassification.ENTITY,
  MCPServerOption: EntityClassification.ENTITY,
  MCPServerConnector: EntityClassification.ENTITY,
  ConnectorConfigTemplate: EntityClassification.ENTITY,
  ConnectorConfigHistory: EntityClassification.ENTITY,

  // Value Objects
  ConnectorInstanceConfig: EntityClassification.VALUE_OBJECT,
  TimeoutConfig: EntityClassification.VALUE_OBJECT,
  RetryConfig: EntityClassification.VALUE_OBJECT,
  LoggingConfig: EntityClassification.VALUE_OBJECT,
  ResourceConfig: EntityClassification.VALUE_OBJECT,
  HealthCheckConfig: EntityClassification.VALUE_OBJECT
};

/**
 * Cross-Aggregate Interaction Patterns
 * 
 * Defines how aggregates interact with each other while maintaining boundaries.
 */
export interface CrossAggregateInteraction {
  readonly sourceAggregate: AggregateType;
  readonly targetAggregate: AggregateType;
  readonly interactionType: 'COMMAND' | 'EVENT' | 'QUERY';
  readonly description: string;
  readonly constraints: string[];
}

/**
 * Cross-Aggregate Interaction Registry
 */
export const CrossAggregateInteractions: CrossAggregateInteraction[] = [
  {
    sourceAggregate: AggregateType.USER,
    targetAggregate: AggregateType.STARSHIP,
    interactionType: 'COMMAND',
    description: 'User creates and owns starships',
    constraints: [
      'User must exist before creating starship',
      'Ownership is established through relationship, not FK'
    ]
  },
  {
    sourceAggregate: AggregateType.STARSHIP,
    targetAggregate: AggregateType.VISION,
    interactionType: 'COMMAND',
    description: 'Starship manages its vision statements',
    constraints: [
      'Each starship can have multiple visions but only one active',
      'Vision lifecycle is managed within starship boundary'
    ]
  },
  {
    sourceAggregate: AggregateType.VISION,
    targetAggregate: AggregateType.STARSHIP,
    interactionType: 'EVENT',
    description: 'Vision changes notify starship of updates',
    constraints: [
      'Vision events are published for starship consumption',
      'Starship maintains consistency of active vision'
    ]
  }
];

/**
 * Aggregate Consistency Rules
 * 
 * Business rules that must be maintained within aggregate boundaries.
 */
export interface AggregateConsistencyRule<T> {
  readonly name: string;
  readonly description: string;
  readonly aggregateType: AggregateType;
  readonly validate: (aggregate: T, context?: any) => boolean | string;
  readonly severity: 'ERROR' | 'WARNING';
}

/**
 * User Aggregate Consistency Rules
 */
const UserConsistencyRules: AggregateConsistencyRule<User>[] = [
  {
    name: 'UniqueUsername',
    description: 'Username must be unique across all users',
    aggregateType: AggregateType.USER,
    validate: (user: User) => {
      // This would be validated by the repository layer
      return !!user.username && user.username.length >= 3;
    },
    severity: 'ERROR'
  },
  {
    name: 'ValidEmail',
    description: 'Email must be valid format if provided',
    aggregateType: AggregateType.USER,
    validate: (user: User) => {
      if (!user.email) return true;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email);
    },
    severity: 'ERROR'
  },
  {
    name: 'StripeConsistency',
    description: 'Stripe customer ID must be valid Stripe format',
    aggregateType: AggregateType.USER,
    validate: (user: User) => {
      if (!user.stripeCustomerId) return true;
      return user.stripeCustomerId.startsWith('cus_');
    },
    severity: 'ERROR'
  }
];

/**
 * Starship Aggregate Consistency Rules
 */
const StarshipConsistencyRules: AggregateConsistencyRule<Starship>[] = [
  {
    name: 'CapacityLimits',
    description: 'Starship capacity must match class specifications',
    aggregateType: AggregateType.STARSHIP,
    validate: (starship: Starship) => {
      const expectedLimits: Record<string, { maxAgents: number; maxActiveMissions: number }> = {
        scout: { maxAgents: 3, maxActiveMissions: 3 },
        cruiser: { maxAgents: 5, maxActiveMissions: 6 },
        draught: { maxAgents: 10, maxActiveMissions: 10 }
      };
      const expected = expectedLimits[starship.class];
      return starship.maxAgents === expected.maxAgents && 
             starship.maxActiveMissions === expected.maxActiveMissions;
    },
    severity: 'ERROR'
  },
  {
    name: 'UniqueSlugPerOwner',
    description: 'Starship slug must be unique per owner',
    aggregateType: AggregateType.STARSHIP,
    validate: (starship: Starship) => {
      // This would be validated by the repository layer
      return !!starship.slug && starship.slug.length > 0;
    },
    severity: 'ERROR'
  },
  {
    name: 'BillingConsistency',
    description: 'Non-scout starships require valid billing configuration',
    aggregateType: AggregateType.STARSHIP,
    validate: (starship: Starship) => {
      if (starship.class === 'scout') return true;
      return !!(starship.subscriptionId && starship.plan && starship.billingPeriod);
    },
    severity: 'WARNING'
  }
];

/**
 * Vision Aggregate Consistency Rules
 */
const VisionConsistencyRules: AggregateConsistencyRule<Vision>[] = [
  {
    name: 'NonEmptyStatement',
    description: 'Vision statement cannot be empty',
    aggregateType: AggregateType.VISION,
    validate: (vision: Vision) => {
      return vision.statement && vision.statement.trim().length > 0;
    },
    severity: 'ERROR'
  },
  {
    name: 'ValidConfidenceRange',
    description: 'Confidence must be between 0 and 1',
    aggregateType: AggregateType.VISION,
    validate: (vision: Vision) => {
      return vision.confidence >= 0 && vision.confidence <= 1;
    },
    severity: 'ERROR'
  },
  {
    name: 'QualityScoreConsistency',
    description: 'Overall quality should reflect component scores',
    aggregateType: AggregateType.VISION,
    validate: (vision: Vision) => {
      if (!vision.overallQuality) return true;
      
      const componentScores = [
        vision.clarityScore,
        vision.specificityScore,
        vision.actionabilityScore,
        vision.inspirationalScore
      ].filter(score => score !== undefined) as number[];
      
      if (componentScores.length === 0) return true;
      
      const expectedOverall = componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length;
      const tolerance = 0.15;
      
      return Math.abs(vision.overallQuality - expectedOverall) <= tolerance;
    },
    severity: 'WARNING'
  }
];

/**
 * Aggregate Root Utilities
 */
export class AggregateRootUtils {
  /**
   * Validate an aggregate root against its consistency rules
   */
  static validateAggregate<T extends AggregateRoot>(
    aggregate: T,
    aggregateType: AggregateType,
    context?: any
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    let rules: AggregateConsistencyRule<any>[] = [];
    
    switch (aggregateType) {
      case AggregateType.USER:
        rules = UserConsistencyRules;
        break;
      case AggregateType.STARSHIP:
        rules = StarshipConsistencyRules;
        break;
      case AggregateType.VISION:
        rules = VisionConsistencyRules;
        break;
    }
    
    for (const rule of rules) {
      const result = rule.validate(aggregate, context);
      if (result !== true) {
        const message = typeof result === 'string' ? result : rule.description;
        if (rule.severity === 'ERROR') {
          errors.push(`${rule.name}: ${message}`);
        } else {
          warnings.push(`${rule.name}: ${message}`);
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if an entity is an aggregate root
   */
  static isAggregateRoot(entity: any): entity is AggregateRoot {
    return entity && typeof entity === 'object' && entity._aggregateRoot === true;
  }

  /**
   * Get aggregate root definition
   */
  static getAggregateDefinition(aggregateType: AggregateType): AggregateRootDefinition {
    return AggregateRegistry[aggregateType];
  }

  /**
   * Get domain context for an aggregate type
   */
  static getDomainContext(aggregateType: AggregateType): DomainContext {
    return AggregateRegistry[aggregateType].domainContext;
  }

  /**
   * Check if two aggregates are in the same bounded context
   */
  static areInSameBoundedContext(type1: AggregateType, type2: AggregateType): boolean {
    return this.getDomainContext(type1) === this.getDomainContext(type2);
  }

  /**
   * Get allowed cross-aggregate interactions for a source aggregate
   */
  static getAllowedInteractions(sourceAggregate: AggregateType): CrossAggregateInteraction[] {
    return CrossAggregateInteractions.filter(
      interaction => interaction.sourceAggregate === sourceAggregate
    );
  }

  /**
   * Create aggregate boundary specification
   */
  static createAggregateBoundary(
    aggregateType: AggregateType,
    aggregateId: string,
    version: number = 1
  ): AggregateBoundary {
    return {
      aggregateType: aggregateType.toString(),
      aggregateId,
      version
    };
  }
}

/**
 * Aggregate Event Management
 */
export class AggregateEventManager {
  private static events: Map<string, DomainEvent[]> = new Map();

  /**
   * Register a domain event for an aggregate
   */
  static registerEvent(aggregateId: string, event: DomainEvent): void {
    if (!this.events.has(aggregateId)) {
      this.events.set(aggregateId, []);
    }
    this.events.get(aggregateId)!.push(event);
  }

  /**
   * Get events for an aggregate
   */
  static getEvents(aggregateId: string): DomainEvent[] {
    return this.events.get(aggregateId) || [];
  }

  /**
   * Clear events for an aggregate (typically after publishing)
   */
  static clearEvents(aggregateId: string): void {
    this.events.delete(aggregateId);
  }

  /**
   * Get all pending events
   */
  static getAllEvents(): Record<string, DomainEvent[]> {
    return Object.fromEntries(this.events);
  }

  /**
   * Clear all events
   */
  static clearAllEvents(): void {
    this.events.clear();
  }
}

/**
 * Aggregate Lifecycle Management
 */
export interface AggregateLifecycleState {
  readonly stage: 'CREATED' | 'ACTIVE' | 'MODIFIED' | 'ARCHIVED' | 'DELETED';
  readonly version: number;
  readonly lastModified: string;
  readonly modifiedBy?: string;
}

/**
 * Aggregate Repository Contract
 * 
 * Defines the contract that aggregate repositories should implement.
 */
export interface AggregateRepository<T extends AggregateRoot> {
  /**
   * Save an aggregate root and its events
   */
  save(aggregate: T): Promise<T>;

  /**
   * Load an aggregate root by ID
   */
  load(id: string): Promise<T | null>;

  /**
   * Delete an aggregate root
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get aggregate lifecycle state
   */
  getLifecycleState(id: string): Promise<AggregateLifecycleState | null>;

  /**
   * Validate aggregate before operations
   */
  validateAggregate(aggregate: T): Promise<{ isValid: boolean; errors: string[]; warnings: string[] }>;
}

/**
 * Export consistency rules for each domain
 */
export {
  UserConsistencyRules,
  StarshipConsistencyRules,
  VisionConsistencyRules
};