// Connection
export { Neo4jConnection, Neo4jConfig, createConnection, getConnection } from './connection';

// Types (interfaces only)
export type {
  Agent, LLM, User, Channel,
  ActiveInRelationship,
  Repository, 
  AgentRepository as AgentRepositoryInterface, 
  UserRepository as UserRepositoryInterface, 
  ChannelRepository as ChannelRepositoryInterface, 
  LLMRepository as LLMRepositoryInterface
} from './types';

// Repository implementations
export { AgentRepository, UserRepository, ChannelRepository, LLMRepository } from './repositories';

// Factory for creating repositories
import { AgentRepository } from './repositories/AgentRepository';
import { UserRepository } from './repositories/UserRepository';
import { ChannelRepository } from './repositories/ChannelRepository';
import { LLMRepository } from './repositories/LLMRepository';

export class RepositoryFactory {
  private static agentRepo: AgentRepository;
  private static userRepo: UserRepository;
  private static channelRepo: ChannelRepository;
  private static llmRepo: LLMRepository;

  static getAgentRepository(): AgentRepository {
    if (!this.agentRepo) {
      this.agentRepo = new AgentRepository();
    }
    return this.agentRepo;
  }

  static getUserRepository(): UserRepository {
    if (!this.userRepo) {
      this.userRepo = new UserRepository();
    }
    return this.userRepo;
  }

  static getChannelRepository(): ChannelRepository {
    if (!this.channelRepo) {
      this.channelRepo = new ChannelRepository();
    }
    return this.channelRepo;
  }

  static getLLMRepository(): LLMRepository {
    if (!this.llmRepo) {
      this.llmRepo = new LLMRepository();
    }
    return this.llmRepo;
  }
} 