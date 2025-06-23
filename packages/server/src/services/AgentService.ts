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
      database: process.env.NEO4J_DATABASE || 'neo4j'
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

  private static convertToAgentConfig(agent: Agent): AgentConfig {
    return {
      id: agent.id,
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt
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
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt: 'You are a helpful AI assistant.'
      },
      {
        name: 'Code Helper',
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt: 'You are an expert software developer who helps with coding questions and provides clean, efficient solutions.'
      },
      {
        name: 'Creative Writer',
        model: env.DEFAULT_CHAT_MODEL,
        systemPrompt: 'You are a creative writing assistant who helps with storytelling, character development, and creative content.'
      }
    ];

    for (const agentData of defaultAgents) {
      await agentRepo.create(agentData);
    }
  }
} 