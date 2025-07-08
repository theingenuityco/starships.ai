import { RepositoryFactory, Agent, createConnection, Neo4jConfig } from '@starships/models';
import { AgentConfig } from '@starships/protocol';
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

    const config: Neo4jConfig = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
    };

    const connection = createConnection(config);
    await connection.connect();
    await connection.initializeSchema();

    await this.seedDefaultAgents();

    this.isInitialized = true;
  }

  static async loadAgents(): Promise<AgentConfig[]> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findAll();

    return agents.map(this.convertToAgentConfig);
  }

  static async getAgent(id: string): Promise<AgentConfig | undefined> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.findById(id);

    return agent ? this.convertToAgentConfig(agent) : undefined;
  }

  static async createAgent(config: Omit<AgentConfig, 'id'>): Promise<AgentConfig> {
    await this.initialize();

    const agentRepo = RepositoryFactory.getAgentRepository();
    const agent = await agentRepo.create(config);

    return this.convertToAgentConfig(agent);
  }

  static async updateAgent(id: string, updates: Partial<AgentConfig>): Promise<AgentConfig | null> {
    await this.initialize();

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
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findByAuthor(authorId);
    return agents.map(this.convertToAgentConfig);
  }

  static async getAgentsByTags(tags: string[]): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findByTags(tags);
    return agents.map(this.convertToAgentConfig);
  }

  static async getPublicAgents(limit: number = 50, offset: number = 0): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.findPublic(limit, offset);
    return agents.map(this.convertToAgentConfig);
  }

  static async searchAgents(query: string): Promise<AgentConfig[]> {
    await this.initialize();
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agents = await agentRepo.searchAgents(query);
    return agents.map(this.convertToAgentConfig);
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
      },
    ];

    for (const agentData of defaultAgents) {
      await agentRepo.create(agentData);
    }
  }
}
