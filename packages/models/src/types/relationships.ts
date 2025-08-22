import { z } from 'zod';
import { DateTimeSchema } from './shared';

/**
 * Relationship Type Definitions (Cross-Domain)
 * 
 * Comprehensive relationship type definitions for all graph relationships
 * in the canonical schema. These relationships represent the connections
 * between entities across all domain contexts.
 * 
 * This is the authoritative source for all graph relationship definitions,
 * replacing scattered relationship types from the monolithic file.
 */

/**
 * Base Relationship Interface
 * 
 * Common structure for all Neo4j relationships.
 */
export interface BaseRelationship {
  type: string;
  properties?: Record<string, any>;
}

/**
 * User Identity Context Relationships
 */

/**
 * User owns Starship relationship
 * Pattern: (:User)-[:OWNS]->(:Starship)
 */
export interface OwnsRelationship extends BaseRelationship {
  type: 'OWNS';
  properties?: {
    /** Timestamp when relationship was created */
    createdAt?: string;
    /** Timestamp when ownership was established */
    ownedSince?: string;
    /** Ownership type (primary, shared, etc.) */
    ownershipType?: 'primary' | 'shared' | 'inherited';
    /** Whether this is the active ownership */
    isActive?: boolean;
  };
}

/**
 * User authors Agent relationship
 * Pattern: (:User)-[:AUTHORED]->(:Agent)
 */
export interface AuthorsRelationship extends BaseRelationship {
  type: 'AUTHORED';
  properties?: {
    /** Timestamp when the agent was created */
    createdAt?: string;
    /** Version of the agent when authored */
    version?: string;
    /** Whether the author is still maintaining the agent */
    isMaintainer?: boolean;
  };
}

/**
 * User authored Agent Template relationship
 * Pattern: (:User)-[:AUTHORED]->(:AgentTemplate)
 */
export interface AuthoredTemplateRelationship extends BaseRelationship {
  type: 'AUTHORED';
  properties?: {
    /** Timestamp when the template was created */
    createdAt?: string;
    /** Whether the author is still maintaining the template */
    isMaintainer?: boolean;
    /** Public/private status at creation */
    initialVisibility?: 'public' | 'private';
  };
}

/**
 * User authored Connector Config Template relationship
 * Pattern: (:User)-[:AUTHORED]->(:ConnectorConfigTemplate)
 */
export interface AuthoredConfigTemplateRelationship extends BaseRelationship {
  type: 'AUTHORED';
  properties?: {
    /** Timestamp when the template was created */
    createdAt?: string;
    /** Template category at creation */
    category?: string;
    /** Whether the author is still maintaining the template */
    isMaintainer?: boolean;
  };
}

/**
 * User changed configuration relationship
 * Pattern: (:User)-[:CHANGED]->(:ConnectorConfigHistory)
 */
export interface ChangedConfigRelationship extends BaseRelationship {
  type: 'CHANGED';
  properties?: {
    /** Timestamp of the change */
    changedAt?: string;
    /** Type of change made */
    changeType?: 'created' | 'updated' | 'deleted' | 'reverted';
    /** IP address or source of change */
    changeSource?: string;
  };
}

/**
 * Starship Lifecycle Context Relationships
 */

/**
 * Agent deployed on Starship relationship
 * Pattern: (:Agent)-[:DEPLOYED_ON]->(:Starship)
 */
export interface DeployedOnRelationship extends BaseRelationship {
  type: 'DEPLOYED_ON';
  properties?: {
    /** Timestamp when relationship was created */
    createdAt?: string;
    /** Timestamp when deployment occurred */
    deployedAt?: string;
    /** Whether the deployment is currently active */
    isActive?: boolean;
    /** Deployment configuration or version */
    deploymentConfig?: string;
    /** Resource allocation for this deployment */
    resourceAllocation?: string;
  };
}

/**
 * Starship has Vision relationship
 * Pattern: (:Starship)-[:HAS_VISION]->(:Vision)
 */
export interface HasVisionRelationship extends BaseRelationship {
  type: 'HAS_VISION';
  properties?: {
    /** Timestamp when vision was associated */
    assignedAt?: string;
    /** Whether this is the current active vision */
    isActive?: boolean;
    /** Vision version or revision number */
    visionVersion?: number;
  };
}

