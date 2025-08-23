// Test setup for Agent Engine

// Mock external dependencies
jest.mock('@starships/models', () => ({
  RepositoryFactory: {
    getAgentRepository: jest.fn(() => ({
      findById: jest.fn(),
      findAll: jest.fn()
    })),
    getLLMRepository: jest.fn(() => ({
      findById: jest.fn(),
      findAll: jest.fn()
    })),
    getStarshipRepository: jest.fn(() => ({
      findById: jest.fn(),
      findAll: jest.fn(),
      findByOwnerId: jest.fn()
    })),
    getVisionRepository: jest.fn(() => ({
      findByStarship: jest.fn(),
      save: jest.fn()
    })),
    getUserRepository: jest.fn(() => ({
      findByKindeId: jest.fn(),
      findById: jest.fn()
    }))
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