// Test setup - mock Neo4j service to prevent connection attempts
jest.mock('../src/services/AgentService', () => ({
  AgentService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    loadAgents: jest.fn().mockResolvedValue([]),
    getAgent: jest.fn().mockResolvedValue(undefined),
    createAgent: jest.fn(),
  },
}));

jest.mock('@starships/models', () => ({
  createConnection: jest.fn(),
  getConnection: jest.fn(),
  RepositoryFactory: {
    getAgentRepository: jest.fn(() => ({
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    })),
    getLLMRepository: jest.fn(() => ({
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    }))
  }
})); 