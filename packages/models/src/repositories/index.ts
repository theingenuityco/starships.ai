import { AgentRepository } from './AgentRepository';
import { UserRepository } from './UserRepository';
import { LLMRepository } from './LLMRepository';
import { Neo4jAgentTemplateRepository } from './AgentTemplateRepository';
import { AgentTemplateService } from '../services/AgentTemplateService';
import { getConnection } from '../helpers/database';
import { NotFoundError } from '../helpers/errors';

export { AgentRepository } from './AgentRepository';
export { UserRepository } from './UserRepository';
export { LLMRepository } from './LLMRepository';

// NEW: Aether Core Repositories
export { StarshipRepository } from './StarshipRepository';
export { VisionRepository } from './VisionRepository';
export { MissionRepository } from './MissionRepository';
export { MissionMessageRepository } from './MissionMessageRepository';


// Export workflow repositories
export { WorkflowRepository } from './WorkflowRepository';
export { WorkflowNodeRepository } from './WorkflowNodeRepository';
export { WorkflowEdgeRepository } from './WorkflowEdgeRepository';
export { WorkflowRuntimeStateRepository } from './WorkflowRuntimeStateRepository';

// Export mission clarity repository
export { MissionClarityRepository } from './MissionClarityRepository';

// Export native tool API key repository
export { NativeToolApiKeyRepository } from './NativeToolApiKeyRepository';

// Export waitlist repository
export { WaitlistRepository } from './WaitlistRepository';

// Import the new repositories for the factory
import { StarshipRepository } from './StarshipRepository';
import { VisionRepository } from './VisionRepository';
import { MissionRepository } from './MissionRepository';
import { MissionMessageRepository } from './MissionMessageRepository';
import { WaitlistRepository } from './WaitlistRepository';


// Import workflow repositories
import { WorkflowRepository } from './WorkflowRepository';
import { WorkflowNodeRepository } from './WorkflowNodeRepository';
import { WorkflowEdgeRepository } from './WorkflowEdgeRepository';
import { WorkflowRuntimeStateRepository } from './WorkflowRuntimeStateRepository';

// Import mission clarity repository
import { MissionClarityRepository } from './MissionClarityRepository';

