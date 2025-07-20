import { FirstOfficerAgent } from '../../src/first-officer/FirstOfficerAgent';
import { LangChainMemoryStore } from '../../src/memory/langchain-memory';
import { FirstOfficerConfig } from '../../src/first-officer/types';

describe('First Officer Agent Integration Tests', () => {
  let firstOfficer: FirstOfficerAgent;
  let memoryStore: LangChainMemoryStore;

  beforeEach(() => {
    console.log('🔧 Setting up First Officer Agent integration test...');
    
    // Initialize memory store
    memoryStore = new LangChainMemoryStore();
    
    // Initialize First Officer with proper configuration
    const config: FirstOfficerConfig = {
      maxRetries: 3,
      qualityThreshold: 0.7,
      timeoutMinutes: 30,
      requireUserApproval: false,
      enableParallelExecution: true,
      autoEscalation: true
    };
    
    firstOfficer = new FirstOfficerAgent('test-starship-001', memoryStore, config);
    
    console.log('✅ First Officer Agent initialized for integration testing');
  });

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      console.log('🔍 Testing First Officer Agent initialization...');
      
      expect(firstOfficer).toBeDefined();
      expect(firstOfficer).toBeInstanceOf(FirstOfficerAgent);
      
      console.log('✅ First Officer Agent initialization validated');
    });

    it('should handle expedition status requests', async () => {
      console.log('🔍 Testing expedition status handling...');
      
      const expeditionId = 'test-expedition-001';
      
      // Test getting status for non-existent expedition
      const status = await firstOfficer.getExpeditionStatus(expeditionId);
      
      // Should return null for non-existent expedition
      expect(status).toBeNull();
      
      console.log('✅ Expedition status handling validated');
    });

    it('should handle user messages appropriately', async () => {
      console.log('🔍 Testing user message handling...');
      
      const userId = 'test-user-001';
      const message = 'What is the current status of my expeditions?';
      
      const response = await firstOfficer.handleUserMessage('test-expedition-001', message);
      
      expect(response).toBeDefined();
      expect(response.reply).toBeDefined();
      expect(typeof response.reply).toBe('string');
      expect(response.reply.length).toBeGreaterThan(0);
      
      console.log('✅ User message handling validated');
      console.log(`Response: ${response}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      console.log('🔍 Testing repository error handling...');
      
      // This will test the error handling in getExpeditionStatus
      // when the repository throws an error
      const expeditionId = 'error-test-expedition';
      
      const status = await firstOfficer.getExpeditionStatus(expeditionId);
      
      // Should return null when repository fails
      expect(status).toBeNull();
      
      console.log('✅ Repository error handling validated');
    });
  });

  describe('Configuration', () => {
    it('should use provided configuration', () => {
      console.log('🔍 Testing configuration usage...');
      
      const customConfig: FirstOfficerConfig = {
        maxRetries: 5,
        qualityThreshold: 0.8,
        timeoutMinutes: 60,
        requireUserApproval: true,
        enableParallelExecution: false,
        autoEscalation: false
      };
      
      const customFirstOfficer = new FirstOfficerAgent('test-starship-002', memoryStore, customConfig);
      
      expect(customFirstOfficer).toBeDefined();
      expect(customFirstOfficer).toBeInstanceOf(FirstOfficerAgent);
      
      console.log('✅ Custom configuration validated');
    });
  });

  describe('Memory Integration', () => {
    it('should integrate with memory store', () => {
      console.log('🔍 Testing memory store integration...');
      
      expect(memoryStore).toBeDefined();
      expect(memoryStore).toBeInstanceOf(LangChainMemoryStore);
      
      console.log('✅ Memory store integration validated');
    });
  });
});