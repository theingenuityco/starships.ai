/// <reference types="jest" />
import { RepositoryFactory } from '../../src/repositories';
import { getConnection } from '../../src/connection';
import {
  AgentRepository,
  UserRepository,
  LLMRepository,
  StarshipRepository,
  VisionRepository,
  MCPServerOptionRepository,
  MCPServerConnectorRepository,
} from '../../src/repositories';
import { AgentTemplateService } from '../../src/services/AgentTemplateService';

// Mock all repository classes
jest.mock('../../src/repositories/AgentRepository');
jest.mock('../../src/repositories/UserRepository');
jest.mock('../../src/repositories/LLMRepository');
jest.mock('../../src/repositories/StarshipRepository');
jest.mock('../../src/repositories/VisionRepository');
jest.mock('../../src/repositories/MCPServerOptionRepository');
jest.mock('../../src/repositories/MCPServerConnectorRepository');
jest.mock('../../src/services/AgentTemplateService');
jest.mock('../../src/connection');

describe('RepositoryFactory', () => {
  let mockConnection: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset factory state
    RepositoryFactory.resetAll();

    // Mock connection
    mockConnection = {
      executeQuery: jest.fn(),
      executeWrite: jest.fn(),
    };
    (getConnection as jest.Mock).mockReturnValue(mockConnection);

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    RepositoryFactory.resetAll();
  });

  describe('Initialization', () => {
    it('should initialize repositories before they can be used', async () => {
      await RepositoryFactory.initialize();
      
      const agentRepo = RepositoryFactory.getAgentRepository();
      const userRepo = RepositoryFactory.getUserRepository();
      
      expect(agentRepo).toBeDefined();
      expect(userRepo).toBeDefined();
    });

    it('should throw error when accessing repositories before initialization', () => {
      expect(() => RepositoryFactory.getAgentRepository()).toThrow('Repository factory not initialized');
    });
  });

  describe('Repository Creation', () => {
    it('should create StarshipRepository', async () => {
      const starshipRepo = await RepositoryFactory.getStarshipRepository();

      expect(StarshipRepository).toHaveBeenCalledTimes(1);
      expect(starshipRepo).toBeDefined();
    });

    it('should create MCPServerConnectorRepository', async () => {
      const mcpRepo = await RepositoryFactory.getMCPServerConnectorRepository();

      expect(MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
      expect(mcpRepo).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle repository creation errors gracefully', async () => {
      // Reset and setup error mock
      RepositoryFactory.resetAll();
      (AgentRepository as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Repository creation failed');
      });

      await expect(RepositoryFactory.getAgentRepository()).rejects.toThrow(
        'Failed to initialize agentRepo: Repository creation failed'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to initialize agentRepo: Repository creation failed')
      );
    });

    it('should handle connection errors in AgentTemplateService', async () => {
      RepositoryFactory.resetAll();
      (getConnection as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Database connection failed');
      });

      await expect(RepositoryFactory.getAgentTemplateService()).rejects.toThrow(
        'Failed to initialize agentTemplateService: Database connection failed'
      );
    });
  });

  describe('Logging', () => {
    it('should log repository creation', async () => {
      await RepositoryFactory.getAgentRepository();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Creating AgentRepository instance')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully initialized agentRepo')
      );
    });

    it('should log repository creation', async () => {
      await RepositoryFactory.getStarshipRepository();

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('StarshipRepository'));
    });

    it('should log reset operations', () => {
      RepositoryFactory.resetAll();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Resetting all repository instances')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('All repository instances reset successfully')
      );
    });
  });

  describe('Thread Safety', () => {
    it('should handle concurrent initialization requests', async () => {
      // Start multiple concurrent requests
      const promises = [
        RepositoryFactory.getAgentRepository(),
        RepositoryFactory.getAgentRepository(),
        RepositoryFactory.getAgentRepository(),
      ];

      const results = await Promise.all(promises);

      // All should return the same instance
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);

      // Repository should only be created once
      expect(AgentRepository).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent initialization with dependencies', async () => {
      const promises = [
        RepositoryFactory.getStarshipRepository(),
        RepositoryFactory.getStarshipRepository(),
        RepositoryFactory.getMCPServerConnectorRepository(),
      ];

      const results = await Promise.all(promises);

      // StarshipRepository instances should be the same
      expect(results[0]).toBe(results[1]);

      // Should only create one instance of each
      expect(StarshipRepository).toHaveBeenCalledTimes(1);
      expect(MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
    });
  });

  describe('Utility Methods', () => {
    describe('getInitializationStatus', () => {
      it('should return correct initialization status', async () => {
        let status = RepositoryFactory.getInitializationStatus();
        expect(status.isInitialized).toBe(false);
        expect(status.repositoryStatus.agentRepo).toBe(false);

        await RepositoryFactory.initialize();

        status = RepositoryFactory.getInitializationStatus();
        expect(status.isInitialized).toBe(true);
        expect(status.repositoryStatus.agentRepo).toBe(true);
      });
    });

    describe('initialize', () => {
      it('should initialize all repositories in correct order', async () => {
        await RepositoryFactory.initialize();

        // Verify all repositories were created
        expect(AgentRepository).toHaveBeenCalledTimes(1);
        expect(UserRepository).toHaveBeenCalledTimes(1);
        expect(LLMRepository).toHaveBeenCalledTimes(1);
        expect(StarshipRepository).toHaveBeenCalledTimes(1);
        expect(VisionRepository).toHaveBeenCalledTimes(1);
        expect(MCPServerOptionRepository).toHaveBeenCalledTimes(1);
        expect(MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
        expect(AgentTemplateService).toHaveBeenCalledTimes(1);
      });
    });

    describe('validateCriticalRepositories', () => {
      it('should pass validation when critical repositories are initialized', async () => {
        await RepositoryFactory.getMCPServerConnectorRepository();
        await RepositoryFactory.getStarshipRepository();

        expect(() => RepositoryFactory.validateCriticalRepositories()).not.toThrow();

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('All critical repositories validated successfully')
        );
      });

      it('should throw error when critical repositories are not initialized', () => {
        expect(() => RepositoryFactory.validateCriticalRepositories()).toThrow(
          'Critical repository mcpServerConnectorRepo is not initialized'
        );
      });
    });

    describe('resetAll', () => {
      it('should reset all repository instances', async () => {
        // Initialize factory
        await RepositoryFactory.initialize();

        let status = RepositoryFactory.getInitializationStatus();
        expect(status.isInitialized).toBe(true);

        // Reset all
        RepositoryFactory.resetAll();

        status = RepositoryFactory.getInitializationStatus();
        expect(status.isInitialized).toBe(false);
      });
    });
  });

  describe('All Repository Getters', () => {
    it('should create AgentRepository', async () => {
      const repo = await RepositoryFactory.getAgentRepository();
      expect(repo).toBeDefined();
      expect(AgentRepository).toHaveBeenCalledTimes(1);
    });

    it('should create UserRepository', async () => {
      const repo = await RepositoryFactory.getUserRepository();
      expect(repo).toBeDefined();
      expect(UserRepository).toHaveBeenCalledTimes(1);
    });


    it('should create LLMRepository', async () => {
      const repo = await RepositoryFactory.getLLMRepository();
      expect(repo).toBeDefined();
      expect(LLMRepository).toHaveBeenCalledTimes(1);
    });

    it('should create VisionRepository', async () => {
      const repo = await RepositoryFactory.getVisionRepository();
      expect(repo).toBeDefined();
      expect(VisionRepository).toHaveBeenCalledTimes(1);
    });

    it('should create MCPServerOptionRepository', async () => {
      const repo = await RepositoryFactory.getMCPServerOptionRepository();
      expect(repo).toBeDefined();
      expect(MCPServerOptionRepository).toHaveBeenCalledTimes(1);
    });

    it('should create MCPServerConnectorRepository', async () => {
      const repo = await RepositoryFactory.getMCPServerConnectorRepository();
      expect(repo).toBeDefined();
      expect(MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
    });

    it('should create StarshipRepository', async () => {
      const repo = await RepositoryFactory.getStarshipRepository();
      expect(repo).toBeDefined();
      expect(StarshipRepository).toHaveBeenCalledTimes(1);
    });

    it('should create AgentTemplateService with connection', async () => {
      const service = await RepositoryFactory.getAgentTemplateService();
      expect(service).toBeDefined();
      expect(AgentTemplateService).toHaveBeenCalledTimes(1);
      expect(AgentTemplateService).toHaveBeenCalledWith(mockConnection);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete factory lifecycle', async () => {
      // Initialize all repositories
      await RepositoryFactory.initialize();

      // Validate critical repositories
      RepositoryFactory.validateCriticalRepositories();

      // Check status
      const status = RepositoryFactory.getInitializationStatus();
      expect(status.isInitialized).toBe(true);

      // Reset everything
      RepositoryFactory.resetAll();

      // Verify reset
      const resetStatus = RepositoryFactory.getInitializationStatus();
      expect(resetStatus.isInitialized).toBe(false);
    });

    it('should check socket operation readiness', async () => {
      await RepositoryFactory.initialize();
      
      const isReady = RepositoryFactory.isReadyForSocketOperations();
      expect(isReady).toBe(true);
    });
  });
});
