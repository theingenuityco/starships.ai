// Import Agent from protocol to avoid circular dependency
import { Agent } from '@starships/protocol';

// Import expedition types from protocol
import {
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult,
  ExpeditionStatus,
  ExpeditionPriority,
  TaskStatus,
  TaskPriority,
  MessageRole,
  MessageType,
  ResultType,
  ResultFormat,
  QualityScore,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
  ExpeditionWorkflowState,
  WorkflowPhase,
  TaskBreakdown
} from '@starships/protocol';

// Re-export Agent and expedition types for backward compatibility
export { Agent };
export {
  Expedition,
  ExpeditionTask,
  ExpeditionMessage,
  ExpeditionResult,
  ExpeditionStatus,
  ExpeditionPriority,
  TaskStatus,
  TaskPriority,
  MessageRole,
  MessageType,
  ResultType,
  ResultFormat,
  QualityScore,
  ExpeditionFilters,
  ExpeditionSort,
  PaginationOptions,
  ExpeditionWorkflowState,
  WorkflowPhase,
  TaskBreakdown
};

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
  slug: string;
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

// NEW: Expedition Relationships
export interface HasExpeditionRelationship {
  type: 'HAS_EXPEDITION';
  properties?: {
    createdAt?: string;
  };
}

export interface AssignedToRelationship {
  type: 'ASSIGNED_TO';
  properties?: {
    assignedAt?: string;
    role?: string;
  };
}

export interface HasTaskRelationship {
  type: 'HAS_TASK';
  properties?: {
    createdAt?: string;
  };
}

export interface HasMessageRelationship {
  type: 'HAS_MESSAGE';
  properties?: {
    timestamp?: string;
  };
}

export interface HasResultRelationship {
  type: 'HAS_RESULT';
  properties?: {
    createdAt?: string;
  };
}

