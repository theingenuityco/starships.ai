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
// export { ConstraintRepository } from './ConstraintRepository';
// export { ConceptRepository } from './ConceptRepository';
// export { MetaAnchorRepository } from './MetaAnchorRepository';
export { MCPServerOptionRepository } from './MCPServerOptionRepository';
export { MCPServerConnectorRepository } from './MCPServerConnectorRepository';

// Export expedition repositories
export { ExpeditionRepository } from './ExpeditionRepository';
export { ExpeditionTaskRepository } from './ExpeditionTaskRepository';
export { ExpeditionMessageRepository } from './ExpeditionMessageRepository';
export { ExpeditionResultRepository } from './ExpeditionResultRepository';

// Import the new repositories for the factory
import { StarshipRepository } from './StarshipRepository';
import { VisionRepository } from './VisionRepository';
// import { ConstraintRepository } from './ConstraintRepository';
// import { ConceptRepository } from './ConceptRepository';
// import { MetaAnchorRepository } from './MetaAnchorRepository';
import { MCPServerOptionRepository } from './MCPServerOptionRepository';
import { MCPServerConnectorRepository } from './MCPServerConnectorRepository';

// Import expedition repositories
import { ExpeditionRepository } from './ExpeditionRepository';
import { ExpeditionTaskRepository } from './ExpeditionTaskRepository';
import { ExpeditionMessageRepository } from './ExpeditionMessageRepository';
import { ExpeditionResultRepository } from './ExpeditionResultRepository';

/**
 * Factory for creating singleton repository instances with proper dependency injection,
 * error handling, and resource management.
 *
 * This factory ensures:
 * - Singleton pattern for all repositories
 * - Proper dependency injection (e.g., StarshipRepository gets MCPServerConnectorRepository)
 * - Error handling during repository creation
 * - Resource cleanup and connection management
 * - Thread-safe initialization
 */
export class RepositoryFactory {
  private static agentRepo: AgentRepository | null = null;
  private static userRepo: UserRepository | null = null;
  private static channelRepo: ChannelRepository | null = null;
  private static llmRepo: LLMRepository | null = null;

  // NEW: Aether Core repository instances
  private static starshipRepo: StarshipRepository | null = null;
  // private static codexRepo: CodexRepository | null = null;
  private static visionRepo: VisionRepository | null = null;
  // private static constraintRepo: ConstraintRepository | null = null;
  // private static conceptRepo: ConceptRepository | null = null;
  // private static metaAnchorRepo: MetaAnchorRepository | null = null;
  private static mcpServerOptionRepo: MCPServerOptionRepository | null = null;
  private static mcpServerConnectorRepo: MCPServerConnectorRepository | null = null;
  private static agentTemplateService: AgentTemplateService | null = null;

