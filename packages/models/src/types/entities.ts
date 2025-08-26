// Import Agent from protocol - clean separation of concerns
import { Agent } from '@starships/protocol';

// Re-export Agent for convenience
export type { Agent };

export interface LLM {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic';
  maxTokens?: number;
  temperature?: number;
  
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
  // Stripe integration
  stripeCustomerId?: string;  // Stripe customer ID
}

// NEW: Aether Core Entities
export interface Starship {
  id: string;
  slug: string;
  ownerId: string; // Foreign key to User
  class: 'scout' | 'cruiser' | 'draught';  // ADD: 'draught' plan
  name: string;
  maxAgents: number; // Based on class: Scout=3, Cruiser=5, Draught=10
  maxActiveMissions: number; // Based on class: Scout=3, Cruiser=6, Draught=10
  status: 'active' | 'inactive' | 'restricted' | 'disabled' | 'pending_payment';  // ADD: billing status
  createdAt: string;
  updatedAt: string;
  // Stripe integration
  subscriptionId?: string;     // Stripe subscription ID
  plan?: 'scout' | 'cruiser' | 'draught';  // Separate from class for billing
  billingPeriod?: 'monthly' | 'yearly';  // Billing period
  stripeCustomerId?: string;  // Links to Stripe Customer for portal access
}

export interface Vision {
  id: string;
  starshipId: string; // Direct FK to Starship
  statement: string;
  confidence: number;
  refinementCount: number;
  lastRefined: string;
  isActive: boolean;
  
  // Vision Metrics
  clarityScore?: number;
  specificityScore?: number;
  actionabilityScore?: number;
  inspirationalScore?: number;
  overallQuality?: number;
  hasObjectives?: boolean;
  hasTimeframe?: boolean;
  hasMeasurables?: boolean;
  
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