/**
 * Starship has Connector Instance relationship
 * Pattern: (:Starship)-[:HAS_CONNECTOR_INSTANCE]->(:MCPServerConnector)
 */
export interface HasConnectorInstanceRelationship extends BaseRelationship {
  type: 'HAS_CONNECTOR_INSTANCE';
  properties?: {
    /** Timestamp when the connector instance was created on the starship */
    createdAt?: string;
    /** Installation source or method */
    installationSource?: 'marketplace' | 'template' | 'custom';
    /** Priority or order of connector instances */
    priority?: number;
  };
}

/**
 * Agent Marketplace Context Relationships
 */

/**
 * Agent created from Template relationship
 * Pattern: (:Agent)-[:CREATED_FROM]->(:AgentTemplate)
 */
export interface CreatedFromTemplateRelationship extends BaseRelationship {
  type: 'CREATED_FROM';
  properties?: {
    /** Timestamp when agent was created from template */
    createdAt?: string;
    /** Template version used for creation */
    templateVersion?: string;
    /** Customizations applied during creation */
    customizations?: string;
  };
}

/**
 * Agent Template based on Agent relationship
 * Pattern: (:AgentTemplate)-[:BASED_ON]->(:Agent)
 */
export interface BasedOnRelationship extends BaseRelationship {
  type: 'BASED_ON';
  properties?: {
    /** Timestamp when template was created from agent */
    derivedAt?: string;
    /** Agent version used as base */
    baseAgentVersion?: string;
    /** What aspects were templated */
    templatedAspects?: string[];
  };
}

/**
 * Agent belongs to Category relationship
 * Pattern: (:Agent)-[:BELONGS_TO_CATEGORY]->(:Category)
 */
export interface BelongsToCategoryRelationship extends BaseRelationship {
  type: 'BELONGS_TO_CATEGORY';
  properties?: {
    /** Timestamp when categorized */
    categorizedAt?: string;
    /** Confidence in categorization (0-1) */
    confidence?: number;
    /** Whether categorization was automatic or manual */
    categorizationType?: 'automatic' | 'manual';
  };
}

/**
 * Agent has Tag relationship
 * Pattern: (:Agent)-[:HAS_TAG]->(:Tag)
 */
export interface HasTagRelationship extends BaseRelationship {
  type: 'HAS_TAG';
  properties?: {
    /** Timestamp when tag was applied */
    taggedAt?: string;
    /** Relevance score of tag to agent (0-1) */
    relevance?: number;
    /** Whether tag was auto-generated or manual */
    tagSource?: 'automatic' | 'manual' | 'community';
  };
}

/**
 * User rates Agent relationship
 * Pattern: (:User)-[:RATED]->(:Agent)
 */
export interface RatedRelationship extends BaseRelationship {
  type: 'RATED';
  properties?: {
    /** Rating value (1-5) */
    rating: number;
    /** Timestamp when rating was given */
    ratedAt?: string;
    /** Optional review text */
    review?: string;
    /** Whether rating is verified (user actually used agent) */
    isVerified?: boolean;
  };
}

/**
 * Connector Management Context Relationships
 */

/**
 * MCP Server Connector created from MCP Server Option relationship
 * Pattern: (:MCPServerConnector)-[:CREATED_FROM]->(:MCPServerOption)
 */
export interface CreatedFromRelationship extends BaseRelationship {
  type: 'CREATED_FROM';
  properties?: {
    /** Timestamp when the connector instance was created from the template */
    createdAt?: string;
    /** Template version used for creation */
    templateVersion?: string;
    /** Custom configuration applied during creation */
    creationConfig?: string;
  };
}

/**
 * MCP Server Connector uses Config Template relationship
 * Pattern: (:MCPServerConnector)-[:USES_CONFIG]->(:ConnectorConfigTemplate)
 */
export interface UsesConfigRelationship extends BaseRelationship {
  type: 'USES_CONFIG';
  properties?: {
    /** Timestamp when config template was applied */
    appliedAt?: string;
    /** Configuration overrides applied */
    configOverrides?: string;
    /** Whether using latest version of template */
    isLatestVersion?: boolean;
  };
}