// Import native tool API key repository
import { NativeToolApiKeyRepository } from './NativeToolApiKeyRepository';

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
  private static llmRepo: LLMRepository | null = null;

  // Aether Core repository instances
  private static starshipRepo: StarshipRepository | null = null;
  private static visionRepo: VisionRepository | null = null;
  private static missionRepo: MissionRepository | null = null;
  private static missionMessageRepo: MissionMessageRepository | null = null;
  private static agentTemplateService: AgentTemplateService | null = null;


  // Workflow repository instances
  private static workflowRepo: WorkflowRepository | null = null;
  private static workflowNodeRepo: WorkflowNodeRepository | null = null;
  private static workflowEdgeRepo: WorkflowEdgeRepository | null = null;
  private static workflowRuntimeStateRepo: WorkflowRuntimeStateRepository | null = null;

  // Mission clarity repository instance
  private static missionClarityRepo: MissionClarityRepository | null = null;

  // Native tool API key repository instance
  private static nativeToolApiKeyRepo: NativeToolApiKeyRepository | null = null;

  // Waitlist repository instance
  private static waitlistRepo: WaitlistRepository | null = null;

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
      this.llmRepo = new LLMRepository();
      this.visionRepo = new VisionRepository();
      this.missionRepo = new MissionRepository();
      this.missionMessageRepo = new MissionMessageRepository();


      // Initialize workflow repositories (no dependencies)
      this.workflowRepo = new WorkflowRepository();
      this.workflowNodeRepo = new WorkflowNodeRepository();
      this.workflowEdgeRepo = new WorkflowEdgeRepository();
      this.workflowRuntimeStateRepo = new WorkflowRuntimeStateRepository();

      // Initialize mission clarity repository (no dependencies)
      this.missionClarityRepo = new MissionClarityRepository();

      // Initialize native tool API key repository (no dependencies)
      this.nativeToolApiKeyRepo = new NativeToolApiKeyRepository();

      // Initialize repositories with dependencies
      this.starshipRepo = new StarshipRepository();

      // Initialize services that require database connections
      try {
        const connection = getConnection();
        this.agentTemplateService = new AgentTemplateService(connection);
        this.waitlistRepo = new WaitlistRepository(connection);
      } catch (connectionError) {
        console.warn('[RepositoryFactory] Database connection not available for AgentTemplateService and WaitlistRepository, will retry later');
        // Don't fail initialization for these - they can be retried later
        this.waitlistRepo = null;
        this.agentTemplateService = null;
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
        llmRepo: this.llmRepo !== null,
        starshipRepo: this.starshipRepo !== null,
        visionRepo: this.visionRepo !== null,
        missionRepo: this.missionRepo !== null,
        missionMessageRepo: this.missionMessageRepo !== null,
        agentTemplateService: this.agentTemplateService !== null,
        workflowRepo: this.workflowRepo !== null,
        workflowNodeRepo: this.workflowNodeRepo !== null,
        workflowEdgeRepo: this.workflowEdgeRepo !== null,
        workflowRuntimeStateRepo: this.workflowRuntimeStateRepo !== null,
        missionClarityRepo: this.missionClarityRepo !== null,
        nativeToolApiKeyRepo: this.nativeToolApiKeyRepo !== null,
        waitlistRepo: this.waitlistRepo !== null,
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
   * Get MissionMessageRepository instance (synchronous)
   */
  static getMissionMessageRepository(): MissionMessageRepository {
    this.ensureInitialized();
    if (!this.missionMessageRepo) {
      throw new Error('MissionMessageRepository not initialized');
    }
    return this.missionMessageRepo;
  }

  /**
   * Get WorkflowNodeRepository instance (synchronous)
   */
  static getWorkflowNodeRepository(): WorkflowNodeRepository {
    this.ensureInitialized();
    if (!this.workflowNodeRepo) {
      throw new Error('WorkflowNodeRepository not initialized');
    }
    return this.workflowNodeRepo;
  }

  /**
   * Get WorkflowEdgeRepository instance (synchronous)
   */
  static getWorkflowEdgeRepository(): WorkflowEdgeRepository {
    this.ensureInitialized();
    if (!this.workflowEdgeRepo) {
      throw new Error('WorkflowEdgeRepository not initialized');
    }
    return this.workflowEdgeRepo;
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

  /**
   * Get NativeToolApiKeyRepository instance (synchronous)
   */
  static getNativeToolApiKeyRepository(): NativeToolApiKeyRepository {
    this.ensureInitialized();
    if (!this.nativeToolApiKeyRepo) {
      throw new Error('NativeToolApiKeyRepository not initialized');
    }
    return this.nativeToolApiKeyRepo;
  }

  /**
   * Get WaitlistRepository instance (synchronous)
   * Note: Will attempt lazy initialization if not available
   */
  static getWaitlistRepository(): WaitlistRepository {
    this.ensureInitialized();
    
    // Try to initialize if not available and connection is now available
    if (!this.waitlistRepo) {
      try {
        const connection = getConnection();
        this.waitlistRepo = new WaitlistRepository(connection);
        console.log('[RepositoryFactory] WaitlistRepository initialized on demand');
      } catch (error) {
        console.error('[RepositoryFactory] Failed to initialize WaitlistRepository:', error);
        throw new Error('WaitlistRepository not initialized - database connection may be unavailable');
      }
    }
    
    return this.waitlistRepo;
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
    this.llmRepo = null;
    this.starshipRepo = null;
    this.visionRepo = null;
    this.missionRepo = null;
    this.missionMessageRepo = null;
    this.agentTemplateService = null;
    this.workflowRepo = null;
    this.workflowNodeRepo = null;
    this.workflowEdgeRepo = null;
    this.workflowRuntimeStateRepo = null;
    this.missionClarityRepo = null;
    this.nativeToolApiKeyRepo = null;
    this.waitlistRepo = null;

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
      { name: 'starshipRepo', instance: this.starshipRepo }
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