export interface DependsOnRelationship {
  type: 'DEPENDS_ON';
  properties?: {
    dependencyType?: string;
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
  findBySlug(slug: string, ownerId: string): Promise<Starship | null>;
  create(entity: Omit<Starship, 'id' | 'createdAt' | 'maxAgents' | 'updatedAt' | 'slug'> & { slug?: string }): Promise<Starship>;
  update(id: string, updates: Partial<Starship>): Promise<Starship | null>;
  delete(id: string): Promise<boolean>;
  findByOwner(ownerId: string): Promise<Starship[]>;
  getDeployedAgents(starshipId: string): Promise<Agent[]>;
  deployAgent(starshipId: string, agentId: string): Promise<boolean>;
  removeAgent(starshipId: string, agentId: string): Promise<boolean>;
  getAvailableSlots(starshipId: string): Promise<number>;
  generateUniqueSlug(name: string, ownerId: string): Promise<string>;
  isSlugAvailable(slug: string, ownerId: string, excludeId?: string): Promise<boolean>;
  
  // Expedition integration methods
  updateActiveExpeditionsCount(starshipId: string, increment?: boolean): Promise<void>;
  getExpeditionCapacity(starshipId: string): Promise<{
    maxConcurrentExpeditions: number;
    currentActiveExpeditions: number;
    availableExpeditionSlots: number;
    maxAgentsPerExpedition: number;
    totalDeployedAgents: number;
    availableAgents: number;
  }>;
  canStartNewExpedition(starshipId: string): Promise<{
    canStart: boolean;
    reason?: string;
    capacity: {
      maxConcurrentExpeditions: number;
      currentActiveExpeditions: number;
      availableExpeditionSlots: number;
    };
  }>;
  getAgentAvailabilityForExpeditions(starshipId: string): Promise<Array<{
    agentId: string;
    agentName: string;
    category: string;
    tags: string[];
    availability: 'available' | 'busy' | 'offline';
    currentExpeditions: string[];
    workload: 'light' | 'moderate' | 'heavy';
  }>>;
  getExpeditionStats(starshipId: string, days?: number): Promise<{
    expeditions: {
      total: number;
      completed: number;
      failed: number;
      cancelled: number;
      averageDuration: number;
      successRate: number;
    };
    tasks: {
      total: number;
      completed: number;
      failed: number;
      averageDuration: number;
      successRate: number;
    };
    topPerformingAgents: Array<{
      agentId: string;
      agentName: string;
      tasksCompleted: number;
      successRate: number;
    }>;
  }>;
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
  createAgentFromTemplate(templateId: string, agentName: string, authorId: string): Promise<Agent>;

  // Create template from public agent
  createTemplateFromAgent(agentId: string): Promise<AgentTemplate | null>;
}

// NEW: Expedition Repository Interfaces
export interface ExpeditionRepository extends Repository<Expedition> {
  findByStarship(starshipId: string): Promise<Expedition[]>;
  findByStatus(starshipId: string, status: ExpeditionStatus): Promise<Expedition[]>;
  findByPriority(starshipId: string, priority: ExpeditionPriority): Promise<Expedition[]>;
  findWithFilters(starshipId: string, filters: ExpeditionFilters, sort?: ExpeditionSort, pagination?: PaginationOptions): Promise<{
    expeditions: Expedition[];
    total: number;
  }>;
  updateStatus(id: string, status: ExpeditionStatus): Promise<Expedition | null>;
  updateWorkflowState(id: string, state: ExpeditionWorkflowState): Promise<Expedition | null>;
  assignAgent(expeditionId: string, agentId: string): Promise<boolean>;
  removeAgent(expeditionId: string, agentId: string): Promise<boolean>;
  getAssignedAgents(expeditionId: string): Promise<Agent[]>;
  getExpeditionStats(starshipId: string): Promise<{
    total: number;
    active: number;
    completed: number;
    failed: number;
    averageDuration: number;
    successRate: number;
  }>;
}

export interface ExpeditionTaskRepository extends Repository<ExpeditionTask> {
  findByExpedition(expeditionId: string): Promise<ExpeditionTask[]>;
  findByStatus(expeditionId: string, status: TaskStatus): Promise<ExpeditionTask[]>;
  findByAgent(agentId: string): Promise<ExpeditionTask[]>;
  findByPriority(expeditionId: string, priority: TaskPriority): Promise<ExpeditionTask[]>;
  assignToAgent(taskId: string, agentId: string): Promise<ExpeditionTask | null>;
  updateStatus(taskId: string, status: TaskStatus): Promise<ExpeditionTask | null>;
  updateResult(taskId: string, result: string): Promise<ExpeditionTask | null>;
  getDependencies(taskId: string): Promise<ExpeditionTask[]>;
  getDependents(taskId: string): Promise<ExpeditionTask[]>;
  getTasksReadyForExecution(expeditionId: string): Promise<ExpeditionTask[]>;
  getTaskStats(expeditionId: string): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
  }>;
}

export interface ExpeditionMessageRepository extends Repository<ExpeditionMessage> {
  findByExpedition(expeditionId: string, limit?: number, offset?: number): Promise<ExpeditionMessage[]>;
  findByRole(expeditionId: string, role: MessageRole): Promise<ExpeditionMessage[]>;
  findByType(expeditionId: string, messageType: MessageType): Promise<ExpeditionMessage[]>;
  findByThread(threadId: string): Promise<ExpeditionMessage[]>;
  findByAgent(expeditionId: string, agentId: string): Promise<ExpeditionMessage[]>;
  getMessageCount(expeditionId: string): Promise<number>;
  getLatestMessages(expeditionId: string, limit: number): Promise<ExpeditionMessage[]>;
  searchMessages(expeditionId: string, query: string): Promise<ExpeditionMessage[]>;
}

export interface ExpeditionResultRepository extends Repository<ExpeditionResult> {
  findByExpedition(expeditionId: string): Promise<ExpeditionResult[]>;
  findByType(expeditionId: string, resultType: ResultType): Promise<ExpeditionResult[]>;
  findByFormat(expeditionId: string, format: ResultFormat): Promise<ExpeditionResult[]>;
  findByCreator(createdBy: string): Promise<ExpeditionResult[]>;
  updateQuality(resultId: string, quality: QualityScore): Promise<ExpeditionResult | null>;
  getResultStats(expeditionId: string): Promise<{
    total: number;
    byType: Record<ResultType, number>;
    byFormat: Record<ResultFormat, number>;
    averageQuality: number;
  }>;
}