/**
 * Configuration History belongs to Connector relationship
 * Pattern: (:ConnectorConfigHistory)-[:BELONGS_TO]->(:MCPServerConnector)
 */
export interface BelongsToConnectorRelationship extends BaseRelationship {
  type: 'BELONGS_TO';
  properties?: {
    /** Sequence number in change history */
    sequenceNumber?: number;
    /** Whether this is the current active configuration */
    isCurrent?: boolean;
    /** Configuration diff or change summary */
    changeDiff?: string;
  };
}

/**
 * Vision Statement Context Relationships
 */

/**
 * Vision belongs to Starship relationship
 * Pattern: (:Vision)-[:BELONGS_TO]->(:Starship)
 */
export interface BelongsToStarshipRelationship extends BaseRelationship {
  type: 'BELONGS_TO';
  properties?: {
    /** Timestamp when vision was created for starship */
    createdAt?: string;
    /** Vision lifecycle stage */
    lifecycleStage?: 'draft' | 'active' | 'archived' | 'deprecated';
    /** Priority or importance level */
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Vision refined from previous Vision relationship
 * Pattern: (:Vision)-[:REFINED_FROM]->(:Vision)
 */
export interface RefinedFromRelationship extends BaseRelationship {
  type: 'REFINED_FROM';
  properties?: {
    /** Timestamp when refinement occurred */
    refinedAt?: string;
    /** Type of refinement made */
    refinementType?: 'clarity' | 'scope' | 'timeline' | 'metrics' | 'comprehensive';
    /** Quality improvement achieved */
    qualityImprovement?: number;
    /** Refinement notes or rationale */
    refinementNotes?: string;
  };
}

/**
 * Legacy Relationships (deprecated but maintained for transition)
 */

/**
 * @deprecated Use specific relationship types instead
 * Legacy active in relationship for backward compatibility
 * Pattern: (:User)-[:ACTIVE_IN]->(:Channel)
 */
export interface ActiveInRelationship extends BaseRelationship {
  type: 'ACTIVE_IN';
  properties?: {
    /** Timestamp when user became active in channel */
    joinedAt?: string;
    /** User role in the channel */
    role?: string;
    /** Whether user is currently active */
    isCurrentlyActive?: boolean;
  };
}

/**
 * @deprecated Use graph traversals instead of FK relationships
 * Legacy has connector relationship
 * Pattern: (:Starship)-[:HAS_CONNECTOR]->(:MCPServerOption)
 */
export interface HasConnectorRelationship extends BaseRelationship {
  type: 'HAS_CONNECTOR';
  properties?: {
    /** Timestamp when connector was added */
    connectedAt?: string;
    /** Whether connection is active */
    isActive?: boolean;
    /** Connection configuration */
    connectionConfig?: string;
  };
}

/**
 * Cross-Domain Interaction Relationships
 */

/**
 * User interacts with Agent relationship
 * Pattern: (:User)-[:INTERACTED_WITH]->(:Agent)
 */
export interface InteractedWithRelationship extends BaseRelationship {
  type: 'INTERACTED_WITH';
  properties?: {
    /** Timestamp of last interaction */
    lastInteraction?: string;
    /** Total number of interactions */
    interactionCount?: number;
    /** Total time spent in interactions (minutes) */
    totalInteractionTime?: number;
    /** Quality of interactions (user feedback) */
    interactionQuality?: number;
  };
}

/**
 * Agent uses MCP Server Connector relationship
 * Pattern: (:Agent)-[:USES_CONNECTOR]->(:MCPServerConnector)
 */
export interface UsesConnectorRelationship extends BaseRelationship {
  type: 'USES_CONNECTOR';
  properties?: {
    /** Timestamp when agent started using connector */
    startedUsing?: string;
    /** Frequency of usage */
    usageFrequency?: 'low' | 'medium' | 'high';
    /** Success rate of connector usage */
    successRate?: number;
    /** Last successful usage timestamp */
    lastSuccessfulUse?: string;
  };
}

/**
 * Agent contributes to Vision relationship
 * Pattern: (:Agent)-[:CONTRIBUTES_TO]->(:Vision)
 */
export interface ContributesToRelationship extends BaseRelationship {
  type: 'CONTRIBUTES_TO';
  properties?: {
    /** How the agent contributes to the vision */
    contributionType?: 'execution' | 'analysis' | 'monitoring' | 'reporting';
    /** Timestamp when contribution relationship was established */
    establishedAt?: string;
    /** Effectiveness of contribution (0-1) */
    contributionEffectiveness?: number;
  };
}

/**
 * Validation Schemas for Relationships
 */

export const OwnsRelationshipSchema = z.object({
  type: z.literal('OWNS'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    ownedSince: DateTimeSchema.optional(),
    ownershipType: z.enum(['primary', 'shared', 'inherited']).optional(),
    isActive: z.boolean().optional(),
  }).optional()
}).strict();

export const DeployedOnRelationshipSchema = z.object({
  type: z.literal('DEPLOYED_ON'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    deployedAt: DateTimeSchema.optional(),
    isActive: z.boolean().optional(),
    deploymentConfig: z.string().optional(),
    resourceAllocation: z.string().optional(),
  }).optional()
}).strict();

