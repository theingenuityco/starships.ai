// Test setup - mock Neo4j service to prevent connection attempts
jest.mock('../src/services/AgentService', () => ({
  AgentService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    loadAgents: jest.fn().mockResolvedValue([]),
    getAgent: jest.fn().mockResolvedValue(undefined),
    createAgent: jest.fn(),
  },
})); 