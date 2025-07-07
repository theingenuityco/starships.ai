import { AgentRepository } from './AgentRepository';
import { UserRepository } from './UserRepository';
import { ChannelRepository } from './ChannelRepository';
import { LLMRepository } from './LLMRepository';

export { AgentRepository } from './AgentRepository';
export { UserRepository } from './UserRepository';
export { ChannelRepository } from './ChannelRepository';
export { LLMRepository } from './LLMRepository';

// NEW: Aether Core Repositories
export { StarshipRepository } from './StarshipRepository';
export { CodexRepository } from './CodexRepository';
export { VisionRepository } from './VisionRepository';
export { ConstraintRepository } from './ConstraintRepository';
export { ConceptRepository } from './ConceptRepository';
export { MetaAnchorRepository } from './MetaAnchorRepository';

// Import the new repositories for the factory
import { StarshipRepository } from './StarshipRepository';
import { CodexRepository } from './CodexRepository';
import { VisionRepository } from './VisionRepository';
import { ConstraintRepository } from './ConstraintRepository';
import { ConceptRepository } from './ConceptRepository';
import { MetaAnchorRepository } from './MetaAnchorRepository';

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
  private static codexRepo: CodexRepository;
  private static visionRepo: VisionRepository;
  private static constraintRepo: ConstraintRepository;
  private static conceptRepo: ConceptRepository;
  private static metaAnchorRepo: MetaAnchorRepository;

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

  static getCodexRepository(): CodexRepository {
    if (!this.codexRepo) {
      this.codexRepo = new CodexRepository();
    }
    return this.codexRepo;
  }

  static getVisionRepository(): VisionRepository {
    if (!this.visionRepo) {
      this.visionRepo = new VisionRepository();
    }
    return this.visionRepo;
  }


  static getConstraintRepository(): ConstraintRepository {
    if (!this.constraintRepo) {
      this.constraintRepo = new ConstraintRepository();
    }
    return this.constraintRepo;
  }

  static getConceptRepository(): ConceptRepository {
    if (!this.conceptRepo) {
      this.conceptRepo = new ConceptRepository();
    }
    return this.conceptRepo;
  }

  static getMetaAnchorRepository(): MetaAnchorRepository {
    if (!this.metaAnchorRepo) {
      this.metaAnchorRepo = new MetaAnchorRepository();
    }
    return this.metaAnchorRepo;
  }
} 