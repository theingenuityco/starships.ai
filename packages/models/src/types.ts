// Import Agent from protocol to avoid circular dependency
import { Agent } from '@starships/protocol';


// Re-export Agent
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


// Repository interfaces
export interface Repository<T> {
  findAll(): Promise<T[]>;
  findById(id: string): Promise<T | null>;
  create(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T | null>;
  delete(id: string): Promise<boolean>;
}

export interface AgentRepository extends Repository<Agent> {
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


export interface LLMRepository extends Repository<LLM> {
  findByProvider(provider: string): Promise<LLM[]>;
}



// NEW: Aether Core Repository Interfaces
export interface StarshipRepository {
  findAll(): Promise<Starship[]>;
  findById(id: string): Promise<Starship | null>;
  findBySlug(slug: string, ownerId: string): Promise<Starship | null>;
  create(
    entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'maxActiveMissions' | 'updatedAt' | 'slug'> & {
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
  getVisionByStarshipId(starshipId: string): Promise<{ vision: string } | null>;
  updateVision(starshipId: string, newVision: string): Promise<Vision | null>;
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


/**
 * Re-export error classes from the dedicated errors module
 */
export { ValidationError, ConstraintViolationError, NotFoundError } from './errors';

