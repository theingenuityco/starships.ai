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
export { MCPServerOptionRepository } from './MCPServerOptionRepository';
export { MCPServerConnectorRepository } from './MCPServerConnectorRepository';
export { MissionRepository } from './MissionRepository';

// Export expedition repositories (STUB IMPLEMENTATIONS)
export { ExpeditionRepository } from './ExpeditionRepository.stub';
export { ExpeditionTaskRepository } from './ExpeditionTaskRepository.stub';
export { ExpeditionMessageRepository } from './ExpeditionMessageRepository.stub';
export { ExpeditionResultRepository } from './ExpeditionResultRepository.stub';

// Export workflow repositories
export { WorkflowRepository } from './WorkflowRepository';
export { WorkflowRuntimeStateRepository } from './WorkflowRuntimeStateRepository';

// Export mission clarity repository
export { MissionClarityRepository } from './MissionClarityRepository';

// Import the new repositories for the factory
import { StarshipRepository } from './StarshipRepository';
import { VisionRepository } from './VisionRepository';
import { MCPServerOptionRepository } from './MCPServerOptionRepository';
import { MCPServerConnectorRepository } from './MCPServerConnectorRepository';
import { MissionRepository } from './MissionRepository';

// Import expedition repositories (STUB IMPLEMENTATIONS)
import { ExpeditionRepository } from './ExpeditionRepository.stub';
import { ExpeditionTaskRepository } from './ExpeditionTaskRepository.stub';
import { ExpeditionMessageRepository } from './ExpeditionMessageRepository.stub';
import { ExpeditionResultRepository } from './ExpeditionResultRepository.stub';

// Import workflow repositories
import { WorkflowRepository } from './WorkflowRepository';
import { WorkflowRuntimeStateRepository } from './WorkflowRuntimeStateRepository';

// Import mission clarity repository
import { MissionClarityRepository } from './MissionClarityRepository';

/**
 * Synchronized Repository Factory for Socket.IO Compatibility
 * 
 * This factory ensures:
 * - All repository getters are synchronous for socket middleware compatibility
 * - Proper initialization without blocking socket operations
 * - Thread-safe singleton pattern
 * - Graceful error handling and recovery
 * - Consistent repository access patterns
 */
export class RepositoryFactory {
  // Repository instances - all initialized synchronously
  private static agentRepo: AgentRepository | null = null;
  private static userRepo: UserRepository | null = null;
  private static channelRepo: ChannelRepository | null = null;
  private static llmRepo: LLMRepository | null = null;

  // Aether Core repository instances
  private static starshipRepo: StarshipRepository | null = null;
  private static visionRepo: VisionRepository | null = null;
  private static mcpServerOptionRepo: MCPServerOptionRepository | null = null;
  private static mcpServerConnectorRepo: MCPServerConnectorRepository | null = null;
  private static missionRepo: MissionRepository | null = null;
  private static agentTemplateService: AgentTemplateService | null = null;

  // Expedition repository instances (STUB IMPLEMENTATIONS)
  private static expeditionRepo: ExpeditionRepository | null = null;
  private static expeditionTaskRepo: ExpeditionTaskRepository | null = null;
  private static expeditionMessageRepo: ExpeditionMessageRepository | null = null;
  private static expeditionResultRepo: ExpeditionResultRepository | null = null;

  // Workflow repository instances
  private static workflowRepo: WorkflowRepository | null = null;
  private static workflowRuntimeStateRepo: WorkflowRuntimeStateRepository | null = null;

  // Mission clarity repository instance
  private static missionClarityRepo: MissionClarityRepository | null = null;

  // Initialization state tracking
  private static isInitialized = false;
  private static isInitializing = false;
  private static initializationError: Error | null = null;
  private static initializationPromise: Promise<void> | null = null;