export const CreatedFromRelationshipSchema = z.object({
  type: z.literal('CREATED_FROM'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    templateVersion: z.string().optional(),
    creationConfig: z.string().optional(),
  }).optional()
}).strict();

export const RatedRelationshipSchema = z.object({
  type: z.literal('RATED'),
  properties: z.object({
    rating: z.number().min(1).max(5),
    ratedAt: DateTimeSchema.optional(),
    review: z.string().optional(),
    isVerified: z.boolean().optional(),
  }).optional()
}).strict();

export const HasVisionRelationshipSchema = z.object({
  type: z.literal('HAS_VISION'),
  properties: z.object({
    assignedAt: DateTimeSchema.optional(),
    isActive: z.boolean().optional(),
    visionVersion: z.number().optional(),
  }).optional()
}).strict();

export const HasConnectorInstanceRelationshipSchema = z.object({
  type: z.literal('HAS_CONNECTOR_INSTANCE'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    installationSource: z.enum(['marketplace', 'template', 'custom']).optional(),
    priority: z.number().optional(),
  }).optional()
}).strict();

export const CreatedFromTemplateRelationshipSchema = z.object({
  type: z.literal('CREATED_FROM'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    templateVersion: z.string().optional(),
    customizations: z.string().optional(),
  }).optional()
}).strict();

export const BelongsToStarshipRelationshipSchema = z.object({
  type: z.literal('BELONGS_TO'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    lifecycleStage: z.enum(['draft', 'active', 'archived', 'deprecated']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }).optional()
}).strict();

export const RefinedFromRelationshipSchema = z.object({
  type: z.literal('REFINED_FROM'),
  properties: z.object({
    refinedAt: DateTimeSchema.optional(),
    refinementType: z.enum(['clarity', 'scope', 'timeline', 'metrics', 'comprehensive']).optional(),
    qualityImprovement: z.number().optional(),
    refinementNotes: z.string().optional(),
  }).optional()
}).strict();

export const AuthorsRelationshipSchema = z.object({
  type: z.literal('AUTHORED'),
  properties: z.object({
    createdAt: DateTimeSchema.optional(),
    version: z.string().optional(),
    isMaintainer: z.boolean().optional(),
  }).optional()
}).strict();

export const UsesConfigRelationshipSchema = z.object({
  type: z.literal('USES_CONFIG'),
  properties: z.object({
    appliedAt: DateTimeSchema.optional(),
    configOverrides: z.string().optional(),
    isLatestVersion: z.boolean().optional(),
  }).optional()
}).strict();

export const BelongsToConnectorRelationshipSchema = z.object({
  type: z.literal('BELONGS_TO'),
  properties: z.object({
    sequenceNumber: z.number().optional(),
    isCurrent: z.boolean().optional(),
    changeDiff: z.string().optional(),
  }).optional()
}).strict();

/**
 * Relationship Utility Functions
 */
