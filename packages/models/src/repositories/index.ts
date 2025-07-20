import { AgentRepository } from './AgentRepository';
import { UserRepository } from './UserRepository';
import { ChannelRepository } from './ChannelRepository';
import { LLMRepository } from './LLMRepository';
import { Neo4jAgentTemplateRepository } from './AgentTemplateRepository';
import { AgentTemplateService } from '../services/AgentTemplateService';
import { getConnection } from '../connection';

export { AgentRepository } from './AgentRepository';
export { UserRepository } from './UserRepository';
export { ChannelRepository } from './ChannelRepository';
export { LLMRepository } from './LLMRepository';

// NEW: Aether Core Repositories
export { StarshipRepository } from './StarshipRepository';
export { VisionRepository } from './VisionRepository';

// Export expedition repositories
export { ExpeditionRepository } from './ExpeditionRepository';
export { ExpeditionTaskRepository } from './ExpeditionTaskRepository';
export { ExpeditionMessageRepository } from './ExpeditionMessageRepository';
export { ExpeditionResultRepository } from './ExpeditionResultRepository';

// Import the new repositories for the factory
import { StarshipRepository } from './StarshipRepository';
import { VisionRepository } from './VisionRepository';

// Import expedition repositories
import { ExpeditionRepository } from './ExpeditionRepository';
import { ExpeditionTaskRepository } from './ExpeditionTaskRepository';
import { ExpeditionMessageRepository } from './ExpeditionMessageRepository';
import { ExpeditionResultRepository } from './ExpeditionResultRepository';

/**
 * Factory for creating singleton repository instances
 */
export class RepositoryFactory {
  private static agentRepo: AgentRepository;
  private static userRepo: UserRepository;
  private static channelRepo: ChannelRepository;
  private static llmRepo: LLMRepository;

  // NEW: Aether Core repository instances
  private static starshipRepo: StarshipRepository;
  private static visionRepo: VisionRepository;
  private static agentTemplateService: AgentTemplateService;

  // Expedition repository instances
  private static expeditionRepo: ExpeditionRepository;
  private static expeditionTaskRepo: ExpeditionTaskRepository;
  private static expeditionMessageRepo: ExpeditionMessageRepository;
  private static expeditionResultRepo: ExpeditionResultRepository;

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

  // NEW: Aether Core repository getters
  static getStarshipRepository(): StarshipRepository {
    if (!this.starshipRepo) {
      this.starshipRepo = new StarshipRepository();
    }
    return this.starshipRepo;
  }

  static getVisionRepository(): VisionRepository {
    if (!this.visionRepo) {
      this.visionRepo = new VisionRepository();
    }
    return this.visionRepo;
  }

  /**
   * Get the AgentTemplateService instance
   */
  static getAgentTemplateService(): AgentTemplateService {
    if (!this.agentTemplateService) {
      const connection = getConnection();
      this.agentTemplateService = new AgentTemplateService(connection);
    }
    return this.agentTemplateService;
  }

  /**
   * Get the ExpeditionRepository instance
   */
  static getExpeditionRepository(): ExpeditionRepository {
    if (!this.expeditionRepo) {
      this.expeditionRepo = new ExpeditionRepository();
    }
    return this.expeditionRepo;
  }

  /**
   * Get the ExpeditionTaskRepository instance
   */
  static getExpeditionTaskRepository(): ExpeditionTaskRepository {
    if (!this.expeditionTaskRepo) {
      this.expeditionTaskRepo = new ExpeditionTaskRepository();
    }
    return this.expeditionTaskRepo;
  }

  /**
   * Get the ExpeditionMessageRepository instance
   */
  static getExpeditionMessageRepository(): ExpeditionMessageRepository {
    if (!this.expeditionMessageRepo) {
      this.expeditionMessageRepo = new ExpeditionMessageRepository();
    }
    return this.expeditionMessageRepo;
  }

  /**
   * Get the ExpeditionResultRepository instance
   */
  static getExpeditionResultRepository(): ExpeditionResultRepository {
    if (!this.expeditionResultRepo) {
      this.expeditionResultRepo = new ExpeditionResultRepository();
    }
    return this.expeditionResultRepo;
  }

  /**
   * Reset all repository instances - useful for testing
   */
  static resetAll(): void {
    this.agentRepo = null as any;
    this.userRepo = null as any;
    this.channelRepo = null as any;
    this.llmRepo = null as any;
    this.starshipRepo = null as any;
    this.visionRepo = null as any;
    this.agentTemplateService = null as any;
    this.expeditionRepo = null as any;
    this.expeditionTaskRepo = null as any;
    this.expeditionMessageRepo = null as any;
    this.expeditionResultRepo = null as any;
  }
}
