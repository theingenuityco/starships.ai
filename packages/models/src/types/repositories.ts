import { Agent, LLM, User, Starship, Vision, AgentTemplate } from './entities';

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