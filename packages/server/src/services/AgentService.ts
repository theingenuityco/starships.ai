import { RepositoryFactory, Agent } from '@starships/models';
import { AgentConfig, CreateAgentRequest, UpdateAgentRequest } from '@starships/protocol';
import { env } from '../config/environment';

/**
 * Service for managing AI agents with Neo4j persistence
 */
export class AgentService {
  private static isInitialized = false;

  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // No need to create connection here - it's already initialized in the main server
    await this.seedDefaultAgents();

    this.isInitialized = true;
  }

  static async loadAgents(): Promise<AgentConfig[]> {
    try {
      await this.initialize();

      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents = await agentRepo.findAll();

      return agents.map(this.convertToAgentConfig);
    } catch (error: any) {
      console.error('[AGENT-SERVICE] Failed to load agents:', error);
      throw new Error(`Failed to load agents: ${error?.message || 'Unknown error'}`);
    }
  }

  static async getAgent(id: string): Promise<AgentConfig | undefined> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(id);

    return agent ? this.convertToAgentConfig(agent) : undefined;
  }

  static async createAgent(createRequest: CreateAgentRequest): Promise<AgentConfig> {
    await this.initialize();

    // Convert CreateAgentRequest to full AgentConfig with auto-generated fields
    const now = new Date().toISOString();
    const agentData: Omit<AgentConfig, 'id'> = {
      // Fields from CreateAgentRequest
      name: createRequest.name,
      description: createRequest.description,
      category: createRequest.category,
      systemPrompt: createRequest.systemPrompt,
      model: createRequest.model,
      tags: createRequest.tags || [],
      isPublic: createRequest.isPublic || false,
      temperature: createRequest.temperature,
      maxTokens: createRequest.maxTokens,
      customInstructions: createRequest.customInstructions,
      allowedStarshipClasses: createRequest.allowedStarshipClasses,
      starshipId: createRequest.starshipId, // Required starshipId from request

      // Auto-generated fields
      authorId: createRequest.authorId || 'system', // Use provided authorId or default to system
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      rating: 0,
      requiredPermissions: [],
    };

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.create(agentData);

    return this.convertToAgentConfig(agent);
  }

  static async updateAgent(
    id: string,
    updateRequest: UpdateAgentRequest
  ): Promise<AgentConfig | null> {
    await this.initialize();

    // Add updatedAt timestamp
    const updates = {
      ...updateRequest,
      updatedAt: new Date().toISOString(),
    };

    const agentRepo = RepositoryFactory.getAgentRepository();
    const updated = await agentRepo.update(id, updates);

    return updated ? this.convertToAgentConfig(updated) : null;
  }

  static async deleteAgent(id: string): Promise<boolean> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    return await agentRepo.delete(id);
  }

  // ADD: Enhanced query methods
  static async getAgentsByCategory(category: string): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findByCategory(category);
    return agents.map(this.convertToAgentConfig);
  }

  static async getAgentsByAuthor(authorId: string): Promise<AgentConfig[]> {
    try {
      await this.initialize();
      console.log(`[AGENT-SERVICE] Finding agents for author: ${authorId}`);
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents = await agentRepo.findByAuthor(authorId);
      console.log(`[AGENT-SERVICE] Found ${agents.length} agents for author: ${authorId}`);

      // Log each agent's authorId to verify it matches
      agents.forEach((agent) => {
        console.log(`[AGENT-SERVICE] Agent ${agent.id} has authorId: ${agent.authorId}`);
      });

      return agents.map(this.convertToAgentConfig);
    } catch (error: any) {
      console.error('[AGENT-SERVICE] Failed to get agents by author:', authorId, error);
      throw new Error(`Failed to get agents by author: ${error?.message || 'Unknown error'}`);
    }
  }

  static async getAgentsByTags(tags: string[]): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findByTags(tags);
    return agents.map(this.convertToAgentConfig);
  }

  static async getAgentsByStarshipId(starshipId: string): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    // Use the property-based query method
    const agents = await agentRepo.findByStarshipId(starshipId);
    return agents.map(this.convertToAgentConfig);
  }

  static async getPublicAgents(limit: number = 50, offset: number = 0): Promise<AgentConfig[]> {
    try {
      await this.initialize();
      const agentRepo = RepositoryFactory.getAgentRepository();
      const agents = await agentRepo.findPublic(limit, offset);
      return agents.map(this.convertToAgentConfig);
    } catch (error: any) {
      console.error('[AGENT-SERVICE] Failed to get public agents:', error);
      throw new Error(`Failed to get public agents: ${error?.message || 'Unknown error'}`);
    }
  }

  static async searchAgents(query: string): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.searchAgents(query);
    return agents.map(this.convertToAgentConfig);
  }

  // ADD: Analytics methods
  static async getAgentAnalytics(agentId: string): Promise<{
    usageCount: number;
    rating: number;
    createdAt: string;
    updatedAt: string;
    category: string;
    isPublic: boolean;
  } | null> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(agentId);

    if (!agent) {
      return null;
    }

    return {
      usageCount: agent.usageCount,
      rating: agent.rating || 0,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      category: agent.category,
      isPublic: agent.isPublic,
    };
  }

  static async rateAgent(
    agentId: string,
    userId: string,
    rating: number
  ): Promise<{
    success: boolean;
    newRating: number;
  }> {
    await this.initialize();

    // Validate rating range
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    const agentRepo = RepositoryFactory.getAgentRepository();

    // Check if agent exists
    const agent = await agentRepo.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    // For now, we'll use a simple average approach
    // In a more sophisticated system, we'd store individual ratings
    const currentRating = agent.rating || 0;
    const usageCount = agent.usageCount || 1;

    // Calculate new average rating
    const newRating = (currentRating * usageCount + rating) / (usageCount + 1);

    await agentRepo.updateRating(agentId, Math.round(newRating * 100) / 100);

    return {
      success: true,
      newRating: Math.round(newRating * 100) / 100,
    };
  }

  static async trackUsage(
    agentId: string,
    userId: string
  ): Promise<{
    success: boolean;
    newUsageCount: number;
  }> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();

    // Check if agent exists
    const agent = await agentRepo.findById(agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    await agentRepo.incrementUsageCount(agentId);

    return {
      success: true,
      newUsageCount: (agent.usageCount || 0) + 1,
    };
  }

  // UPDATE: Enhanced convertToAgentConfig to handle all fields
  private static convertToAgentConfig(agent: Agent): AgentConfig {
    return {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      description: agent.description,
      tags: agent.tags,
      category: agent.category,
      authorId: agent.authorId,
      isPublic: agent.isPublic,
      version: agent.version,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
      usageCount: agent.usageCount,
      rating: agent.rating,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      customInstructions: agent.customInstructions,
      allowedStarshipClasses: agent.allowedStarshipClasses,
      requiredPermissions: agent.requiredPermissions,
      starshipId: agent.starshipId,
    };
  }

  private static async seedDefaultAgents(): Promise<void> {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const existingAgents = await agentRepo.findAll();

    if (existingAgents.length > 0) {
      return;
    }

    const defaultAgents = [
      {
        name: 'Assistant',
        description: 'A helpful AI assistant for general tasks and questions',
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt: 'You are a helpful AI assistant.',
        category: 'general' as const,
        tags: ['general', 'helpful', 'assistant'],
        authorId: 'system',
        isPublic: true,
        version: '1.0.0',
        starshipId: 'system-starship', // Default starship for system agents
      },
      {
        name: 'Code Helper',
        description: 'Expert software developer for coding questions and solutions',
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt:
          'You are an expert software developer who helps with coding questions and provides clean, efficient solutions.',
        category: 'coding' as const,
        tags: ['programming', 'debugging', 'code-review', 'development'],
        authorId: 'system',
        isPublic: true,
        version: '1.0.0',
        starshipId: 'system-starship', // Default starship for system agents
      },
      {
        name: 'Creative Writer',
        description: 'Creative writing assistant for storytelling and content creation',
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt:
          'You are a creative writing assistant who helps with storytelling, character development, and creative content.',
        category: 'creative' as const,
        tags: ['writing', 'storytelling', 'creative', 'content'],
        authorId: 'system',
        isPublic: true,
        version: '1.0.0',
        starshipId: 'system-starship', // Default starship for system agents
      },
    ];

    for (const agentData of defaultAgents) {
      await agentRepo.create(agentData);
    }
  }
}
