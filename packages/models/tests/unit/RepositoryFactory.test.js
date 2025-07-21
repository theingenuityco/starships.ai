"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/// <reference types="jest" />
const repositories_1 = require("../../src/repositories");
const connection_1 = require("../../src/connection");
const repositories_2 = require("../../src/repositories");
const AgentTemplateService_1 = require("../../src/services/AgentTemplateService");
// Mock all repository classes
jest.mock('../../src/repositories/AgentRepository');
jest.mock('../../src/repositories/UserRepository');
jest.mock('../../src/repositories/ChannelRepository');
jest.mock('../../src/repositories/LLMRepository');
jest.mock('../../src/repositories/StarshipRepository');
jest.mock('../../src/repositories/CodexRepository');
jest.mock('../../src/repositories/VisionRepository');
jest.mock('../../src/repositories/ConstraintRepository');
jest.mock('../../src/repositories/ConceptRepository');
jest.mock('../../src/repositories/MetaAnchorRepository');
jest.mock('../../src/repositories/MCPServerOptionRepository');
jest.mock('../../src/repositories/MCPServerConnectorRepository');
jest.mock('../../src/services/AgentTemplateService');
jest.mock('../../src/connection');
describe('RepositoryFactory', () => {
    let mockConnection;
    let consoleLogSpy;
    let consoleErrorSpy;
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset factory state
        repositories_1.RepositoryFactory.resetAll();
        // Mock connection
        mockConnection = {
            executeQuery: jest.fn(),
            executeWrite: jest.fn(),
        };
        connection_1.getConnection.mockReturnValue(mockConnection);
        // Spy on console methods
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });
    afterEach(() => {
        jest.restoreAllMocks();
        repositories_1.RepositoryFactory.resetAll();
    });
    describe('Singleton Pattern', () => {
        it('should return the same instance for multiple calls to getAgentRepository', async () => {
            const repo1 = await repositories_1.RepositoryFactory.getAgentRepository();
            const repo2 = await repositories_1.RepositoryFactory.getAgentRepository();
            expect(repo1).toBe(repo2);
            expect(repositories_2.AgentRepository).toHaveBeenCalledTimes(1);
        });
        it('should return the same instance for multiple calls to getMCPServerConnectorRepository', async () => {
            const repo1 = await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
            const repo2 = await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
            expect(repo1).toBe(repo2);
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
        });
        it('should return the same instance for multiple calls to getStarshipRepository', async () => {
            const repo1 = await repositories_1.RepositoryFactory.getStarshipRepository();
            const repo2 = await repositories_1.RepositoryFactory.getStarshipRepository();
            expect(repo1).toBe(repo2);
            expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
        });
    });
    describe('Dependency Injection', () => {
        it('should inject MCPServerConnectorRepository into StarshipRepository', async () => {
            const starshipRepo = await repositories_1.RepositoryFactory.getStarshipRepository();
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.StarshipRepository).toHaveBeenCalledWith(expect.any(Object));
        });
        it('should initialize MCPServerConnectorRepository before StarshipRepository', async () => {
            const starshipRepo = await repositories_1.RepositoryFactory.getStarshipRepository();
            // Verify that MCPServerConnectorRepository was created first
            const mcpConnectorCall = repositories_2.MCPServerConnectorRepository.mock
                .invocationCallOrder[0];
            const starshipCall = repositories_2.StarshipRepository.mock.invocationCallOrder[0];
            expect(mcpConnectorCall).toBeLessThan(starshipCall);
        });
    });
    describe('Error Handling', () => {
        it('should handle repository creation errors gracefully', async () => {
            // Reset and setup error mock
            repositories_1.RepositoryFactory.resetAll();
            repositories_2.AgentRepository.mockImplementationOnce(() => {
                throw new Error('Repository creation failed');
            });
            await expect(repositories_1.RepositoryFactory.getAgentRepository()).rejects.toThrow('Failed to initialize agentRepo: Repository creation failed');
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize agentRepo: Repository creation failed'));
        });
        it('should handle connection errors in AgentTemplateService', async () => {
            repositories_1.RepositoryFactory.resetAll();
            connection_1.getConnection.mockImplementationOnce(() => {
                throw new Error('Database connection failed');
            });
            await expect(repositories_1.RepositoryFactory.getAgentTemplateService()).rejects.toThrow('Failed to initialize agentTemplateService: Database connection failed');
        });
    });
    describe('Logging', () => {
        it('should log repository creation', async () => {
            await repositories_1.RepositoryFactory.getAgentRepository();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Creating AgentRepository instance'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully initialized agentRepo'));
        });
        it('should log dependency injection', async () => {
            await repositories_1.RepositoryFactory.getStarshipRepository();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Creating StarshipRepository instance with MCPServerConnectorRepository dependency'));
        });
        it('should log reset operations', () => {
            repositories_1.RepositoryFactory.resetAll();
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Resetting all repository instances'));
            expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All repository instances reset successfully'));
        });
    });
    describe('Thread Safety', () => {
        it('should handle concurrent initialization requests', async () => {
            // Start multiple concurrent requests
            const promises = [
                repositories_1.RepositoryFactory.getAgentRepository(),
                repositories_1.RepositoryFactory.getAgentRepository(),
                repositories_1.RepositoryFactory.getAgentRepository(),
            ];
            const results = await Promise.all(promises);
            // All should return the same instance
            expect(results[0]).toBe(results[1]);
            expect(results[1]).toBe(results[2]);
            // Repository should only be created once
            expect(repositories_2.AgentRepository).toHaveBeenCalledTimes(1);
        });
        it('should handle concurrent initialization with dependencies', async () => {
            const promises = [
                repositories_1.RepositoryFactory.getStarshipRepository(),
                repositories_1.RepositoryFactory.getStarshipRepository(),
                repositories_1.RepositoryFactory.getMCPServerConnectorRepository(),
            ];
            const results = await Promise.all(promises);
            // StarshipRepository instances should be the same
            expect(results[0]).toBe(results[1]);
            // Should only create one instance of each
            expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
        });
    });
    describe('Utility Methods', () => {
        describe('getInitializationStatus', () => {
            it('should return correct initialization status', async () => {
                let status = repositories_1.RepositoryFactory.getInitializationStatus();
                expect(status.agentRepo).toBe(false);
                expect(status.mcpServerConnectorRepo).toBe(false);
                await repositories_1.RepositoryFactory.getAgentRepository();
                await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
                status = repositories_1.RepositoryFactory.getInitializationStatus();
                expect(status.agentRepo).toBe(true);
                expect(status.mcpServerConnectorRepo).toBe(true);
            });
        });
        describe('hasActiveInitializations', () => {
            it('should return false when no initializations are active', () => {
                expect(repositories_1.RepositoryFactory.hasActiveInitializations()).toBe(false);
            });
        });
        describe('getActiveInitializations', () => {
            it('should return empty array when no initializations are active', () => {
                expect(repositories_1.RepositoryFactory.getActiveInitializations()).toEqual([]);
            });
        });
        describe('initializeAll', () => {
            it('should initialize all repositories in correct order', async () => {
                await repositories_1.RepositoryFactory.initializeAll();
                // Verify all repositories were created
                expect(repositories_2.AgentRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.UserRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.ChannelRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.LLMRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.CodexRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.VisionRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.ConstraintRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.ConceptRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.MetaAnchorRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.MCPServerOptionRepository).toHaveBeenCalledTimes(1);
                expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
                expect(AgentTemplateService_1.AgentTemplateService).toHaveBeenCalledTimes(1);
                expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Starting initialization of all repositories'));
                expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All repositories initialized successfully'));
            });
        });
        describe('validateCriticalRepositories', () => {
            it('should pass validation when critical repositories are initialized', async () => {
                await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
                await repositories_1.RepositoryFactory.getStarshipRepository();
                expect(() => repositories_1.RepositoryFactory.validateCriticalRepositories()).not.toThrow();
                expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('All critical repositories validated successfully'));
            });
            it('should throw error when critical repositories are not initialized', () => {
                expect(() => repositories_1.RepositoryFactory.validateCriticalRepositories()).toThrow('Critical repository mcpServerConnectorRepo is not initialized');
            });
        });
        describe('resetAll', () => {
            it('should reset all repository instances and locks', async () => {
                // Initialize some repositories
                await repositories_1.RepositoryFactory.getAgentRepository();
                await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
                let status = repositories_1.RepositoryFactory.getInitializationStatus();
                expect(status.agentRepo).toBe(true);
                expect(status.mcpServerConnectorRepo).toBe(true);
                // Reset all
                repositories_1.RepositoryFactory.resetAll();
                status = repositories_1.RepositoryFactory.getInitializationStatus();
                expect(status.agentRepo).toBe(false);
                expect(status.mcpServerConnectorRepo).toBe(false);
                expect(repositories_1.RepositoryFactory.hasActiveInitializations()).toBe(false);
            });
        });
    });
    describe('All Repository Getters', () => {
        it('should create AgentRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getAgentRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.AgentRepository).toHaveBeenCalledTimes(1);
        });
        it('should create UserRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getUserRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.UserRepository).toHaveBeenCalledTimes(1);
        });
        it('should create ChannelRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getChannelRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.ChannelRepository).toHaveBeenCalledTimes(1);
        });
        it('should create LLMRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getLLMRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.LLMRepository).toHaveBeenCalledTimes(1);
        });
        it('should create CodexRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getCodexRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.CodexRepository).toHaveBeenCalledTimes(1);
        });
        it('should create VisionRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getVisionRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.VisionRepository).toHaveBeenCalledTimes(1);
        });
        it('should create ConstraintRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getConstraintRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.ConstraintRepository).toHaveBeenCalledTimes(1);
        });
        it('should create ConceptRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getConceptRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.ConceptRepository).toHaveBeenCalledTimes(1);
        });
        it('should create MetaAnchorRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getMetaAnchorRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.MetaAnchorRepository).toHaveBeenCalledTimes(1);
        });
        it('should create MCPServerOptionRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getMCPServerOptionRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.MCPServerOptionRepository).toHaveBeenCalledTimes(1);
        });
        it('should create MCPServerConnectorRepository', async () => {
            const repo = await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
        });
        it('should create StarshipRepository with dependency', async () => {
            const repo = await repositories_1.RepositoryFactory.getStarshipRepository();
            expect(repo).toBeDefined();
            expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
        });
        it('should create AgentTemplateService with connection', async () => {
            const service = await repositories_1.RepositoryFactory.getAgentTemplateService();
            expect(service).toBeDefined();
            expect(AgentTemplateService_1.AgentTemplateService).toHaveBeenCalledTimes(1);
            expect(AgentTemplateService_1.AgentTemplateService).toHaveBeenCalledWith(mockConnection);
        });
    });
    describe('Integration Scenarios', () => {
        it('should handle complete factory lifecycle', async () => {
            // Initialize all repositories
            await repositories_1.RepositoryFactory.initializeAll();
            // Validate critical repositories
            repositories_1.RepositoryFactory.validateCriticalRepositories();
            // Check status
            const status = repositories_1.RepositoryFactory.getInitializationStatus();
            expect(Object.values(status).every(Boolean)).toBe(true);
            // Reset everything
            repositories_1.RepositoryFactory.resetAll();
            // Verify reset
            const resetStatus = repositories_1.RepositoryFactory.getInitializationStatus();
            expect(Object.values(resetStatus).every((val) => !val)).toBe(true);
        });
        it('should handle mixed initialization patterns', async () => {
            // Initialize some repositories individually
            await repositories_1.RepositoryFactory.getAgentRepository();
            await repositories_1.RepositoryFactory.getMCPServerConnectorRepository();
            // Then initialize all (should not recreate existing ones)
            await repositories_1.RepositoryFactory.initializeAll();
            // Verify singleton behavior maintained
            expect(repositories_2.AgentRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.MCPServerConnectorRepository).toHaveBeenCalledTimes(1);
            expect(repositories_2.StarshipRepository).toHaveBeenCalledTimes(1);
        });
    });
});
//# sourceMappingURL=RepositoryFactory.test.js.map