  // Initialization locks for thread safety
  private static readonly initializationLocks = new Map<string, Promise<any>>();
  // private static starshipRepo: StarshipRepository;
  // private static visionRepo: VisionRepository;
  // private static agentTemplateService: AgentTemplateService;

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
   * Logger for factory operations
   */
  private static log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[RepositoryFactory] ${timestamp} - ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }

  /**
   * Thread-safe repository creation with error handling
   */
  private static async createRepository<T>(
    key: string,
    factory: () => T | Promise<T>,
    dependencies?: string[]
  ): Promise<T> {
    // Check if already initialized
    const existingRepo = (this as any)[key];
    if (existingRepo) {
      return existingRepo;
    }

    // Check if initialization is in progress
    if (this.initializationLocks.has(key)) {
      this.log(`Waiting for ${key} initialization to complete`);
      return await this.initializationLocks.get(key)!;
    }

    // Start initialization
    const initPromise = this.performInitialization(key, factory, dependencies);
    this.initializationLocks.set(key, initPromise);

    try {
      const result = await initPromise;
      this.initializationLocks.delete(key);
      return result;
    } catch (error) {
      this.initializationLocks.delete(key);
      throw error;
    }
  }

  /**
   * Perform the actual repository initialization
   */
  private static async performInitialization<T>(
    key: string,
    factory: () => T | Promise<T>,
    dependencies?: string[]
  ): Promise<T> {
    try {
      this.log(
        `Initializing ${key}${dependencies ? ` with dependencies: ${dependencies.join(', ')}` : ''}`
      );

      // Dependencies are handled by the factory function itself
      // No need to validate here as the factory will ensure dependencies are created

      const repository = await factory();
      (this as any)[key] = repository;

      this.log(`Successfully initialized ${key}`);
      return repository;
    } catch (error) {
      const errorMessage = `Failed to initialize ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.log(errorMessage, 'error');
      throw new Error(errorMessage);
    }
  }

  // /**
  //  * Get AgentRepository singleton instance
  //  */
  // static async getAgentRepository(): Promise<AgentRepository> {
  //   return this.createRepository('agentRepo', () => {
  //     this.log('Creating AgentRepository instance');
  //     return new AgentRepository();
  //   });
  // }

  // /**
  //  * Get UserRepository singleton instance
  //  */
  // static async getUserRepository(): Promise<UserRepository> {
  //   return this.createRepository('userRepo', () => {
  //     this.log('Creating UserRepository instance');
  //     return new UserRepository();
  //   });
  // }

  // /**
  //  * Get ChannelRepository singleton instance
  //  */
  // static async getChannelRepository(): Promise<ChannelRepository> {
  //   return this.createRepository('channelRepo', () => {
  //     this.log('Creating ChannelRepository instance');
  //     return new ChannelRepository();
  //   });
  // }

  // /**
  //  * Get LLMRepository singleton instance
  //  */
  // static async getLLMRepository(): Promise<LLMRepository> {
  //   return this.createRepository('llmRepo', () => {
  //     this.log('Creating LLMRepository instance');
  //     return new LLMRepository();
  //   });
  // }

  // // NEW: Aether Core repository getters with proper dependency injection

  // /**
  //  * Get StarshipRepository singleton instance with MCPServerConnectorRepository dependency
  //  */
  // static async getStarshipRepository(): Promise<StarshipRepository> {
  //   return this.createRepository(
  //     'starshipRepo',
  //     async () => {
  //       this.log(
  //         'Creating StarshipRepository instance with MCPServerConnectorRepository dependency'
  //       );

  //       // Ensure MCPServerConnectorRepository is initialized first
  //       const mcpConnectorRepo = await this.getMCPServerConnectorRepository();

  //       return new StarshipRepository(mcpConnectorRepo);
  //     },
  //     ['mcpServerConnectorRepo']
  //   );
  // }

  // /**
  //  * Get CodexRepository singleton instance
  //  */
  // static async getCodexRepository(): Promise<CodexRepository> {
  //   return this.createRepository('codexRepo', () => {
  //     this.log('Creating CodexRepository instance');
  //     return new CodexRepository();
  //   });
  // }

  // /**
  //  * Get VisionRepository singleton instance
  //  */
  // static async getVisionRepository(): Promise<VisionRepository> {
  //   return this.createRepository('visionRepo', () => {
  //     this.log('Creating VisionRepository instance');
  //     return new VisionRepository();
  //   });
  // }

  // /**
  //  * Get ConstraintRepository singleton instance
  //  */
  // static async getConstraintRepository(): Promise<ConstraintRepository> {
  //   return this.createRepository('constraintRepo', () => {
  //     this.log('Creating ConstraintRepository instance');
  //     return new ConstraintRepository();
  //   });
  // }

  // /**
  //  * Get ConceptRepository singleton instance
  //  */
  // static async getConceptRepository(): Promise<ConceptRepository> {
  //   return this.createRepository('conceptRepo', () => {
  //     this.log('Creating ConceptRepository instance');
  //     return new ConceptRepository();
  //   });
  // }

  // /**
  //  * Get MetaAnchorRepository singleton instance
  //  */
  // static async getMetaAnchorRepository(): Promise<MetaAnchorRepository> {
  //   return this.createRepository('metaAnchorRepo', () => {
  //     this.log('Creating MetaAnchorRepository instance');
  //     return new MetaAnchorRepository();
  //   });
  // }

  /**
   * Get MCPServerOptionRepository singleton instance
   */
  static async getMCPServerOptionRepository(): Promise<MCPServerOptionRepository> {
    return this.createRepository('mcpServerOptionRepo', () => {
      this.log('Creating MCPServerOptionRepository instance');
      return new MCPServerOptionRepository();
    });
  }

  /**
   * Get MCPServerConnectorRepository singleton instance
   */
  static async getMCPServerConnectorRepository(): Promise<MCPServerConnectorRepository> {
    return this.createRepository('mcpServerConnectorRepo', () => {
      this.log('Creating MCPServerConnectorRepository instance');
      return new MCPServerConnectorRepository();
    });
  }

  /**
   * Get the AgentTemplateService instance with proper connection management
   */
  static async getAgentTemplateService(): Promise<AgentTemplateService> {
    return this.createRepository('agentTemplateService', () => {
      this.log('Creating AgentTemplateService instance with connection dependency');
      try {
        const connection = getConnection();
        return new AgentTemplateService(connection);
      } catch (error) {
        this.log(
          `Failed to get database connection for AgentTemplateService: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
        throw error;
      }
    });
  }

  /**
   * Reset all repository instances - useful for testing and cleanup
   * This method clears all singleton instances and initialization locks
   */
  static resetAll(): void {
    this.log('Resetting all repository instances');

    // Clear all repository instances
    this.agentRepo = null;
    this.userRepo = null;
    this.channelRepo = null;
    this.llmRepo = null;
    this.starshipRepo = null;
    // this.codexRepo = null;
    this.visionRepo = null;
    // this.constraintRepo = null;
    // this.conceptRepo = null;
    // this.metaAnchorRepo = null;
    this.mcpServerOptionRepo = null;
    this.mcpServerConnectorRepo = null;
    this.agentTemplateService = null;

    // Clear initialization locks
    this.initializationLocks.clear();

    this.log('All repository instances reset successfully');
  }

  /**
   * Get initialization status of all repositories
   * Useful for debugging and monitoring
   */
  static getInitializationStatus(): Record<string, boolean> {
    return {
      agentRepo: this.agentRepo !== null,
      userRepo: this.userRepo !== null,
      channelRepo: this.channelRepo !== null,
      llmRepo: this.llmRepo !== null,
      starshipRepo: this.starshipRepo !== null,
      // codexRepo: this.codexRepo !== null,
      visionRepo: this.visionRepo !== null,
      // constraintRepo: this.constraintRepo !== null,
      // conceptRepo: this.conceptRepo !== null,
      // metaAnchorRepo: this.metaAnchorRepo !== null,
      mcpServerOptionRepo: this.mcpServerOptionRepo !== null,
      mcpServerConnectorRepo: this.mcpServerConnectorRepo !== null,
      agentTemplateService: this.agentTemplateService !== null,
    };
  }

  /**
   * Check if any repositories are currently being initialized
   */
  static hasActiveInitializations(): boolean {
    return this.initializationLocks.size > 0;
  }

  /**
   * Get list of repositories currently being initialized
   */
  static getActiveInitializations(): string[] {
    return Array.from(this.initializationLocks.keys());
  }

  /**
   * Initialize all repositories in the correct dependency order
   * This ensures all dependencies are properly resolved
   */
  static async initializeAll(): Promise<void> {
    this.log('Starting initialization of all repositories');

    try {
      // Initialize repositories without dependencies first
      await Promise.all([
        this.getAgentRepository(),
        this.getUserRepository(),
        this.getChannelRepository(),
        this.getLLMRepository(),
        // this.getCodexRepository(),
        this.getVisionRepository(),
        // this.getConstraintRepository(),
        // this.getConceptRepository(),
        // this.getMetaAnchorRepository(),
        this.getMCPServerOptionRepository(),
        this.getMCPServerConnectorRepository(),
        this.getAgentTemplateService(),
      ]);

      // Initialize repositories with dependencies
      await this.getStarshipRepository();

      this.log('All repositories initialized successfully');
    } catch (error) {
      this.log(
        `Failed to initialize all repositories: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      throw error;
    }
  }

  /**
   * Validate that all critical repositories are properly initialized
   * Throws an error if any critical repository is missing
   */
  static validateCriticalRepositories(): void {
    const critical = ['mcpServerConnectorRepo', 'starshipRepo'];
    const status = this.getInitializationStatus();

    for (const repo of critical) {
      if (!status[repo]) {
        throw new Error(`Critical repository ${repo} is not initialized`);
      }
    }

    this.log('All critical repositories validated successfully');
  }
  /*
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

  // /**
  //  * Reset all repository instances - useful for testing
  //  */
  // static resetAll(): void {
  //   this.agentRepo = null as any;
  //   this.userRepo = null as any;
  //   this.channelRepo = null as any;
  //   this.llmRepo = null as any;
  //   this.starshipRepo = null as any;
  //   this.visionRepo = null as any;
  //   this.agentTemplateService = null as any;
  //   this.expeditionRepo = null as any;
  //   this.expeditionTaskRepo = null as any;
  //   this.expeditionMessageRepo = null as any;
  //   this.expeditionResultRepo = null as any;
}

