// Test setup - mock Neo4j service to prevent connection attempts
jest.mock('../src/services/Neo4jAgentService', () => ({
  Neo4jAgentService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    loadAgents: jest.fn().mockResolvedValue([]),
    getAgent: jest.fn().mockResolvedValue(undefined),
    createAgent: jest.fn(),
  },
})); 