  /**
   * Initialize all repositories asynchronously during application startup
   * This should be called once during server initialization, before socket connections
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.isInitializing) {
      if (this.initializationPromise) {
        return this.initializationPromise;
      }
      throw new Error('Repository initialization already in progress');
    }

    this.isInitializing = true;
    this.initializationError = null;

    this.initializationPromise = this.performInitialization();
    
    try {
      await this.initializationPromise;
      this.isInitialized = true;
      this.isInitializing = false;
      console.log('[RepositoryFactory] All repositories initialized successfully');
    } catch (error) {
      this.isInitializing = false;
      this.initializationError = error instanceof Error ? error : new Error('Unknown initialization error');
      console.error('[RepositoryFactory] Initialization failed:', this.initializationError);
      throw this.initializationError;
    }
  }

  /**
   * Perform the actual repository initialization
   */
  private static async performInitialization(): Promise<void> {
    console.log('[RepositoryFactory] Starting repository initialization...');

    try {
      // Initialize basic repositories first (no dependencies)
      this.agentRepo = new AgentRepository();
      this.userRepo = new UserRepository();
      this.channelRepo = new ChannelRepository();
      this.llmRepo = new LLMRepository();
      this.visionRepo = new VisionRepository();
      this.mcpServerOptionRepo = new MCPServerOptionRepository();
      this.missionRepo = new MissionRepository();

      // Initialize expedition repositories (no dependencies) (STUB IMPLEMENTATIONS)
      this.expeditionRepo = new ExpeditionRepository();
      this.expeditionTaskRepo = new ExpeditionTaskRepository();
      this.expeditionMessageRepo = new ExpeditionMessageRepository();
      this.expeditionResultRepo = new ExpeditionResultRepository();

      // Initialize workflow repositories (no dependencies)
      this.workflowRepo = new WorkflowRepository();
      this.workflowRuntimeStateRepo = new WorkflowRuntimeStateRepository();

      // Initialize mission clarity repository (no dependencies)
      this.missionClarityRepo = new MissionClarityRepository();

      // Initialize repositories with dependencies
      this.mcpServerConnectorRepo = new MCPServerConnectorRepository();
      this.starshipRepo = new StarshipRepository();

      // Initialize services that require database connections
      try {
        const connection = getConnection();
        this.agentTemplateService = new AgentTemplateService(connection);
      } catch (connectionError) {
        console.warn('[RepositoryFactory] Database connection not available for AgentTemplateService, will retry later');
        // Don't fail initialization for this - it can be retried later
      }

      console.log('[RepositoryFactory] Repository initialization completed successfully');
    } catch (error) {
      console.error('[RepositoryFactory] Repository initialization failed:', error);
      // Clean up any partially initialized repositories
      this.resetAll();
      throw error;
    }
  }

  /**
   * Check if repositories are initialized and throw error if not
   */
  private static ensureInitialized(): void {
    if (!this.isInitialized) {
      if (this.initializationError) {
        throw new Error(`Repository factory not initialized due to previous error: ${this.initializationError.message}`);
      }
      throw new Error('Repository factory not initialized. Call RepositoryFactory.initialize() during application startup.');
    }
  }

  /**
   * Get initialization status for monitoring
   */
  static getInitializationStatus(): {
    isInitialized: boolean;
    isInitializing: boolean;
    error: string | null;
    repositoryStatus: Record<string, boolean>;
  } {
    return {
      isInitialized: this.isInitialized,
      isInitializing: this.isInitializing,
      error: this.initializationError?.message || null,
      repositoryStatus: {
        agentRepo: this.agentRepo !== null,
        userRepo: this.userRepo !== null,
        channelRepo: this.channelRepo !== null,
        llmRepo: this.llmRepo !== null,
        starshipRepo: this.starshipRepo !== null,
        visionRepo: this.visionRepo !== null,
        mcpServerOptionRepo: this.mcpServerOptionRepo !== null,
        mcpServerConnectorRepo: this.mcpServerConnectorRepo !== null,
        missionRepo: this.missionRepo !== null,
        agentTemplateService: this.agentTemplateService !== null,
        expeditionRepo: this.expeditionRepo !== null,
        expeditionTaskRepo: this.expeditionTaskRepo !== null,
        expeditionMessageRepo: this.expeditionMessageRepo !== null,
        expeditionResultRepo: this.expeditionResultRepo !== null,
        workflowRepo: this.workflowRepo !== null,
        workflowRuntimeStateRepo: this.workflowRuntimeStateRepo !== null,
        missionClarityRepo: this.missionClarityRepo !== null,
      }
    };
  }

  // ========================================================================
  // SYNCHRONOUS REPOSITORY GETTERS - SOCKET COMPATIBLE
  // ========================================================================

