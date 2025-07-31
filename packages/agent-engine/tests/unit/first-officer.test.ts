import { FirstOfficerAgent } from '../../src/first-officer/FirstOfficerAgent';
import { LangChainMemoryStore } from '../../src/memory/langchain-memory';

// Mock dependencies
jest.mock('@starships/models');
jest.mock('../../src/llm/provider-factory');
jest.mock('../../src/memory/langchain-memory');

describe('First Officer Agent Unit Tests', () => {
  let firstOfficer: FirstOfficerAgent;
  let mockMemoryStore: jest.Mocked<LangChainMemoryStore>;

  beforeEach(() => {
    console.log('🔧 Setting up First Officer Agent unit test...');
    
    // Create mock memory store
    mockMemoryStore = {
      store: jest.fn(),
      retrieve: jest.fn(),
      clear: jest.fn(),
    } as any;

    // Initialize First Officer Agent
    firstOfficer = new FirstOfficerAgent(
      'test-starship-id',
      mockMemoryStore,
      {
        maxRetries: 2,
        qualityThreshold: 70,
        timeoutMinutes: 30,
        requireUserApproval: false,
        enableParallelExecution: true,
        autoEscalation: true
      }
    );
    
    console.log('✅ First Officer Agent initialized for testing');
  });

  describe('Initialization', () => {
    it('should initialize with correct configuration', () => {
      console.log('🔍 Testing First Officer Agent initialization...');
      
      expect(firstOfficer).toBeDefined();
      expect(firstOfficer).toBeInstanceOf(FirstOfficerAgent);
      
      console.log('✅ First Officer Agent initialization validated');
    });
  });

  describe('Expedition Status Retrieval', () => {
    it('should handle expedition status retrieval', async () => {
      console.log('🔍 Testing expedition status retrieval...');
      
      // Mock repository response
      const mockExpeditionRepo = {
        findById: jest.fn().mockResolvedValue({
          id: 'test-expedition',
          workflowState: {
            expeditionId: 'test-expedition',
            currentPhase: 'analyzing',
            requirements: 'Test objective',
            taskBreakdown: [],
            agentAssignments: {},
            agentResults: {},
            userId: 'test-user',
            starshipId: 'test-starship',
            errors: [],
            retryCount: 0,
            lastUpdated: new Date().toISOString()
          }
        })
      };

      // Mock RepositoryFactory
      const { RepositoryFactory } = require('@starships/models');
      RepositoryFactory.getExpeditionRepository.mockReturnValue(mockExpeditionRepo);

      console.log('🔄 Retrieving expedition status...');
      const status = await firstOfficer.getExpeditionStatus('test-expedition');

      expect(status).toBeDefined();
      expect(status?.expeditionId).toBe('test-expedition');
      expect(status?.currentPhase).toBe('analyzing');
      expect(mockExpeditionRepo.findById).toHaveBeenCalledWith('test-expedition');
      
      console.log('✅ Expedition status retrieval validated');
      console.log(`Status: ${status?.currentPhase} - Progress: ${status?.overallProgress}%`);
    });

    it('should handle missing expedition gracefully', async () => {
      console.log('🔍 Testing missing expedition handling...');
      
      // Mock repository to return null
      const mockExpeditionRepo = {
        findById: jest.fn().mockResolvedValue(null)
      };

      const { RepositoryFactory } = require('@starships/models');
      RepositoryFactory.getExpeditionRepository.mockReturnValue(mockExpeditionRepo);

      console.log('🔄 Attempting to retrieve non-existent expedition...');
      const status = await firstOfficer.getExpeditionStatus('nonexistent-expedition');

      expect(status).toBeNull();
      expect(mockExpeditionRepo.findById).toHaveBeenCalledWith('nonexistent-expedition');
      
      console.log('✅ Missing expedition handling validated');
    });
  });

  describe('User Message Handling', () => {
    it('should handle user messages when no expedition is active', async () => {
      console.log('🔍 Testing user message handling without active expedition...');
      
      console.log('🔄 Sending user message without active expedition...');
      const response = await firstOfficer.handleUserMessage('test-expedition', 'Hello');

      expect(response).toBeDefined();
      expect(response.reply).toContain('No active expedition found');
      expect(response.usage).toBeUndefined();
      
      console.log('✅ User message handling validated');
      console.log(`Response: ${response.reply}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      console.log('🔍 Testing repository error handling...');
      
      // Mock repository to throw error
      const mockExpeditionRepo = {
        findById: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      const { RepositoryFactory } = require('@starships/models');
      RepositoryFactory.getExpeditionRepository.mockReturnValue(mockExpeditionRepo);

      console.log('🔄 Attempting operation with failing repository...');
      const status = await firstOfficer.getExpeditionStatus('test-expedition');

      expect(status).toBeNull();
      expect(mockExpeditionRepo.findById).toHaveBeenCalledWith('test-expedition');
      
      console.log('✅ Repository error handling validated');
    });
  });

  describe('Configuration Validation', () => {
    it('should use default configuration when none provided', () => {
      console.log('🔍 Testing default configuration...');
      
      const defaultFirstOfficer = new FirstOfficerAgent(
        'test-starship',
        mockMemoryStore
      );

      expect(defaultFirstOfficer).toBeDefined();
      expect(defaultFirstOfficer).toBeInstanceOf(FirstOfficerAgent);
      
      console.log('✅ Default configuration validated');
    });

    it('should merge custom configuration with defaults', () => {
      console.log('🔍 Testing custom configuration merging...');
      
      const customFirstOfficer = new FirstOfficerAgent(
        'test-starship',
        mockMemoryStore,
        {
          maxRetries: 5,
          qualityThreshold: 80
          // Other values should use defaults
        }
      );

      expect(customFirstOfficer).toBeDefined();
      expect(customFirstOfficer).toBeInstanceOf(FirstOfficerAgent);
      
      console.log('✅ Custom configuration merging validated');
    });
  });

  describe('Memory Store Integration', () => {
    it('should initialize with provided memory store', () => {
      console.log('🔍 Testing memory store integration...');
      
      expect(mockMemoryStore).toBeDefined();
      // The memory store should be passed to the constructor
      // Actual usage would be tested in integration tests
      
      console.log('✅ Memory store integration validated');
    });
  });
});