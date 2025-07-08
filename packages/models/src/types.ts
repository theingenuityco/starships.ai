// Import Agent from protocol to avoid circular dependency
import { Agent } from '@starships/protocol';

// Re-export Agent for backward compatibility
export { Agent };

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
  ownerId: string; // Foreign key to User
  class: 'scout' | 'cruiser';
  name: string;
  powerLevel: number;
  activeExpeditions: number;
  sibilInsights: number;
  maxAgents: number; // Based on class: Scout=3, Cruiser=6
  status: 'active' | 'docked' | 'maintenance';
  createdAt: string;
  updatedAt: string;
}

export interface Codex {
  id: string;
  starshipId: string; // Foreign key to Starship
  version: string; // Semantic versioning (v1.0, v1.1, etc.)
  timestamp: string;
  author: string; // user_id or agent_id who made the change
  changeSummary?: string;
  isActive: boolean; // Only one active version per starship
  createdAt: string;
}

export interface Vision {
  id: string;
  codexId: string;
  statement: string;
  confidence: number; // 0-100
  lastRefined: string;
  refinementCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Constraint {
  id: string;
  codexId: string;
  type: 'resource' | 'ethical' | 'technical' | 'business';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Concept {
  id: string;
  codexId: string;
  name: string;
  description: string;
  category: 'person' | 'place' | 'object' | 'idea' | 'event';
  importance: number; // 0-1 relevance score
  metadata: Record<string, any>; // Flexible key-value storage
  createdAt: string;
  updatedAt: string;
}

export interface MetaAnchor {
  id: string;
  codexId: string;
  type: 'telos_anchor' | 'ethos_anchor' | 'context_anchor';
  description: string;
  createdAt: string;
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

export interface HasActiveCodexRelationship {
  type: 'HAS_ACTIVE_CODEX';
  properties?: {
    activatedAt?: string;
  };
}

export interface ContainsRelationship {
  type: 'CONTAINS';
  properties?: {
    addedAt?: string;
  };
}

export interface AnchoredByRelationship {
  type: 'ANCHORED_BY';
  properties?: {
    anchorType?: string;
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

// NEW: Aether Core Repository Interfaces
export interface StarshipRepository {
  findAll(): Promise<Starship[]>;
  findById(id: string): Promise<Starship | null>;
  create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt'>): Promise<Starship>;
  update(id: string, updates: Partial<Starship>): Promise<Starship | null>;
  delete(id: string): Promise<boolean>;
  findByOwner(ownerId: string): Promise<Starship[]>;
  getDeployedAgents(starshipId: string): Promise<Agent[]>;
  deployAgent(starshipId: string, agentId: string): Promise<boolean>;
  removeAgent(starshipId: string, agentId: string): Promise<boolean>;
  getAvailableSlots(starshipId: string): Promise<number>;
}

export interface CodexRepository extends Repository<Codex> {
  findActiveByStarship(starshipId: string): Promise<Codex | null>;
  getVersionHistory(starshipId: string): Promise<Codex[]>;
  createVersion(starshipId: string, author: string, changeSummary: string): Promise<Codex>;
  deactivateCurrentVersion(starshipId: string): Promise<void>;
}

export interface VisionRepository {
  findAll(): Promise<Vision[]>;
  findById(id: string): Promise<Vision | null>;
  create(entity: Omit<Vision, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vision>;
  update(id: string, updates: Partial<Vision>): Promise<Vision | null>;
  delete(id: string): Promise<boolean>;
  findByCodex(codexId: string): Promise<Vision | null>;
  updateStatement(codexId: string, statement: string): Promise<Vision | null>;
}

export interface ConstraintRepository extends Repository<Constraint> {
  findByCodex(codexId: string): Promise<Constraint[]>;
  findActive(codexId: string): Promise<Constraint[]>;
  findByType(codexId: string, type: Constraint['type']): Promise<Constraint[]>;
}

export interface ConceptRepository extends Repository<Concept> {
  findByCodex(codexId: string): Promise<Concept[]>;
  findByCategory(codexId: string, category: Concept['category']): Promise<Concept[]>;
  searchByName(codexId: string, nameQuery: string): Promise<Concept[]>;
}

export interface MetaAnchorRepository extends Repository<MetaAnchor> {
  findByCodex(codexId: string): Promise<MetaAnchor[]>;
  findByType(codexId: string, type: MetaAnchor['type']): Promise<MetaAnchor | null>;
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