  /**
   * Get AgentRepository instance (synchronous)
   */
  static getAgentRepository(): AgentRepository {
    this.ensureInitialized();
    if (!this.agentRepo) {
      throw new Error('AgentRepository not initialized');
    }
    return this.agentRepo;
  }

  /**
   * Get UserRepository instance (synchronous)
   */
  static getUserRepository(): UserRepository {
    this.ensureInitialized();
    if (!this.userRepo) {
      throw new Error('UserRepository not initialized');
    }
    return this.userRepo;
  }

  /**
   * Get ChannelRepository instance (synchronous)
   */
  static getChannelRepository(): ChannelRepository {
    this.ensureInitialized();
    if (!this.channelRepo) {
      throw new Error('ChannelRepository not initialized');
    }
    return this.channelRepo;
  }

  /**
   * Get LLMRepository instance (synchronous)
   */
  static getLLMRepository(): LLMRepository {
    this.ensureInitialized();
    if (!this.llmRepo) {
      throw new Error('LLMRepository not initialized');
    }
    return this.llmRepo;
  }

  /**
   * Get StarshipRepository instance (synchronous)
   */
  static getStarshipRepository(): StarshipRepository {
    this.ensureInitialized();
    if (!this.starshipRepo) {
      throw new Error('StarshipRepository not initialized');
    }
    return this.starshipRepo;
  }

  /**
   * Get VisionRepository instance (synchronous)
   */
  static getVisionRepository(): VisionRepository {
    this.ensureInitialized();
    if (!this.visionRepo) {
      throw new Error('VisionRepository not initialized');
    }
    return this.visionRepo;
  }

  /**
   * Get MCPServerOptionRepository instance (synchronous)
   */
  static getMCPServerOptionRepository(): MCPServerOptionRepository {
    this.ensureInitialized();
    if (!this.mcpServerOptionRepo) {
      throw new Error('MCPServerOptionRepository not initialized');
    }
    return this.mcpServerOptionRepo;
  }

  /**
   * Get MCPServerConnectorRepository instance (synchronous)
   */
  static getMCPServerConnectorRepository(): MCPServerConnectorRepository {
    this.ensureInitialized();
    if (!this.mcpServerConnectorRepo) {
      throw new Error('MCPServerConnectorRepository not initialized');
    }
    return this.mcpServerConnectorRepo;
  }

  /**
   * Get AgentTemplateService instance (synchronous)
   * Note: May return null if database connection was not available during initialization
   */
  static getAgentTemplateService(): AgentTemplateService | null {
    this.ensureInitialized();
    
    // Try to initialize if not available and connection is now available
    if (!this.agentTemplateService) {
      try {
        const connection = getConnection();
        this.agentTemplateService = new AgentTemplateService(connection);
        console.log('[RepositoryFactory] AgentTemplateService initialized on demand');
      } catch (error) {
        console.warn('[RepositoryFactory] AgentTemplateService still not available:', error);
        return null;
      }
    }
    
    return this.agentTemplateService;
  }

  /**
   * Get ExpeditionRepository instance (synchronous) (STUB IMPLEMENTATION)
   */
  static getExpeditionRepository(): ExpeditionRepository {
    this.ensureInitialized();
    if (!this.expeditionRepo) {
      throw new Error('ExpeditionRepository not initialized');
    }
    return this.expeditionRepo;
  }

  /**
   * Get ExpeditionTaskRepository instance (synchronous) (STUB IMPLEMENTATION)
   */
  static getExpeditionTaskRepository(): ExpeditionTaskRepository {
    this.ensureInitialized();
    if (!this.expeditionTaskRepo) {
      throw new Error('ExpeditionTaskRepository not initialized');
    }
    return this.expeditionTaskRepo;
  }

  /**
   * Get ExpeditionMessageRepository instance (synchronous) (STUB IMPLEMENTATION)
   */
  static getExpeditionMessageRepository(): ExpeditionMessageRepository {
    this.ensureInitialized();
    if (!this.expeditionMessageRepo) {
      throw new Error('ExpeditionMessageRepository not initialized');
    }
    return this.expeditionMessageRepo;
  }

  /**
   * Get ExpeditionResultRepository instance (synchronous) (STUB IMPLEMENTATION)
   */
  static getExpeditionResultRepository(): ExpeditionResultRepository {
    this.ensureInitialized();
    if (!this.expeditionResultRepo) {
      throw new Error('ExpeditionResultRepository not initialized');
    }
    return this.expeditionResultRepo;
  }

