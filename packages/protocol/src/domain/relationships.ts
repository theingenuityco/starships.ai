/**
 * Neo4j Relationship Types
 * 
 * Clean Neo4j relationship type definitions for protocol contract.
 */

// ============================================================================
// NEO4J RELATIONSHIP TYPES
// ============================================================================

/**
 * Base interface for Neo4j relationships
 */
export interface BaseRelationship<T extends string> {
  type: T;
  properties?: Record<string, unknown>;
}

/**
 * Active in relationship - connects users/agents to starships
 */
export interface ActiveInRelationship extends BaseRelationship<'ACTIVE_IN'> {
  properties?: {
    joinedAt?: string;
    role?: string;
  };
}

/**
 * Owns relationship - connects users to starships
 */
export interface OwnsRelationship extends BaseRelationship<'OWNS'> {
  properties?: {
    ownedSince?: string;
  };
}

/**
 * Deployed on relationship - connects agents to starships
 */
export interface DeployedOnRelationship extends BaseRelationship<'DEPLOYED_ON'> {
  properties?: {
    deployedAt?: string;
    isActive?: boolean;
  };
}

/**
 * Union type of all relationship types
 */
export type StarshipRelationship = 
  | ActiveInRelationship
  | OwnsRelationship
  | DeployedOnRelationship;

// ============================================================================
// RELATIONSHIP UTILITIES
// ============================================================================

/**
 * Type guard for Active In relationships
 */
export function isActiveInRelationship(relationship: StarshipRelationship): relationship is ActiveInRelationship {
  return relationship.type === 'ACTIVE_IN';
}

/**
 * Type guard for Owns relationships
 */
export function isOwnsRelationship(relationship: StarshipRelationship): relationship is OwnsRelationship {
  return relationship.type === 'OWNS';
}

/**
 * Type guard for Deployed On relationships
 */
export function isDeployedOnRelationship(relationship: StarshipRelationship): relationship is DeployedOnRelationship {
  return relationship.type === 'DEPLOYED_ON';
}