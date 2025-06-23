// Connection
export { Neo4jConnection, Neo4jConfig, createConnection, getConnection } from './connection';

// Types (interfaces only)
export type {
  Agent, Model, User, Channel,
  InteractsWithRelationship, UsesRelationship, ActiveInRelationship, DeployedInRelationship,
  Repository, AgentRepository as IAgentRepository, UserRepository as IUserRepository, 
  ChannelRepository as IChannelRepository, ModelRepository as IModelRepository
} from './types';

// Repository implementations
export { AgentRepository, UserRepository, ChannelRepository, ModelRepository } from './repositories';

// Factory for creating repositories
import { AgentRepository } from './repositories/AgentRepository';
import { UserRepository } from './repositories/UserRepository';
import { ChannelRepository } from './repositories/ChannelRepository';
import { ModelRepository } from './repositories/ModelRepository';

export class RepositoryFactory {
  private static agentRepo: AgentRepository;
  private static userRepo: UserRepository;
  private static channelRepo: ChannelRepository;
  private static modelRepo: ModelRepository;

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

  static getModelRepository(): ModelRepository {
    if (!this.modelRepo) {
      this.modelRepo = new ModelRepository();
    }
    return this.modelRepo;
  }
} 