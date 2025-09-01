/**
 * Jest setup file for models package tests
 */

import { BaseError, ValidationError, NotFoundError, DatabaseError, ConflictError } from '../helpers/errors';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn()
};

// Mock neo4j driver for database operations
const mockDriver = {
  session: jest.fn(() => ({
    run: jest.fn(),
    close: jest.fn(),
  })),
  close: jest.fn(),
};

// Global test utilities
(global as any).createMockDriver = () => mockDriver;

// Mock user data
(global as any).createMockUser = (overrides: any = {}) => ({
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  kindeId: 'kinde-123',
  displayName: 'Test User',
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Mock starship data
(global as any).createMockStarship = (overrides: any = {}) => ({
  id: 'starship-123',
  name: 'Test Starship',
  slug: 'test-starship',
  ownerId: 'user-123',
  class: 'scout',
  maxAgents: 3,
  maxActiveMissions: 3,
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Mock agent data
(global as any).createMockAgent = (overrides: any = {}) => ({
  id: 'agent-123',
  name: 'Test Agent',
  description: 'A test agent',
  type: 'assistant',
  starshipId: 'starship-123',
  userId: 'user-123',
  systemPrompt: 'You are a helpful assistant',
  configuration: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Mock session data
(global as any).createMockSession = (overrides: any = {}) => ({
  id: 'session-123',
  userId: 'user-123',
  starshipId: 'starship-123',
  agentId: 'agent-123',
  title: 'Test Session',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Mock message data
(global as any).createMockMessage = (overrides: any = {}) => ({
  id: 'message-123',
  sessionId: 'session-123',
  role: 'user',
  content: 'Hello, world!',
  timestamp: '2024-01-01T00:00:00.000Z',
  metadata: {},
  ...overrides
});

// Mock workflow/blueprint data
(global as any).createMockBlueprint = (overrides: any = {}) => ({
  id: 'blueprint-123',
  name: 'Test Blueprint',
  description: 'A test blueprint',
  userId: 'user-123',
  starshipId: 'starship-123',
  nodes: [],
  edges: [],
  metadata: {},
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Mock execution data
(global as any).createMockExecution = (overrides: any = {}) => ({
  id: 'execution-123',
  blueprintId: 'blueprint-123',
  starshipId: 'starship-123',
  userId: 'user-123',
  status: 'pending',
  startedAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  result: null,
  error: null,
  ...overrides
});

// Mock mission data
(global as any).createMockMission = (overrides: any = {}) => ({
  id: 'mission-123',
  title: 'Test Mission',
  description: 'A test mission',
  status: 'active',
  starshipId: 'starship-123',
  userId: 'user-123',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

// Error creation helpers
(global as any).createValidationError = (message = 'Validation failed', field = 'testField') => 
  new ValidationError(message, field);

(global as any).createNotFoundError = (entityType = 'TestEntity', entityId = 'test-123') =>
  new NotFoundError(`${entityType} not found`, entityType, entityId);

(global as any).createDatabaseError = (message = 'Database operation failed', operation = 'test') =>
  new DatabaseError(message, operation);

(global as any).createConflictError = (message = 'Resource conflict', conflictType = 'duplicate') =>
  new ConflictError(message, conflictType);

// Mock database session with common patterns
(global as any).createMockDatabaseSession = () => {
  const session = {
    run: jest.fn(),
    close: jest.fn(),
  };

  // Common return patterns for different query types
  session.run.mockImplementation((query: string) => {
    if (query.includes('CREATE')) {
      return Promise.resolve({ records: [] });
    }
    if (query.includes('MATCH')) {
      return Promise.resolve({ records: [] });
    }
    if (query.includes('DELETE')) {
      return Promise.resolve({ summary: { counters: { nodesDeleted: 1 } } });
    }
    return Promise.resolve({ records: [] });
  });

  return session;
};

// Mock repository error scenarios
(global as any).mockRepositoryError = (session: any, errorType: string) => {
  switch (errorType) {
    case 'constraint':
      session.run.mockRejectedValue(new Error('constraint violation'));
      break;
    case 'connection':
      session.run.mockRejectedValue(new Error('connection failed'));
      break;
    case 'timeout':
      session.run.mockRejectedValue(new Error('operation timeout'));
      break;
    case 'query':
      session.run.mockRejectedValue(new Error('syntax error in query'));
      break;
    default:
      session.run.mockRejectedValue(new Error('unknown database error'));
  }
};

// Mock successful repository operations
(global as any).mockRepositorySuccess = (session: any, data: any) => {
  session.run.mockResolvedValue({
    records: data ? [{ get: () => data }] : []
  });
};

// Setup common test timeouts
jest.setTimeout(10000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock UUID generation for predictable testing
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
}));