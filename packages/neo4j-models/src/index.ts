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
export class RepositoryFactory {
  private static agentRepo: import('./repositories/AgentRepository').AgentRepository;
  private static userRepo: import('./repositories/UserRepository').UserRepository;
  private static channelRepo: import('./repositories/ChannelRepository').ChannelRepository;
  private static modelRepo: import('./repositories/ModelRepository').ModelRepository;

  static getAgentRepository(): import('./repositories/AgentRepository').AgentRepository {
    if (!this.agentRepo) {
      const { AgentRepository } = require('./repositories/AgentRepository');
      this.agentRepo = new AgentRepository();
    }
    return this.agentRepo;
  }

  static getUserRepository(): import('./repositories/UserRepository').UserRepository {
    if (!this.userRepo) {
      const { UserRepository } = require('./repositories/UserRepository');
      this.userRepo = new UserRepository();
    }
    return this.userRepo;
  }

  static getChannelRepository(): import('./repositories/ChannelRepository').ChannelRepository {
    if (!this.channelRepo) {
      const { ChannelRepository } = require('./repositories/ChannelRepository');
      this.channelRepo = new ChannelRepository();
    }
    return this.channelRepo;
  }

  static getModelRepository(): import('./repositories/ModelRepository').ModelRepository {
    if (!this.modelRepo) {
      const { ModelRepository } = require('./repositories/ModelRepository');
      this.modelRepo = new ModelRepository();
    }
    return this.modelRepo;
  }
} 