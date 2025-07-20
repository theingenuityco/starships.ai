// Test setup for Agent Engine

// Mock external dependencies
jest.mock('@starships/models', () => ({
  RepositoryFactory: {
    getExpeditionRepository: jest.fn(),
    getExpeditionTaskRepository: jest.fn(),
    getExpeditionMessageRepository: jest.fn(),
    getExpeditionResultRepository: jest.fn(),
  }
}));

jest.mock('../src/llm/provider-factory', () => ({
  ProviderFactory: {
    getProvider: jest.fn().mockResolvedValue({
      complete: jest.fn().mockResolvedValue({
        reply: '{"complexity": "moderate", "estimatedDuration": 60, "requiredSkills": ["general"], "riskFactors": [], "successCriteria": ["complete"], "approach": "hybrid"}'
      })
    })
  }
}));

// Global test timeout
jest.setTimeout(30000);

console.log('🔧 Agent Engine test setup completed');