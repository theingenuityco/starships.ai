/**
 * Starship Collection Types
 *
 * Clean starship type definitions for protocol contract.
 */

// ============================================================================
// STARSHIP TYPES
// ============================================================================

/**
 * Starship class definitions
 */
export type StarshipClass = 'scout' | 'cruiser' | 'draught';

/**
 * Starship status definitions
 */
export type StarshipStatus = 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';

/**
 * Billing period options
 */
export type BillingPeriod = 'monthly' | 'yearly';

// ============================================================================
// CORE STARSHIP ENTITY
// ============================================================================

/**
 * Core starship entity
 */
export interface StarshipModel {
  id: string;
  slug: string;
  ownerId: string; // Foreign key to User
  class: StarshipClass;
  name: string;
  maxAgents: number; // Based on class: Scout=3, Cruiser=5, Draught=10
  maxActiveMissions: number; // Based on class: Scout=3, Cruiser=6, Draught=10
  status: StarshipStatus;
  createdAt: string;
  updatedAt: string;
  
  // Stripe integration
  subscriptionId?: string;     // Stripe subscription ID
  plan?: StarshipClass;  // Separate from class for billing
  billingPeriod?: BillingPeriod;  // Billing period
  stripeCustomerId?: string;  // Links to Stripe Customer for portal access
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to update a starship
 */
export interface UpdateStarshipRequest {
  name?: string;
  slug?: string; // Optional - will be auto-generated from name if not provided
  status?: StarshipStatus;
  class?: StarshipClass;
}

/**
 * Request to update starship status
 */
export interface UpdateStarshipStatusRequest {
  status: StarshipStatus;
}

/**
 * Starship response structure
 */
export interface StarshipResponse {
  starship: StarshipModel;
}

/**
 * Starship agents response
 */
export interface StarshipAgentsResponse {
  starshipId: string;
  starshipName: string;
  starshipClass: StarshipClass;
  maxAgents: number;
  deployedAgents: Array<{
    // Core AgentNodeParameters fields
    name: string;
    description?: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    memory?: Record<string, unknown>; // AgentMemoryConfig - keeping flexible for now
    blueprint?: Record<string, unknown>; // BaseBlueprint - keeping flexible for now
    
    // Database-specific fields
    id: string;
    createdAt: string;
    updatedAt: string;
    version: string;
    category: 'general' | 'coding' | 'creative' | 'analysis' | 'support';
    usageCount: number;
    templateId?: string;
    starshipId: string;
  }>;
  availableSlots: number;
  deployedCount: number;
}

/**
 * Starship list response
 */
export interface StarshipListResponse {
  starships: StarshipModel[];
}

/**
 * Detailed starship response with agents
 */
export interface StarshipDetailsResponse extends StarshipResponse {
  agents: StarshipAgentsResponse['deployedAgents'];
  availableSlots: number;
}

/**
 * Request to create a new starship
 */
export interface CreateStarshipRequest {
  name: string;
  class: StarshipClass;
  slug?: string; // Optional - will be auto-generated if not provided
}

// ============================================================================
// GENERIC API TYPES
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T = unknown> {
  success?: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Generic API error structure
 */
export interface ApiError {
  error: string;
  code?: number;
  details?: unknown;
}