  /**
   * Get WorkflowRepository instance (synchronous)
   */
  static getWorkflowRepository(): WorkflowRepository {
    this.ensureInitialized();
    if (!this.workflowRepo) {
      throw new Error('WorkflowRepository not initialized');
    }
    return this.workflowRepo;
  }

  /**
   * Get WorkflowRuntimeStateRepository instance (synchronous)
   */
  static getWorkflowRuntimeStateRepository(): WorkflowRuntimeStateRepository {
    this.ensureInitialized();
    if (!this.workflowRuntimeStateRepo) {
      throw new Error('WorkflowRuntimeStateRepository not initialized');
    }
    return this.workflowRuntimeStateRepo;
  }

  /**
   * Get MissionRepository instance (synchronous)
   */
  static getMissionRepository(): MissionRepository {
    this.ensureInitialized();
    if (!this.missionRepo) {
      throw new Error('MissionRepository not initialized');
    }
    return this.missionRepo;
  }

  /**
   * Get MissionClarityRepository instance (synchronous)
   */
  static getMissionClarityRepository(): MissionClarityRepository {
    this.ensureInitialized();
    if (!this.missionClarityRepo) {
      throw new Error('MissionClarityRepository not initialized');
    }
    return this.missionClarityRepo;
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Reset all repository instances - useful for testing and cleanup
   */
  static resetAll(): void {
    console.log('[RepositoryFactory] Resetting all repository instances');

    // Clear all repository instances
    this.agentRepo = null;
    this.userRepo = null;
    this.channelRepo = null;
    this.llmRepo = null;
    this.starshipRepo = null;
    this.visionRepo = null;
    this.mcpServerOptionRepo = null;
    this.mcpServerConnectorRepo = null;
    this.missionRepo = null;
    this.agentTemplateService = null;
    this.expeditionRepo = null;
    this.expeditionTaskRepo = null;
    this.expeditionMessageRepo = null;
    this.expeditionResultRepo = null;
    this.workflowRepo = null;
    this.workflowRuntimeStateRepo = null;
    this.missionClarityRepo = null;

    // Reset initialization state
    this.isInitialized = false;
    this.isInitializing = false;
    this.initializationError = null;
    this.initializationPromise = null;

    console.log('[RepositoryFactory] All repository instances reset successfully');
  }

  /**
   * Validate that all critical repositories are properly initialized
   * Throws an error if any critical repository is missing
   */
  static validateCriticalRepositories(): void {
    this.ensureInitialized();
    
    const critical = [
      { name: 'starshipRepo', instance: this.starshipRepo },
      { name: 'expeditionRepo', instance: this.expeditionRepo },
      { name: 'expeditionTaskRepo', instance: this.expeditionTaskRepo },
      { name: 'expeditionMessageRepo', instance: this.expeditionMessageRepo },
      { name: 'mcpServerConnectorRepo', instance: this.mcpServerConnectorRepo }
    ];

    for (const repo of critical) {
      if (!repo.instance) {
        throw new Error(`Critical repository ${repo.name} is not initialized`);
      }
    }

    console.log('[RepositoryFactory] All critical repositories validated successfully');
  }

  /**
   * Check if the factory is ready for socket operations
   */
  static isReadyForSocketOperations(): boolean {
    try {
      this.validateCriticalRepositories();
      return true;
    } catch (error) {
      console.warn('[RepositoryFactory] Not ready for socket operations:', error);
      return false;
    }
  }

  /**
   * Get a health check summary
   */
  static getHealthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      initialized: boolean;
      criticalRepositoriesReady: boolean;
      agentTemplateServiceAvailable: boolean;
      error?: string;
    };
  } {
    const details = {
      initialized: this.isInitialized,
      criticalRepositoriesReady: false,
      agentTemplateServiceAvailable: this.agentTemplateService !== null,
      error: this.initializationError?.message
    };

    try {
      details.criticalRepositoriesReady = this.isReadyForSocketOperations();
    } catch (error) {
      details.error = error instanceof Error ? error.message : 'Unknown error';
    }

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (details.initialized && details.criticalRepositoriesReady) {
      status = details.agentTemplateServiceAvailable ? 'healthy' : 'degraded';
    } else {
      status = 'unhealthy';
    }

    return { status, details };
  }
}