export const RelationshipUtils = {
  /**
   * Creates a timestamped relationship property
   */
  createTimestampedProperty: (additionalProps?: Record<string, any>) => ({
    createdAt: new Date().toISOString(),
    ...additionalProps,
  }),

  /**
   * Validates if a relationship type is deprecated
   */
  isDeprecatedRelationship: (relationshipType: string): boolean => {
    const deprecatedTypes = ['ACTIVE_IN', 'HAS_CONNECTOR'];
    return deprecatedTypes.includes(relationshipType);
  },

  /**
   * Gets the inverse relationship type for bidirectional relationships
   */
  getInverseRelationship: (relationshipType: string): string | null => {
    const inverses: Record<string, string> = {
      'OWNS': 'OWNED_BY',
      'AUTHORED': 'AUTHORED_BY',
      'DEPLOYED_ON': 'HAS_DEPLOYMENT',
      'CREATED_FROM': 'USED_TO_CREATE',
      'BELONGS_TO': 'HAS_MEMBER',
      'USES_CONFIG': 'PROVIDES_CONFIG_FOR',
      'REFINED_FROM': 'REFINED_TO',
    };
    return inverses[relationshipType] || null;
  },

  /**
   * Checks if a relationship supports properties
   */
  supportsProperties: (relationshipType: string): boolean => {
    const typesWithoutProperties = ['BELONGS_TO_CATEGORY', 'HAS_TAG'];
    return !typesWithoutProperties.includes(relationshipType);
  },

  /**
   * Creates a relationship object with proper validation
   */
  createRelationship: <T extends BaseRelationship>(
    type: T['type'],
    properties?: T['properties']
  ): T => {
    const relationship = {
      type,
      properties: properties || undefined,
    } as T;

    // Add timestamp if properties exist
    if (properties && RelationshipUtils.supportsProperties(type)) {
      relationship.properties = {
        ...properties,
        createdAt: properties.createdAt || new Date().toISOString(),
      };
    }

    return relationship;
  },
};

/**
 * Type Union for all relationships
 */
export type AllRelationships = 
  | OwnsRelationship
  | AuthorsRelationship
  | AuthoredTemplateRelationship
  | AuthoredConfigTemplateRelationship
  | ChangedConfigRelationship
  | DeployedOnRelationship
  | HasVisionRelationship
  | HasConnectorInstanceRelationship
  | CreatedFromTemplateRelationship
  | BasedOnRelationship
  | BelongsToCategoryRelationship
  | HasTagRelationship
  | RatedRelationship
  | CreatedFromRelationship
  | UsesConfigRelationship
  | BelongsToConnectorRelationship
  | BelongsToStarshipRelationship
  | RefinedFromRelationship
  | ActiveInRelationship
  | HasConnectorRelationship
  | InteractedWithRelationship
  | UsesConnectorRelationship
  | ContributesToRelationship;

/**
 * Relationship type mapping for type safety
 */
export type RelationshipTypeMap = {
  'OWNS': OwnsRelationship;
  'AUTHORED': AuthorsRelationship | AuthoredTemplateRelationship | AuthoredConfigTemplateRelationship;
  'CHANGED': ChangedConfigRelationship;
  'DEPLOYED_ON': DeployedOnRelationship;
  'HAS_VISION': HasVisionRelationship;
  'HAS_CONNECTOR_INSTANCE': HasConnectorInstanceRelationship;
  'CREATED_FROM': CreatedFromTemplateRelationship | CreatedFromRelationship;
  'BASED_ON': BasedOnRelationship;
  'BELONGS_TO_CATEGORY': BelongsToCategoryRelationship;
  'HAS_TAG': HasTagRelationship;
  'RATED': RatedRelationship;
  'USES_CONFIG': UsesConfigRelationship;
  'BELONGS_TO': BelongsToConnectorRelationship | BelongsToStarshipRelationship;
  'REFINED_FROM': RefinedFromRelationship;
  'ACTIVE_IN': ActiveInRelationship;
  'HAS_CONNECTOR': HasConnectorRelationship;
  'INTERACTED_WITH': InteractedWithRelationship;
  'USES_CONNECTOR': UsesConnectorRelationship;
  'CONTRIBUTES_TO': ContributesToRelationship;
};